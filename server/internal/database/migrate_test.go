package database

import (
	"strings"
	"testing"
)

func TestLoadMigrationsIsOrderedAndUnique(t *testing.T) {
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("LoadMigrations: %v", err)
	}
	if len(migrations) == 0 {
		t.Fatal("no migrations are embedded; the binary cannot build a schema")
	}

	seen := map[int64]bool{}
	var previous int64
	for _, m := range migrations {
		if m.Version <= previous {
			t.Errorf("migration %s is out of order after version %d", m, previous)
		}
		if seen[m.Version] {
			t.Errorf("version %d appears twice", m.Version)
		}
		seen[m.Version] = true
		previous = m.Version

		if strings.TrimSpace(m.SQL) == "" {
			t.Errorf("migration %s is empty", m)
		}
		if len(m.Checksum) != 64 {
			t.Errorf("migration %s has checksum %q, want a sha256 hex digest", m, m.Checksum)
		}
	}
}

// 0001 has to be able to adopt a database that AutoMigrate built during Steps
// 1-6: those exist, they carry real configs, and they have no record of ever
// having been migrated. If a plain CREATE TABLE ever lands in this file, the
// first such deployment to upgrade fails its boot on "relation already exists"
// — and the failure arrives on a server that was working a minute earlier.
func TestInitialMigrationCanAdoptAnExistingDatabase(t *testing.T) {
	migrations, err := LoadMigrations()
	if err != nil {
		t.Fatalf("LoadMigrations: %v", err)
	}

	var init Migration
	for _, m := range migrations {
		if m.Version == 1 {
			init = m
		}
	}
	if init.Version != 1 {
		t.Fatal("there is no version 1")
	}

	upper := strings.ToUpper(stripComments(init.SQL))
	for _, statement := range []string{"CREATE TABLE", "CREATE INDEX", "CREATE UNIQUE INDEX"} {
		total := strings.Count(upper, statement)
		guarded := strings.Count(upper, statement+" IF NOT EXISTS")
		if total != guarded {
			t.Errorf("0001 has %d %q statements but only %d are IF NOT EXISTS",
				total, statement, guarded)
		}
	}

	// ADD CONSTRAINT has no IF NOT EXISTS, so each one has to sit in a block that
	// swallows the duplicate instead.
	if added, guarded := strings.Count(upper, "ADD CONSTRAINT"),
		strings.Count(upper, "EXCEPTION WHEN DUPLICATE_OBJECT"); added != guarded {
		t.Errorf("0001 adds %d constraints but guards only %d against already existing",
			added, guarded)
	}
}

// stripComments removes -- comments so that the checks above read SQL rather
// than the prose explaining it. Without this the file's own description of what
// ADD CONSTRAINT cannot do counts as an ADD CONSTRAINT.
func stripComments(sql string) string {
	lines := strings.Split(sql, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		if i := strings.Index(line, "--"); i >= 0 {
			line = line[:i]
		}
		kept = append(kept, line)
	}
	return strings.Join(kept, "\n")
}

// The checksum is what refuses to boot when an applied migration has been
// edited. It must react to SQL and to nothing else — a checkout that rewrote
// line endings changes no schema, and failing a deploy over it would be an
// outage nobody could explain.
func TestChecksumIgnoresLineEndings(t *testing.T) {
	const unix = "ALTER TABLE t ADD COLUMN c int;\nSELECT 1;\n"
	windows := strings.ReplaceAll(unix, "\n", "\r\n")

	if checksum(normaliseNewlines(unix)) != checksum(normaliseNewlines(windows)) {
		t.Error("the same SQL checksums differently depending on line endings")
	}
	if checksum(normaliseNewlines(unix)) == checksum(normaliseNewlines(unix+"DROP TABLE t;")) {
		t.Error("different SQL checksums the same")
	}
}

func TestParseFilename(t *testing.T) {
	valid := map[string]struct {
		version int64
		name    string
	}{
		"0001_init.sql":                     {1, "init"},
		"0002_subscription_constraints.sql": {2, "subscription_constraints"},
		"0123_a_longer_name.sql":            {123, "a_longer_name"},
	}
	for filename, want := range valid {
		version, name, err := parseFilename(filename)
		if err != nil {
			t.Errorf("parseFilename(%q): %v", filename, err)
			continue
		}
		if version != want.version || name != want.name {
			t.Errorf("parseFilename(%q) = %d, %q; want %d, %q",
				filename, version, name, want.version, want.name)
		}
	}

	// A file the runner cannot place in the sequence must be an error at load,
	// not something it quietly skips: a migration silently not running is the
	// worst outcome available here.
	for _, filename := range []string{
		"init.sql",       // no version
		"0001.sql",       // no name
		"0001_.sql",      // empty name
		"abc_init.sql",   // version is not a number
		"0000_start.sql", // versions start at 1
		"-1_back.sql",
	} {
		if _, _, err := parseFilename(filename); err == nil {
			t.Errorf("parseFilename(%q) was accepted", filename)
		}
	}
}
