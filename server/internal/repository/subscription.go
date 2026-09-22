package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"mihomo-studio-server/internal/model"
)

// ErrRevoked separates "this subscription is dead" from "this subscription is
// not yours". Both are refusals, but the first names a row the user can still
// see in their own list, so answering it with a 404 would be a lie they can
// disprove by looking at the screen.
var ErrRevoked = errors.New("subscription has been revoked")

// SubscriptionRepository is the sole route from the API to subscriptions.
//
// Same rule as ConfigRepository: every method that acts on behalf of a signed-in
// user takes userID and folds it into the WHERE clause. Two methods deliberately
// do not, and both are documented where they are defined — they serve the public
// endpoint, which has a token instead of a session.
type SubscriptionRepository struct {
	db *gorm.DB
}

func NewSubscriptionRepository(db *gorm.DB) *SubscriptionRepository {
	return &SubscriptionRepository{db: db}
}

func (r *SubscriptionRepository) scoped(ctx context.Context, userID uint) *gorm.DB {
	return r.db.WithContext(ctx).Model(&model.Subscription{}).Where("user_id = ?", userID)
}

// unlogged is the connection to use for any statement whose text contains a
// token.
//
// GORM's logger interpolates parameters into the SQL it prints, so
// `WHERE token = '...'` reaches the log with the credential in it. The Logger
// middleware already rewrites /sub/{token} to /sub/<token> for exactly this
// reason, and it would be pointless if the same secret arrived one line later
// inside a SELECT.
//
// Turning statement logging off globally is not the fix: it is genuinely useful
// during development, and the leak would come back the first time someone
// switched it on. Nor is relying on the production log level — that silences
// successful queries, but a statement crossing the slow-query threshold, or one
// that errors, is printed at every level. Silencing the three statements that
// carry a token closes the path in both environments and leaves every other
// query as loud as it was.
func (r *SubscriptionRepository) unlogged(ctx context.Context) *gorm.DB {
	return r.db.WithContext(ctx).Session(&gorm.Session{
		Logger: r.db.Logger.LogMode(gormlogger.Silent),
	})
}

// ListByConfig returns every subscription on one config, revoked ones included.
//
// Revoked rows stay in the list on purpose: "I revoked that one last week" is
// exactly the question this view answers, and a row that vanishes on revocation
// makes a user wonder whether the URL is really dead.
func (r *SubscriptionRepository) ListByConfig(ctx context.Context, userID, configID uint) ([]model.Subscription, error) {
	subs := []model.Subscription{}
	err := r.scoped(ctx, userID).
		Where("config_id = ?", configID).
		Order("created_at DESC").
		Find(&subs).Error
	if err != nil {
		return nil, fmt.Errorf("list subscriptions for config %d: %w", configID, err)
	}
	return subs, nil
}

// CountActiveByConfig counts the live subscriptions on one config.
func (r *SubscriptionRepository) CountActiveByConfig(ctx context.Context, userID, configID uint) (int64, error) {
	var n int64
	err := r.scoped(ctx, userID).
		Where("config_id = ? AND revoked_at IS NULL", configID).
		Count(&n).Error
	if err != nil {
		return 0, fmt.Errorf("count subscriptions for config %d: %w", configID, err)
	}
	return n, nil
}

// Create inserts a subscription. UserID must already be the owner of ConfigID.
func (r *SubscriptionRepository) Create(ctx context.Context, s *model.Subscription) error {
	if s.UserID == 0 || s.ConfigID == 0 {
		// Not reachable through the handlers. It is here because a subscription
		// with no owner is a live URL serving a config that nobody can revoke.
		return errors.New("refusing to create a subscription with no owner or no config")
	}

	// unlogged: the INSERT carries the token in its VALUES list.
	if err := r.unlogged(ctx).Create(s).Error; err != nil {
		return fmt.Errorf("create subscription: %w", err)
	}
	return nil
}

func (r *SubscriptionRepository) FindByID(ctx context.Context, userID, id uint) (*model.Subscription, error) {
	var s model.Subscription
	err := r.scoped(ctx, userID).Where("id = ?", id).First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find subscription %d: %w", id, err)
	}
	return &s, nil
}

// RotateToken swaps in a new token, killing the old URL at the same instant.
//
// `revoked_at IS NULL` is in the WHERE clause rather than checked beforehand:
// without it, rotating a revoked subscription would hand back a working URL for
// something the user believes they switched off.
func (r *SubscriptionRepository) RotateToken(ctx context.Context, userID, id uint, token string) (*model.Subscription, error) {
	// unlogged: the SET clause carries the new token.
	res := r.unlogged(ctx).
		Model(&model.Subscription{}).
		Where("user_id = ? AND id = ? AND revoked_at IS NULL", userID, id).
		Updates(map[string]any{"token": token})
	if res.Error != nil {
		return nil, fmt.Errorf("rotate subscription %d: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, r.explainMiss(ctx, userID, id)
	}

	return r.FindByID(ctx, userID, id)
}

// Revoke switches a subscription off. It is idempotent: revoking twice is not
// an error, because the caller's intent is already satisfied and a client
// retrying a request it never saw the answer to should not see a failure.
func (r *SubscriptionRepository) Revoke(ctx context.Context, userID, id uint) error {
	now := time.Now().UTC()
	res := r.scoped(ctx, userID).
		Where("id = ? AND revoked_at IS NULL", id).
		Updates(map[string]any{"revoked_at": now})
	if res.Error != nil {
		return fmt.Errorf("revoke subscription %d: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		if err := r.explainMiss(ctx, userID, id); !errors.Is(err, ErrRevoked) {
			return err
		}
	}
	return nil
}

// explainMiss turns "the UPDATE matched nothing" into the reason why.
//
// The write itself carries both id and user_id so that ownership is enforced in
// one statement; the cost is that a miss says nothing about its cause. This
// re-read runs only on the failure path, where an extra query is free.
func (r *SubscriptionRepository) explainMiss(ctx context.Context, userID, id uint) error {
	s, err := r.FindByID(ctx, userID, id)
	if err != nil {
		return err
	}
	if !s.Active() {
		return ErrRevoked
	}
	// The row is there, it is the caller's, and it is live — so the update
	// raced another request that changed nothing observable. Reporting it as
	// missing would be wrong; reporting success would be worse.
	return fmt.Errorf("subscription %d was not updated", id)
}

// FindActiveByToken resolves a subscription URL.
//
// One of the two methods here with no userID, and the reason is structural: the
// caller is a Mihomo client with no session, and the token *is* the credential.
// Isolation is not lost, only relocated — the row names its owner, and the
// caller then loads the config through the ordinary user-scoped path using that
// owner. A token therefore reaches exactly the configs its own user owns.
//
// Revoked rows are excluded here rather than checked afterwards, so a revoked
// token is indistinguishable from one that never existed.
func (r *SubscriptionRepository) FindActiveByToken(ctx context.Context, token string) (*model.Subscription, error) {
	var s model.Subscription
	// unlogged: the WHERE clause is the token itself.
	err := r.unlogged(ctx).
		Where("token = ? AND revoked_at IS NULL", token).
		First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		// The token must not reach the message either: this error is wrapped,
		// logged, and would carry a live credential into the log file.
		return nil, fmt.Errorf("find subscription by token: %w", err)
	}
	// Belt and braces against a future WHERE that stops being exact — a LIKE, a
	// case-insensitive collation, a lookup rewritten to fetch a candidate set.
	if !model.TokenMatches(s.Token, token) {
		return nil, ErrNotFound
	}
	return &s, nil
}

// RecordAccess stamps the telemetry columns after a successful fetch.
//
// The second method with no userID, and it needs none: the id comes from a row
// FindActiveByToken already resolved, not from anything a caller supplied.
//
// UpdateColumns rather than Updates, because Updates would also bump updated_at
// — and then every poll from every client would look like the user had just
// edited the subscription. access_count is incremented in SQL so that two
// clients polling at once do not read the same value and both write back +1.
func (r *SubscriptionRepository) RecordAccess(ctx context.Context, id uint, userAgent string) error {
	now := time.Now().UTC()
	err := r.db.WithContext(ctx).
		Model(&model.Subscription{}).
		Where("id = ?", id).
		UpdateColumns(map[string]any{
			"last_access_at":  now,
			"access_count":    gorm.Expr("access_count + 1"),
			"last_user_agent": model.TruncateUserAgent(userAgent),
		}).Error
	if err != nil {
		return fmt.Errorf("record access on subscription %d: %w", id, err)
	}
	return nil
}
