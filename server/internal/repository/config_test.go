package repository

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"mihomo-studio-server/internal/model"
)

// Two accounts and a repository over the same rolled-back transaction. Every
// test in this file is a variation on "what can B do to A's data", which is the
// only question that matters here.
func twoUsers(t *testing.T) (*ConfigRepository, *model.User, *model.User) {
	t.Helper()

	tx := openTx(t)
	users := NewUserRepository(tx)
	ctx := context.Background()

	alice := &model.User{GithubID: 900000001, Login: "alice"}
	if err := users.UpsertByGithubID(ctx, alice); err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob := &model.User{GithubID: 900000002, Login: "bob"}
	if err := users.UpsertByGithubID(ctx, bob); err != nil {
		t.Fatalf("create bob: %v", err)
	}

	return NewConfigRepository(tx), alice, bob
}

func newConfig(userID uint, name string) *model.MihomoConfig {
	return &model.MihomoConfig{
		UserID:         userID,
		Name:           name,
		Description:    "original description",
		IR:             model.JSONB(`{"version":"1.0.0","proxies":[]}`),
		IRVersion:      "1.0.0",
		RenderedMihomo: "proxies: []\n",
	}
}

// The core security property of this service, stated as a test: everything B
// can attempt against A's config fails, and fails in the way that reveals
// nothing — the same ErrNotFound the handler turns into a 404, rather than a
// permission error that would confirm the row exists.
func TestCrossUserAccessIsImpossible(t *testing.T) {
	repo, alice, bob := twoUsers(t)
	ctx := context.Background()

	cfg := newConfig(alice.ID, "alice's home config")
	if err := repo.Create(ctx, cfg); err != nil {
		t.Fatalf("alice create: %v", err)
	}

	t.Run("read", func(t *testing.T) {
		if _, err := repo.FindByID(ctx, bob.ID, cfg.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("bob read alice's config: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("update", func(t *testing.T) {
		_, err := repo.Update(ctx, bob.ID, cfg.ID, map[string]any{"name": "stolen"})
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("bob update alice's config: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("delete", func(t *testing.T) {
		if err := repo.SoftDelete(ctx, bob.ID, cfg.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("bob delete alice's config: err = %v, want ErrNotFound", err)
		}
	})

	// The errors above would also be returned by a repository that reported
	// failure after writing. This is the part that proves nothing happened: an
	// UPDATE or DELETE missing its user_id filter matches the row, changes it,
	// and only then finds no rows to report — by which time the damage is done.
	after, err := repo.FindByID(ctx, alice.ID, cfg.ID)
	if err != nil {
		t.Fatalf("alice's config is gone after bob's attempts: %v", err)
	}
	if after.Name != "alice's home config" {
		t.Errorf("name changed to %q", after.Name)
	}
	if after.Description != "original description" {
		t.Errorf("description changed to %q", after.Description)
	}
}

func TestListReturnsOnlyTheCallersConfigs(t *testing.T) {
	repo, alice, bob := twoUsers(t)
	ctx := context.Background()

	for _, name := range []string{"work", "home"} {
		if err := repo.Create(ctx, newConfig(alice.ID, name)); err != nil {
			t.Fatalf("alice create %s: %v", name, err)
		}
	}
	if err := repo.Create(ctx, newConfig(bob.ID, "bob's only")); err != nil {
		t.Fatalf("bob create: %v", err)
	}

	aliceList, err := repo.ListByUser(ctx, alice.ID)
	if err != nil {
		t.Fatalf("list alice: %v", err)
	}
	if len(aliceList) != 2 {
		t.Fatalf("alice sees %d configs, want 2", len(aliceList))
	}

	bobList, err := repo.ListByUser(ctx, bob.ID)
	if err != nil {
		t.Fatalf("list bob: %v", err)
	}
	if len(bobList) != 1 || bobList[0].Name != "bob's only" {
		t.Fatalf("bob's list = %+v, want just his own", bobList)
	}

	// A user with nothing saved gets an empty list, not an error and not a null
	// the frontend would have to special-case.
	empty, err := repo.ListByUser(ctx, alice.ID+bob.ID+1000)
	if err != nil {
		t.Fatalf("list stranger: %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("a user with no configs sees %d", len(empty))
	}
}

// Names are unique per user, which means two people may both have a config
// called "home" — the obvious name for the most common config there is.
func TestNamesAreUniquePerUserNotGlobally(t *testing.T) {
	repo, alice, bob := twoUsers(t)
	ctx := context.Background()

	if err := repo.Create(ctx, newConfig(alice.ID, "home")); err != nil {
		t.Fatalf("alice create: %v", err)
	}
	if err := repo.Create(ctx, newConfig(bob.ID, "home")); err != nil {
		t.Fatalf("bob should be allowed the same name: %v", err)
	}
	if err := repo.Create(ctx, newConfig(alice.ID, "home")); !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("alice's duplicate: err = %v, want ErrDuplicateName", err)
	}
}

// The reason the unique index is partial. Without the WHERE clause a deleted
// config would hold its name forever, and the user would be told "home already
// exists" about a row they cannot see or remove.
func TestDeletedNameCanBeReused(t *testing.T) {
	repo, alice, _ := twoUsers(t)
	ctx := context.Background()

	first := newConfig(alice.ID, "home")
	if err := repo.Create(ctx, first); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := repo.SoftDelete(ctx, alice.ID, first.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if err := repo.Create(ctx, newConfig(alice.ID, "home")); err != nil {
		t.Fatalf("recreate under the freed name: %v", err)
	}
	// And the deleted one stays invisible to its own owner.
	if _, err := repo.FindByID(ctx, alice.ID, first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("soft-deleted config is still readable: %v", err)
	}
}

// PUT semantics: the editor sends the whole document, so an empty description
// means the user cleared it. GORM's struct-based Updates skips zero values,
// which would silently keep the old text — hence the map in the service.
func TestUpdateCanClearAField(t *testing.T) {
	repo, alice, _ := twoUsers(t)
	ctx := context.Background()

	cfg := newConfig(alice.ID, "home")
	if err := repo.Create(ctx, cfg); err != nil {
		t.Fatalf("create: %v", err)
	}

	updated, err := repo.Update(ctx, alice.ID, cfg.ID, map[string]any{
		"name":        "home v2",
		"description": "",
		"ir":          model.JSONB(`{"version":"1.0.0","proxies":[{"name":"n"}]}`),
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.Description != "" {
		t.Errorf("description = %q, want it cleared", updated.Description)
	}
	if updated.Name != "home v2" {
		t.Errorf("name = %q", updated.Name)
	}
	if !updated.UpdatedAt.After(cfg.CreatedAt) && !updated.UpdatedAt.Equal(cfg.CreatedAt) {
		t.Errorf("updated_at was not advanced: %v", updated.UpdatedAt)
	}
}

func TestCreateRefusesAnUnownedConfig(t *testing.T) {
	repo, _, _ := twoUsers(t)

	if err := repo.Create(context.Background(), newConfig(0, "orphan")); err == nil {
		t.Fatal("a config with no owner was created")
	}
}

func TestMissingConfigIsNotFound(t *testing.T) {
	repo, alice, _ := twoUsers(t)
	ctx := context.Background()

	if _, err := repo.FindByID(ctx, alice.ID, 2147483000); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if err := repo.SoftDelete(ctx, alice.ID, 2147483000); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// Guards the one thing a reader of ListByUser cannot check by eye: that the
// query still leaves the heavy columns behind. Nothing else in this file would
// notice if `ir` rejoined the column list — model.ConfigSummary has no field to
// put it in, so every list response would just quietly carry megabytes of it
// across the wire and back out of the database.
func TestListDoesNotFetchHeavyColumns(t *testing.T) {
	repo, alice, _ := twoUsers(t)

	statements := &sqlCapture{}
	watched := &ConfigRepository{db: repo.db.Session(&gorm.Session{Logger: statements})}

	if _, err := watched.ListByUser(context.Background(), alice.ID); err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(statements.sql) == 0 {
		t.Fatal("no SQL was captured; the test cannot prove anything")
	}

	for _, stmt := range statements.sql {
		// ir_version belongs in the summary; strip it so that a bare `ir` is
		// still visible to the word-boundary match below.
		cleaned := strings.ReplaceAll(stmt, "ir_version", "")
		for _, heavy := range []string{"ir", "rendered_mihomo", "rendered_singbox"} {
			if regexp.MustCompile(`\b` + heavy + `\b`).MatchString(cleaned) {
				t.Errorf("list query fetches %q: %s", heavy, stmt)
			}
		}
	}
}

// sqlCapture is a gorm logger that keeps the statements it is handed, so a test
// can assert on the query actually sent rather than on a copy of it.
type sqlCapture struct {
	sql []string
}

func (c *sqlCapture) LogMode(gormlogger.LogLevel) gormlogger.Interface { return c }
func (c *sqlCapture) Info(context.Context, string, ...any)             {}
func (c *sqlCapture) Warn(context.Context, string, ...any)             {}
func (c *sqlCapture) Error(context.Context, string, ...any)            {}
func (c *sqlCapture) Trace(_ context.Context, _ time.Time, fc func() (string, int64), _ error) {
	stmt, _ := fc()
	c.sql = append(c.sql, stmt)
}
