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

// ServerConfigShareRepository is the sole route from the API to server-config
// shares. The shape and the rules are SubscriptionRepository's: every method
// acting for a signed-in user takes userID and folds it into the WHERE clause,
// and the two token-serving methods deliberately do not, because their caller
// holds a token instead of a session.
type ServerConfigShareRepository struct {
	db *gorm.DB
}

func NewServerConfigShareRepository(db *gorm.DB) *ServerConfigShareRepository {
	return &ServerConfigShareRepository{db: db}
}

func (r *ServerConfigShareRepository) scoped(ctx context.Context, userID uint) *gorm.DB {
	return r.db.WithContext(ctx).Model(&model.ServerConfigShare{}).Where("user_id = ?", userID)
}

// unlogged exists for the same reason as on SubscriptionRepository: the three
// statements that carry a token in their text must not reach the log through
// GORM's parameter interpolation.
func (r *ServerConfigShareRepository) unlogged(ctx context.Context) *gorm.DB {
	return r.db.WithContext(ctx).Session(&gorm.Session{
		Logger: r.db.Logger.LogMode(gormlogger.Silent),
	})
}

// ListByConfig returns every share on one server config, revoked ones included.
// A revoked row staying visible is what answers "did I already turn that link
// off"; a row that vanishes would leave the question open.
func (r *ServerConfigShareRepository) ListByConfig(ctx context.Context, userID, configID uint) ([]model.ServerConfigShare, error) {
	shares := []model.ServerConfigShare{}
	err := r.scoped(ctx, userID).
		Where("server_config_id = ?", configID).
		Order("created_at DESC").
		Find(&shares).Error
	if err != nil {
		return nil, fmt.Errorf("list shares for server config %d: %w", configID, err)
	}
	return shares, nil
}

// CountActiveByConfig counts the live shares on one config.
func (r *ServerConfigShareRepository) CountActiveByConfig(ctx context.Context, userID, configID uint) (int64, error) {
	var n int64
	err := r.scoped(ctx, userID).
		Where("server_config_id = ? AND revoked_at IS NULL", configID).
		Count(&n).Error
	if err != nil {
		return 0, fmt.Errorf("count shares for server config %d: %w", configID, err)
	}
	return n, nil
}

// Create inserts a share. UserID must already be the owner of ConfigID.
func (r *ServerConfigShareRepository) Create(ctx context.Context, s *model.ServerConfigShare) error {
	if s.UserID == 0 || s.ServerConfigID == 0 {
		// Not reachable through the handlers; here because an ownerless share is
		// a live URL nothing can revoke.
		return errors.New("refusing to create a server config share with no owner or no config")
	}

	// unlogged: the INSERT carries the token in its VALUES list.
	if err := r.unlogged(ctx).Create(s).Error; err != nil {
		return fmt.Errorf("create server config share: %w", err)
	}
	return nil
}

func (r *ServerConfigShareRepository) FindByID(ctx context.Context, userID, id uint) (*model.ServerConfigShare, error) {
	var s model.ServerConfigShare
	err := r.scoped(ctx, userID).Where("id = ?", id).First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find server config share %d: %w", id, err)
	}
	return &s, nil
}

// Revoke switches a share off. Idempotent, as on subscriptions: revoking twice
// is the caller's intent already satisfied, not an error.
func (r *ServerConfigShareRepository) Revoke(ctx context.Context, userID, id uint) error {
	res := r.scoped(ctx, userID).
		Model(&model.ServerConfigShare{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Update("revoked_at", time.Now().UTC())
	if res.Error != nil {
		return fmt.Errorf("revoke server config share %d: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		s, err := r.FindByID(ctx, userID, id)
		if err != nil {
			return err
		}
		if !s.Active() {
			return ErrRevoked
		}
		return fmt.Errorf("server config share %d was not updated", id)
	}
	return nil
}

// FindActiveByToken resolves a share URL. No userID, structurally: the caller
// is anonymous and the token is the credential. Isolation is relocated, not
// lost — the row names its owner, and the service then loads the referenced
// config through the ordinary user-scoped path using that owner.
//
// Revoked rows are excluded in the WHERE rather than checked afterwards, so a
// revoked token is indistinguishable from one that never existed.
func (r *ServerConfigShareRepository) FindActiveByToken(ctx context.Context, token string) (*model.ServerConfigShare, error) {
	var s model.ServerConfigShare
	// unlogged: the WHERE clause is the token itself.
	err := r.unlogged(ctx).
		Where("token = ? AND revoked_at IS NULL", token).
		First(&s).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		// The token must not reach the message either — this error is wrapped,
		// logged, and would carry a live credential into the log file.
		return nil, fmt.Errorf("find server config share by token: %w", err)
	}
	if !model.TokenMatches(s.Token, token) {
		return nil, ErrNotFound
	}
	return &s, nil
}
