package repository

import (
	"context"
	"testing"

	"mihomo-studio-server/internal/model"
)

// Two accounts and a repository over one rolled-back transaction — the same
// fixture the config tests use, because the only question that matters here is
// again "what can B do to A's data".
func twoServerUsers(t *testing.T) (*ServerConfigRepository, *model.User, *model.User) {
	t.Helper()

	tx := openTx(t)
	users := NewUserRepository(tx)
	ctx := context.Background()

	alice := &model.User{GithubID: 900000021, Login: "alice"}
	if err := users.UpsertByGithubID(ctx, alice); err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob := &model.User{GithubID: 900000022, Login: "bob"}
	if err := users.UpsertByGithubID(ctx, bob); err != nil {
		t.Fatalf("create bob: %v", err)
	}

	return NewServerConfigRepository(tx), alice, bob
}

func newServerConfig(userID uint, name string) *model.ServerConfig {
	return &model.ServerConfig{
		UserID: userID,
		Name:   name,
		IR:     model.JSONB(`{"schemaVersion":1,"dns":{"enable":false},"listeners":[]}`),
	}
}

func TestServerConfigCrossUserAccessIsImpossible(t *testing.T) {
	repo, alice, bob := twoServerUsers(t)
	ctx := context.Background()

	cfg := newServerConfig(alice.ID, "relay")
	if err := repo.Create(ctx, cfg); err != nil {
		t.Fatalf("alice create: %v", err)
	}

	if _, err := repo.FindByID(ctx, bob.ID, cfg.ID); err != ErrNotFound {
		t.Fatalf("bob reading alice's config: got %v, want ErrNotFound", err)
	}
	if err := repo.SoftDelete(ctx, bob.ID, cfg.ID); err != ErrNotFound {
		t.Fatalf("bob deleting alice's config: got %v, want ErrNotFound", err)
	}
	if _, err := repo.Update(ctx, bob.ID, cfg.ID, map[string]any{"name": "stolen"}); err != ErrNotFound {
		t.Fatalf("bob renaming alice's config: got %v, want ErrNotFound", err)
	}
	if _, err := repo.FindByID(ctx, alice.ID, cfg.ID); err != nil {
		t.Fatalf("alice lost her own config: %v", err)
	}
}

// The unique index speaks through ErrDuplicateName. This must be the last
// statement of its transaction: a violated constraint aborts the PostgreSQL
// transaction, so nothing else can run in it afterwards — which is why the
// name-reuse case lives in its own test.
func TestServerConfigDuplicateNameRejected(t *testing.T) {
	repo, alice, _ := twoServerUsers(t)
	ctx := context.Background()

	if err := repo.Create(ctx, newServerConfig(alice.ID, "edge")); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if err := repo.Create(ctx, newServerConfig(alice.ID, "edge")); err != ErrDuplicateName {
		t.Fatalf("duplicate name: got %v, want ErrDuplicateName", err)
	}
}

// The reason the unique index is partial: a soft-deleted config must free its
// name immediately.
func TestDeletedServerConfigNameCanBeReused(t *testing.T) {
	repo, alice, _ := twoServerUsers(t)
	ctx := context.Background()

	first := newServerConfig(alice.ID, "edge")
	if err := repo.Create(ctx, first); err != nil {
		t.Fatalf("create: %v", err)
	}
	if err := repo.SoftDelete(ctx, alice.ID, first.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	if err := repo.Create(ctx, newServerConfig(alice.ID, "edge")); err != nil {
		t.Fatalf("re-create under the freed name: %v", err)
	}
	// And the deleted one stays invisible to its own owner.
	if _, err := repo.FindByID(ctx, alice.ID, first.ID); err != ErrNotFound {
		t.Fatalf("soft-deleted config is still readable: %v", err)
	}
}

func TestServerConfigCreateRefusesNoOwner(t *testing.T) {
	repo, _, _ := twoServerUsers(t)
	ctx := context.Background()

	if err := repo.Create(ctx, newServerConfig(0, "orphan")); err == nil {
		t.Fatal("created a config with no owner")
	}
}

func TestServerConfigListExcludesIR(t *testing.T) {
	repo, alice, _ := twoServerUsers(t)
	ctx := context.Background()

	if err := repo.Create(ctx, newServerConfig(alice.ID, "one")); err != nil {
		t.Fatalf("create: %v", err)
	}
	summaries, err := repo.ListByUser(ctx, alice.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("got %d summaries, want 1", len(summaries))
	}
}
