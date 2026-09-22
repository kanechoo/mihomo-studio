package repository

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gorm.io/gorm"

	"mihomo-studio-server/internal/model"
)

// The same two-accounts fixture the config tests use, extended with a
// subscription repository and one config per user to hang URLs off.
type subFixture struct {
	subs    *SubscriptionRepository
	configs *ConfigRepository
	alice   *model.User
	bob     *model.User
	aliceCf *model.MihomoConfig
	bobCf   *model.MihomoConfig
}

func twoUsersWithSubs(t *testing.T) *subFixture {
	t.Helper()

	tx := openTx(t)
	users := NewUserRepository(tx)
	ctx := context.Background()

	alice := &model.User{GithubID: 900000011, Login: "alice"}
	if err := users.UpsertByGithubID(ctx, alice); err != nil {
		t.Fatalf("create alice: %v", err)
	}
	bob := &model.User{GithubID: 900000012, Login: "bob"}
	if err := users.UpsertByGithubID(ctx, bob); err != nil {
		t.Fatalf("create bob: %v", err)
	}

	configs := NewConfigRepository(tx)
	aliceCf := newConfig(alice.ID, "alice's config")
	if err := configs.Create(ctx, aliceCf); err != nil {
		t.Fatalf("create alice's config: %v", err)
	}
	bobCf := newConfig(bob.ID, "bob's config")
	if err := configs.Create(ctx, bobCf); err != nil {
		t.Fatalf("create bob's config: %v", err)
	}

	return &subFixture{
		subs: NewSubscriptionRepository(tx), configs: configs,
		alice: alice, bob: bob, aliceCf: aliceCf, bobCf: bobCf,
	}
}

func (f *subFixture) bind(t *testing.T, userID, configID uint, label string) *model.Subscription {
	t.Helper()

	token, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	s := &model.Subscription{
		ConfigID: configID, UserID: userID,
		Token: token, Format: model.FormatMihomo, Label: label,
	}
	if err := f.subs.Create(context.Background(), s); err != nil {
		t.Fatalf("create subscription: %v", err)
	}
	return s
}

// The isolation property restated for subscriptions. A subscription is a live
// credential, so B being able to read one would be worse than B reading a
// config: it would survive every future password change A makes.
func TestCrossUserSubscriptionAccessIsImpossible(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "alice's phone")

	t.Run("read", func(t *testing.T) {
		if _, err := f.subs.FindByID(ctx, f.bob.ID, sub.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("bob read alice's subscription: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("list", func(t *testing.T) {
		// Bob naming Alice's config id. The repository must not answer with her
		// rows just because the config_id matches.
		got, err := f.subs.ListByConfig(ctx, f.bob.ID, f.aliceCf.ID)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(got) != 0 {
			t.Fatalf("bob listed %d of alice's subscriptions", len(got))
		}
	})

	t.Run("rotate", func(t *testing.T) {
		if _, err := f.subs.RotateToken(ctx, f.bob.ID, sub.ID, "bobs-new-token"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("bob rotate alice's subscription: err = %v, want ErrNotFound", err)
		}
	})

	t.Run("revoke", func(t *testing.T) {
		if err := f.subs.Revoke(ctx, f.bob.ID, sub.ID); !errors.Is(err, ErrNotFound) {
			t.Fatalf("bob revoke alice's subscription: err = %v, want ErrNotFound", err)
		}
	})

	// As in the config tests: the errors above prove the calls were refused, and
	// this proves nothing was written before the refusal was reported. A rotate
	// missing its user_id filter would have changed the token — and Alice's URL
	// would be dead with no message telling her why.
	after, err := f.subs.FindByID(ctx, f.alice.ID, sub.ID)
	if err != nil {
		t.Fatalf("alice's subscription is gone after bob's attempts: %v", err)
	}
	if after.Token != sub.Token {
		t.Errorf("token changed from %q to %q", sub.Token, after.Token)
	}
	if !after.Active() {
		t.Error("subscription was revoked by bob's attempt")
	}
}

// The public path's isolation, which is the one that matters most: the token is
// resolved with no user in hand, so the row it lands on has to be the only thing
// deciding whose config gets served.
func TestTokenResolvesToItsOwnerOnly(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	aliceSub := f.bind(t, f.alice.ID, f.aliceCf.ID, "alice's phone")
	bobSub := f.bind(t, f.bob.ID, f.bobCf.ID, "bob's laptop")

	found, err := f.subs.FindActiveByToken(ctx, aliceSub.Token)
	if err != nil {
		t.Fatalf("resolve alice's token: %v", err)
	}
	if found.UserID != f.alice.ID || found.ConfigID != f.aliceCf.ID {
		t.Fatalf("alice's token resolved to user %d config %d, want user %d config %d",
			found.UserID, found.ConfigID, f.alice.ID, f.aliceCf.ID)
	}

	// The step the service performs next, spelled out here: the config is loaded
	// with the subscription's own user as the tenant. Bob's config is not
	// reachable through Alice's token even by naming its id directly.
	if _, err := f.configs.FindByID(ctx, found.UserID, f.bobCf.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("alice's token reached bob's config: err = %v, want ErrNotFound", err)
	}

	if bobSub.Token == aliceSub.Token {
		t.Fatal("two subscriptions were issued the same token")
	}
}

// Revoking has to kill the URL, not just hide the row from the list. This is
// the difference between a revoke button that works and one that lies.
func TestRevokedTokenStopsResolving(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "lost phone")
	if _, err := f.subs.FindActiveByToken(ctx, sub.Token); err != nil {
		t.Fatalf("token does not resolve before revocation: %v", err)
	}

	if err := f.subs.Revoke(ctx, f.alice.ID, sub.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	if _, err := f.subs.FindActiveByToken(ctx, sub.Token); !errors.Is(err, ErrNotFound) {
		t.Fatalf("revoked token still resolves: err = %v, want ErrNotFound", err)
	}

	// Still visible to its owner, and still marked revoked — "I turned that one
	// off last week" is a question the list has to be able to answer.
	after, err := f.subs.FindByID(ctx, f.alice.ID, sub.ID)
	if err != nil {
		t.Fatalf("revoked subscription vanished from its owner: %v", err)
	}
	if after.Active() {
		t.Error("revoked_at was not set")
	}
}

// Revoke is the endpoint most likely to be retried — a user hits it because
// something has leaked, and a failure would send them looking for a problem
// that no longer exists.
func TestRevokeIsIdempotent(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "")
	if err := f.subs.Revoke(ctx, f.alice.ID, sub.ID); err != nil {
		t.Fatalf("first revoke: %v", err)
	}
	if err := f.subs.Revoke(ctx, f.alice.ID, sub.ID); err != nil {
		t.Fatalf("second revoke: %v, want nil", err)
	}

	// Idempotent about the outcome, not about the timestamp: the first
	// revocation is the one that happened.
	after, err := f.subs.FindByID(ctx, f.alice.ID, sub.ID)
	if err != nil {
		t.Fatalf("find after double revoke: %v", err)
	}
	if after.Active() {
		t.Error("subscription is active after being revoked twice")
	}
}

// Rotation is the response to a leaked URL, so the old token has to die in the
// same statement that mints the new one.
func TestRotateKillsTheOldToken(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "shared by mistake")
	old := sub.Token

	fresh, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	rotated, err := f.subs.RotateToken(ctx, f.alice.ID, sub.ID, fresh)
	if err != nil {
		t.Fatalf("rotate: %v", err)
	}
	if rotated.Token != fresh {
		t.Fatalf("rotate returned token %q, want the new one", rotated.Token)
	}

	if _, err := f.subs.FindActiveByToken(ctx, old); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the leaked token still resolves: err = %v, want ErrNotFound", err)
	}
	if _, err := f.subs.FindActiveByToken(ctx, fresh); err != nil {
		t.Fatalf("the new token does not resolve: %v", err)
	}

	// The label and the history survive; that is what makes rotation different
	// from revoke-and-rebind.
	if rotated.Label != "shared by mistake" {
		t.Errorf("label lost in rotation: %q", rotated.Label)
	}
	if rotated.ID != sub.ID {
		t.Errorf("rotation created a new row: id %d, want %d", rotated.ID, sub.ID)
	}
}

// Rotating something already switched off would hand back a working URL for a
// subscription its owner believes is dead.
func TestRotateRefusesARevokedSubscription(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "")
	if err := f.subs.Revoke(ctx, f.alice.ID, sub.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}

	fresh, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if _, err := f.subs.RotateToken(ctx, f.alice.ID, sub.ID, fresh); !errors.Is(err, ErrRevoked) {
		t.Fatalf("rotate on a revoked subscription: err = %v, want ErrRevoked", err)
	}
	if _, err := f.subs.FindActiveByToken(ctx, fresh); !errors.Is(err, ErrNotFound) {
		t.Fatal("the refused rotation still wrote its token")
	}
}

// Deleting a config has to take its URLs with it. Otherwise the delete button
// leaves live links to a config the user believes is gone — and, unlike a
// revoked one, they can no longer see it to revoke it.
func TestDeletingAConfigStopsItsSubscriptions(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "")
	if err := f.configs.SoftDelete(ctx, f.alice.ID, f.aliceCf.ID); err != nil {
		t.Fatalf("delete config: %v", err)
	}

	// The subscription row is untouched — a soft delete is reversible, and
	// revoking its URLs would not be.
	found, err := f.subs.FindActiveByToken(ctx, sub.Token)
	if err != nil {
		t.Fatalf("subscription row disappeared: %v", err)
	}

	// What stops is the config lookup, through GORM's default soft-delete scope.
	// That is the step the service performs after resolving a token, so the
	// public endpoint answers 404 without anything having to hunt down and
	// revoke each URL.
	if _, err := f.configs.FindByID(ctx, found.UserID, found.ConfigID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted config still loads: err = %v, want ErrNotFound", err)
	}
}

// Telemetry runs on the hottest path in the service, so it must not look like
// an edit. Bumping updated_at on every poll would make a subscription nobody
// has touched in months sort to the top of the list every few minutes.
func TestRecordAccessCountsWithoutTouchingUpdatedAt(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "")
	before, err := f.subs.FindByID(ctx, f.alice.ID, sub.ID)
	if err != nil {
		t.Fatalf("find: %v", err)
	}

	for i := 0; i < 3; i++ {
		if err := f.subs.RecordAccess(ctx, sub.ID, "mihomo/1.18.0"); err != nil {
			t.Fatalf("record access %d: %v", i, err)
		}
	}

	after, err := f.subs.FindByID(ctx, f.alice.ID, sub.ID)
	if err != nil {
		t.Fatalf("find after: %v", err)
	}
	if after.AccessCount != 3 {
		t.Errorf("access_count = %d, want 3", after.AccessCount)
	}
	if after.LastAccessAt == nil {
		t.Error("last_access_at was not stamped")
	}
	if after.LastUserAgent != "mihomo/1.18.0" {
		t.Errorf("last_user_agent = %q", after.LastUserAgent)
	}
	if !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Errorf("updated_at moved from %s to %s; a poll is not an edit",
			before.UpdatedAt, after.UpdatedAt)
	}
}

// The User-Agent is an unbounded attacker-controlled header and the column is
// varchar(255). Without clipping, one long header turns every fetch from that
// client into a failed write.
func TestRecordAccessClipsALongUserAgent(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	sub := f.bind(t, f.alice.ID, f.aliceCf.ID, "")
	if err := f.subs.RecordAccess(ctx, sub.ID, strings.Repeat("A", 5000)); err != nil {
		t.Fatalf("record access with a long user-agent: %v", err)
	}

	after, err := f.subs.FindByID(ctx, f.alice.ID, sub.ID)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if len([]rune(after.LastUserAgent)) != model.MaxUserAgentLen {
		t.Errorf("user agent stored as %d runes, want %d",
			len([]rune(after.LastUserAgent)), model.MaxUserAgentLen)
	}
}

// One config, several devices, each independently revocable — the reason
// subscriptions are their own table instead of a token column on the config.
func TestOneConfigCarriesSeveralIndependentTokens(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	phone := f.bind(t, f.alice.ID, f.aliceCf.ID, "phone")
	laptop := f.bind(t, f.alice.ID, f.aliceCf.ID, "laptop")

	if err := f.subs.Revoke(ctx, f.alice.ID, phone.ID); err != nil {
		t.Fatalf("revoke the phone: %v", err)
	}

	if _, err := f.subs.FindActiveByToken(ctx, phone.Token); !errors.Is(err, ErrNotFound) {
		t.Error("the lost phone's URL still works")
	}
	if _, err := f.subs.FindActiveByToken(ctx, laptop.Token); err != nil {
		t.Errorf("the laptop's URL broke when the phone was cut off: %v", err)
	}

	// Both stay in the list, so the revoked one is visible as revoked.
	all, err := f.subs.ListByConfig(ctx, f.alice.ID, f.aliceCf.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("list returned %d subscriptions, want 2", len(all))
	}

	active, err := f.subs.CountActiveByConfig(ctx, f.alice.ID, f.aliceCf.ID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if active != 1 {
		t.Errorf("active count = %d, want 1", active)
	}
}

// A token is a bearer credential, so two of them being equal is a user reading
// someone else's proxies. This does not test crypto/rand — it checks that
// nothing between the generator and the column collapses the value.
func TestTokensAreUniqueAndUrlSafe(t *testing.T) {
	f := twoUsersWithSubs(t)

	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		s := f.bind(t, f.alice.ID, f.aliceCf.ID, "")
		if seen[s.Token] {
			t.Fatalf("duplicate token issued: %q", s.Token)
		}
		seen[s.Token] = true

		if !model.TokenLooksWellFormed(s.Token) {
			t.Fatalf("token %q is not URL-safe base64 of the expected length", s.Token)
		}
	}
}

// The database is the backstop under the uniqueness above: a bug that reused a
// token must fail the insert rather than silently repoint an existing URL.
func TestDuplicateTokenIsRejectedByTheDatabase(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	first := f.bind(t, f.alice.ID, f.aliceCf.ID, "")

	clash := &model.Subscription{
		ConfigID: f.bobCf.ID, UserID: f.bob.ID,
		Token: first.Token, Format: model.FormatMihomo,
	}
	err := f.subs.Create(ctx, clash)
	if err == nil {
		t.Fatal("a second subscription was created with an existing token")
	}
	if !errors.Is(err, gorm.ErrDuplicatedKey) {
		// The wrapped message is checked rather than the type alone, so the test
		// still means something if TranslateError is ever turned off.
		if !strings.Contains(err.Error(), "duplicate") && !strings.Contains(err.Error(), "unique") {
			t.Fatalf("duplicate token rejected with an unexpected error: %v", err)
		}
	}
}

func TestMissingSubscriptionIsNotFound(t *testing.T) {
	f := twoUsersWithSubs(t)
	ctx := context.Background()

	if _, err := f.subs.FindByID(ctx, f.alice.ID, 99999999); !errors.Is(err, ErrNotFound) {
		t.Errorf("FindByID on a missing id: err = %v, want ErrNotFound", err)
	}
	if err := f.subs.Revoke(ctx, f.alice.ID, 99999999); !errors.Is(err, ErrNotFound) {
		t.Errorf("Revoke on a missing id: err = %v, want ErrNotFound", err)
	}

	token, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if _, err := f.subs.FindActiveByToken(ctx, token); !errors.Is(err, ErrNotFound) {
		t.Errorf("FindActiveByToken on an unissued token: err = %v, want ErrNotFound", err)
	}
}

// Create refuses a row that no user could ever revoke.
func TestCreateRefusesAnUnownedSubscription(t *testing.T) {
	f := twoUsersWithSubs(t)

	if err := f.subs.Create(context.Background(), &model.Subscription{
		ConfigID: f.aliceCf.ID, Token: "orphan", Format: model.FormatMihomo,
	}); err == nil {
		t.Error("created a subscription with no owner")
	}
}
