package repository

import (
	"context"
	"errors"
	"testing"

	"mihomo-studio-server/internal/model"
)

// The same two-accounts fixture the server-config tests use, extended with a
// share repository and one config to hang links off.
type shareFixture struct {
	shares  *ServerConfigShareRepository
	configs *ServerConfigRepository
	alice   *model.User
	bob     *model.User
	aliceCf *model.ServerConfig
}

func twoUsersWithShares(t *testing.T) *shareFixture {
	t.Helper()

	tx := openTx(t)
	users := NewUserRepository(tx)
	ctx := context.Background()

	alice := &model.User{GithubID: 900000041, Login: "alice"}
	if err := users.UpsertByGithubID(ctx, alice); err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob := &model.User{GithubID: 900000042, Login: "bob"}
	if err := users.UpsertByGithubID(ctx, bob); err != nil {
		t.Fatalf("create bob: %v", err)
	}

	configs := NewServerConfigRepository(tx)
	aliceCf := newServerConfig(alice.ID, "alice's relay")
	if err := configs.Create(ctx, aliceCf); err != nil {
		t.Fatalf("create alice's config: %v", err)
	}

	return &shareFixture{
		shares: NewServerConfigShareRepository(tx), configs: configs,
		alice: alice, bob: bob, aliceCf: aliceCf,
	}
}

func (f *shareFixture) create(t *testing.T, userID, configID uint, shareType string) *model.ServerConfigShare {
	t.Helper()

	token, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	s := &model.ServerConfigShare{
		ServerConfigID: configID, UserID: userID,
		Token: token, ShareType: shareType,
	}
	if err := f.shares.Create(context.Background(), s); err != nil {
		t.Fatalf("create share: %v", err)
	}
	return s
}

// A share is a live credential, so the isolation property matters even more
// than it does for configs: B reading one would survive every future password
// change A makes.
func TestCrossUserServerShareAccessIsImpossible(t *testing.T) {
	f := twoUsersWithShares(t)
	ctx := context.Background()

	share := f.create(t, f.alice.ID, f.aliceCf.ID, model.ShareTypeFullServerYAML)

	if _, err := f.shares.FindByID(ctx, f.bob.ID, share.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bob read alice's share: err = %v, want ErrNotFound", err)
	}

	got, err := f.shares.ListByConfig(ctx, f.bob.ID, f.aliceCf.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("bob listed %d of alice's shares", len(got))
	}

	if err := f.shares.Revoke(ctx, f.bob.ID, share.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bob revoke alice's share: err = %v, want ErrNotFound", err)
	}

	if _, err := f.shares.FindByID(ctx, f.alice.ID, share.ID); err != nil {
		t.Fatalf("alice lost her own share after bob's attempts: %v", err)
	}
}

// Revocation must actually kill the public path, stay idempotent, and leave
// the row visible in its owner's list.
func TestServerShareRevokeKillsTheTokenAndStaysIdempotent(t *testing.T) {
	f := twoUsersWithShares(t)
	ctx := context.Background()

	share := f.create(t, f.alice.ID, f.aliceCf.ID, model.ShareTypeServerToClientProxies)

	// The token resolves while live.
	if _, err := f.shares.FindActiveByToken(ctx, share.Token); err != nil {
		t.Fatalf("live token did not resolve: %v", err)
	}

	// First revoke succeeds; the second reports why it changed nothing.
	if err := f.shares.Revoke(ctx, f.alice.ID, share.ID); err != nil {
		t.Fatalf("first revoke: %v", err)
	}
	if err := f.shares.Revoke(ctx, f.alice.ID, share.ID); !errors.Is(err, ErrRevoked) {
		t.Fatalf("second revoke: err = %v, want ErrRevoked", err)
	}

	// A revoked token is indistinguishable from one that never existed — that
	// is what keeps an anonymous caller from learning anything about the link.
	if _, err := f.shares.FindActiveByToken(ctx, share.Token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoked token resolved: err = %v, want ErrNotFound", err)
	}

	rows, err := f.shares.ListByConfig(ctx, f.alice.ID, f.aliceCf.ID)
	if err != nil {
		t.Fatalf("list after revoke: %v", err)
	}
	if len(rows) != 1 || rows[0].Active() {
		t.Fatalf("revoked share missing from its owner's list: %+v", rows)
	}
}

// A well-formed token that was never issued must not resolve, so the cheap
// shape filter in front of the database cannot be what makes lookup work.
func TestServerShareUnknownTokenIsNotFound(t *testing.T) {
	f := twoUsersWithShares(t)
	ctx := context.Background()

	token, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if _, err := f.shares.FindActiveByToken(ctx, token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown token: err = %v, want ErrNotFound", err)
	}
}
