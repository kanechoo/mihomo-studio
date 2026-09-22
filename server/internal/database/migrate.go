package database

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// The schema, as a sequence of numbered files applied in order and recorded in
// the database. Embedded rather than read from disk so the binary carries its
// own schema — a container image with no source tree beside it still migrates,
// and a deployment cannot pick up a half-copied migrations directory.
//
//go:embed migrations/*.sql
var migrationFiles embed.FS

const migrationsDir = "migrations"

// advisoryLockKey is a constant this service invented, spelling "mhmgrate" in
// ASCII. PostgreSQL advisory locks share one global namespace per database, so
// the value only has to be one no other application would pick.
const advisoryLockKey int64 = 0x6d686d6772617465

// Long enough for another instance to finish an ordinary migration, short
// enough that a lock nobody will ever release fails the boot instead of hanging
// it. Only acquisition is bounded; a migration that has started runs to
// completion.
const lockAcquireTimeout = 60 * time.Second

// Migration is one embedded file, ready to apply.
type Migration struct {
	Version  int64
	Name     string
	SQL      string
	Checksum string
}

func (m Migration) String() string { return fmt.Sprintf("%04d_%s", m.Version, m.Name) }

// Applied is one row of schema_migrations.
type Applied struct {
	Version   int64
	Name      string
	Checksum  string
	AppliedAt time.Time
}

// Status pairs what the binary carries with what the database has recorded, for
// the `migrate status` command.
type Status struct {
	Version int64
	Name    string
	// Applied is nil when the migration is pending.
	Applied *Applied
	// Orphan marks a version recorded in the database that this binary does not
	// carry — the database is ahead of the code.
	Orphan bool
}

// Result summarises what Migrate did, so the boot log can say something more
// useful than "migrations applied".
type Result struct {
	Applied []Migration
	// AlreadyCurrent counts versions that were recorded before this run.
	AlreadyCurrent int
	// Orphans are versions the database has and this binary does not.
	Orphans []int64
}

const createMigrationsTable = `
	CREATE TABLE IF NOT EXISTS schema_migrations (
		version    bigint PRIMARY KEY,
		name       text NOT NULL,
		checksum   text NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`

// Migrate brings the schema up to date and returns what it did.
//
// Replaces the AutoMigrate call that carried Steps 1-6. AutoMigrate reads the
// Go structs and makes the database resemble them, which is convenient exactly
// until it is not: it never drops or narrows a column, so a rename silently
// becomes an extra column carrying nobody's data; it cannot express a partial
// index, a CHECK, or a backfill; and it offers no answer to "which schema is
// this database on", which is the first question worth asking about a database
// holding other people's data.
//
// Every statement runs on one pooled connection under a PostgreSQL advisory
// lock, so two instances starting together — a rolling deploy, or Compose
// bringing up two replicas — cannot both decide the same migration is pending.
func Migrate(ctx context.Context, db *gorm.DB) (*Result, error) {
	migrations, err := LoadMigrations()
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("access underlying sql.DB: %w", err)
	}

	// A dedicated connection, not the pool: an advisory lock belongs to the
	// session that took it, and db.ExecContext is free to hand each statement a
	// different session — which would take the lock on one connection and release
	// it from another that never held it.
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("reserve a connection for migrations: %w", err)
	}
	defer func() { _ = conn.Close() }()

	if err := acquireLock(ctx, conn); err != nil {
		return nil, err
	}
	defer releaseLock(conn)

	if _, err := conn.ExecContext(ctx, createMigrationsTable); err != nil {
		return nil, fmt.Errorf("create schema_migrations: %w", err)
	}

	applied, err := loadApplied(ctx, conn)
	if err != nil {
		return nil, err
	}

	result := &Result{Orphans: orphanVersions(applied, migrations)}

	var maxApplied int64
	for version := range applied {
		if version > maxApplied {
			maxApplied = version
		}
	}

	for _, m := range migrations {
		if prev, ok := applied[m.Version]; ok {
			// A file edited after it was applied is the failure versioned
			// migrations exist to catch. Every database that already ran it has the
			// old schema, every one that has not will get the new — and nothing
			// downstream can tell the two apart.
			if prev.Checksum != m.Checksum {
				return nil, fmt.Errorf(
					"migration %s has changed since it was applied on %s (recorded %s, file is now %s); "+
						"add a new migration instead of editing this one",
					m, prev.AppliedAt.Format(time.RFC3339), short(prev.Checksum), short(m.Checksum))
			}
			result.AlreadyCurrent++
			continue
		}

		// Out-of-order arrival: someone added 0003 while 0004 was already applied
		// here. Running it now would produce a schema that no single ordering ever
		// produced, which is worse than refusing.
		if m.Version < maxApplied {
			return nil, fmt.Errorf(
				"migration %s is pending but version %d is already applied; "+
					"renumber it above the highest applied version",
				m, maxApplied)
		}

		if err := apply(ctx, conn, m); err != nil {
			return nil, err
		}
		result.Applied = append(result.Applied, m)
		maxApplied = m.Version
	}

	return result, nil
}

// apply runs one migration and records it, both or neither.
//
// PostgreSQL has transactional DDL, so a migration that fails halfway leaves no
// trace — the alternative, a database carrying half of version 5 and no record
// of it, is one nobody can migrate forward or back without a manual repair.
func apply(ctx context.Context, conn *sql.Conn, m Migration) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin %s: %w", m, err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, m.SQL); err != nil {
		return fmt.Errorf("apply %s: %w", m, err)
	}

	const record = `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)`
	if _, err := tx.ExecContext(ctx, record, m.Version, m.Name, m.Checksum); err != nil {
		return fmt.Errorf("record %s: %w", m, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit %s: %w", m, err)
	}
	return nil
}

func acquireLock(ctx context.Context, conn *sql.Conn) error {
	lockCtx, cancel := context.WithTimeout(ctx, lockAcquireTimeout)
	defer cancel()

	if _, err := conn.ExecContext(lockCtx, `SELECT pg_advisory_lock($1)`, advisoryLockKey); err != nil {
		return fmt.Errorf("acquire the migration lock (another instance may be migrating): %w", err)
	}
	return nil
}

// releaseLock uses a fresh context because the caller's may already be done —
// a cancelled boot still has to give the lock back, or the next start waits out
// the full timeout for a lock nobody holds.
func releaseLock(conn *sql.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_unlock($1)`, advisoryLockKey); err != nil {
		// Not fatal: closing the connection ends the session, and PostgreSQL
		// releases session locks with it.
		slog.Warn("could not release the migration lock", slog.String("err", err.Error()))
	}
}

func loadApplied(ctx context.Context, conn *sql.Conn) (map[int64]Applied, error) {
	rows, err := conn.QueryContext(ctx,
		`SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version`)
	if err != nil {
		return nil, fmt.Errorf("read schema_migrations: %w", err)
	}
	defer func() { _ = rows.Close() }()

	out := make(map[int64]Applied)
	for rows.Next() {
		var a Applied
		if err := rows.Scan(&a.Version, &a.Name, &a.Checksum, &a.AppliedAt); err != nil {
			return nil, fmt.Errorf("scan schema_migrations: %w", err)
		}
		out[a.Version] = a
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read schema_migrations: %w", err)
	}
	return out, nil
}

// Report pairs the embedded migrations with the recorded ones, newest last. It
// backs `migrate status`, and reads the database without changing it.
func Report(ctx context.Context, db *gorm.DB) ([]Status, error) {
	migrations, err := LoadMigrations()
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("access underlying sql.DB: %w", err)
	}
	conn, err := sqlDB.Conn(ctx)
	if err != nil {
		return nil, fmt.Errorf("reserve a connection: %w", err)
	}
	defer func() { _ = conn.Close() }()

	// Absent table means nothing has ever been applied, which is a state worth
	// reporting rather than an error — it is what a fresh database looks like.
	var exists bool
	const q = `SELECT to_regclass('public.schema_migrations') IS NOT NULL`
	if err := conn.QueryRowContext(ctx, q).Scan(&exists); err != nil {
		return nil, fmt.Errorf("look for schema_migrations: %w", err)
	}

	applied := map[int64]Applied{}
	if exists {
		if applied, err = loadApplied(ctx, conn); err != nil {
			return nil, err
		}
	}

	statuses := make([]Status, 0, len(migrations))
	for _, m := range migrations {
		s := Status{Version: m.Version, Name: m.Name}
		if a, ok := applied[m.Version]; ok {
			row := a
			s.Applied = &row
		}
		statuses = append(statuses, s)
	}
	for _, version := range orphanVersions(applied, migrations) {
		a := applied[version]
		row := a
		statuses = append(statuses, Status{
			Version: version, Name: a.Name, Applied: &row, Orphan: true,
		})
	}

	sort.Slice(statuses, func(i, j int) bool { return statuses[i].Version < statuses[j].Version })
	return statuses, nil
}

// orphanVersions lists versions the database has recorded that this binary does
// not carry. That means the database was migrated by a newer build than the one
// now running — a rolled-back deploy, most likely — and the running code may
// expect a schema that no longer exists.
func orphanVersions(applied map[int64]Applied, migrations []Migration) []int64 {
	known := make(map[int64]struct{}, len(migrations))
	for _, m := range migrations {
		known[m.Version] = struct{}{}
	}

	var orphans []int64
	for version := range applied {
		if _, ok := known[version]; !ok {
			orphans = append(orphans, version)
		}
	}
	sort.Slice(orphans, func(i, j int) bool { return orphans[i] < orphans[j] })
	return orphans
}

// LoadMigrations reads and validates the embedded files. Exported so a test can
// assert on the set without touching a database.
func LoadMigrations() ([]Migration, error) {
	entries, err := fs.ReadDir(migrationFiles, migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}

	migrations := make([]Migration, 0, len(entries))
	seen := make(map[int64]string, len(entries))

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		version, name, err := parseFilename(entry.Name())
		if err != nil {
			return nil, err
		}
		if other, dup := seen[version]; dup {
			return nil, fmt.Errorf("migrations %s and %s share version %d", other, entry.Name(), version)
		}
		seen[version] = entry.Name()

		body, err := migrationFiles.ReadFile(migrationsDir + "/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", entry.Name(), err)
		}
		sqlText := normaliseNewlines(string(body))
		if strings.TrimSpace(sqlText) == "" {
			return nil, fmt.Errorf("migration %s is empty", entry.Name())
		}

		migrations = append(migrations, Migration{
			Version:  version,
			Name:     name,
			SQL:      sqlText,
			Checksum: checksum(sqlText),
		})
	}

	if len(migrations) == 0 {
		return nil, fmt.Errorf("no migrations are embedded in this binary")
	}

	sort.Slice(migrations, func(i, j int) bool { return migrations[i].Version < migrations[j].Version })
	return migrations, nil
}

// parseFilename splits NNNN_some_name.sql into its version and its name.
func parseFilename(filename string) (int64, string, error) {
	base := strings.TrimSuffix(filename, ".sql")
	digits, name, found := strings.Cut(base, "_")
	if !found || name == "" {
		return 0, "", fmt.Errorf("migration %q is not named NNNN_description.sql", filename)
	}

	version, err := strconv.ParseInt(digits, 10, 64)
	if err != nil {
		return 0, "", fmt.Errorf("migration %q does not start with a version number: %w", filename, err)
	}
	if version <= 0 {
		return 0, "", fmt.Errorf("migration %q has version %d; versions start at 1", filename, version)
	}
	return version, name, nil
}

// normaliseNewlines keeps the checksum from depending on line endings. An editor
// or a git checkout that rewrites CRLF changes no SQL, and failing the boot over
// it would be an unexplainable outage.
func normaliseNewlines(s string) string {
	return strings.ReplaceAll(s, "\r\n", "\n")
}

func checksum(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func short(sum string) string {
	if len(sum) <= 12 {
		return sum
	}
	return sum[:12]
}
