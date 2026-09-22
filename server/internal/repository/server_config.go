package repository

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"mihomo-studio-server/internal/model"
)

// ServerConfigRepository is the sole route from the API to server_configs.
//
// It is a structural copy of ConfigRepository, and for the same reason: every
// method takes userID first and folds it into the WHERE clause, so there is no
// way to touch another tenant's row without deleting a parameter.
type ServerConfigRepository struct {
	db *gorm.DB
}

func NewServerConfigRepository(db *gorm.DB) *ServerConfigRepository {
	return &ServerConfigRepository{db: db}
}

// scoped is the base query for one user. Every method starts here.
func (r *ServerConfigRepository) scoped(ctx context.Context, userID uint) *gorm.DB {
	return r.db.WithContext(ctx).Model(&model.ServerConfig{}).Where("user_id = ?", userID)
}

// ListByUser returns the caller's configs, newest change first. Columns are
// named explicitly so ir and the two rendered artifacts can never silently
// join the list payload.
func (r *ServerConfigRepository) ListByUser(ctx context.Context, userID uint) ([]model.ServerConfigSummary, error) {
	const columns = `id, name, description, ir_version, rendered_at, created_at, updated_at`

	summaries := []model.ServerConfigSummary{}
	err := r.scoped(ctx, userID).
		Select(columns).
		Order("updated_at DESC").
		Find(&summaries).Error
	if err != nil {
		return nil, fmt.Errorf("list server configs for user %d: %w", userID, err)
	}
	return summaries, nil
}

// Count returns how many live configs the user has — the quota check.
func (r *ServerConfigRepository) Count(ctx context.Context, userID uint) (int64, error) {
	var n int64
	if err := r.scoped(ctx, userID).Count(&n).Error; err != nil {
		return 0, fmt.Errorf("count server configs for user %d: %w", userID, err)
	}
	return n, nil
}

// FindByID loads one config including the IR. A row belonging to someone else
// is ErrNotFound, exactly as on ConfigRepository: a 403 would confirm the ID
// exists, and isolation is worth more than a precise error message.
func (r *ServerConfigRepository) FindByID(ctx context.Context, userID, id uint) (*model.ServerConfig, error) {
	var c model.ServerConfig
	err := r.scoped(ctx, userID).Where("id = ?", id).First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find server config %d: %w", id, err)
	}
	return &c, nil
}

// Exists reports whether the user owns a live config with this id.
//
// The ownership check that /server-configs/:id/shares needs, without the cost
// FindByID would carry: that method loads the whole IR, which for a large
// server draft is fetched only to be discarded. Same reasoning as
// ConfigRepository.Exists.
func (r *ServerConfigRepository) Exists(ctx context.Context, userID, id uint) error {
	var n int64
	if err := r.scoped(ctx, userID).Where("id = ?", id).Count(&n).Error; err != nil {
		return fmt.Errorf("check server config %d: %w", id, err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// Create inserts a config. UserID must already be set from the verified token.
func (r *ServerConfigRepository) Create(ctx context.Context, c *model.ServerConfig) error {
	if c.UserID == 0 {
		return errors.New("refusing to create a server config with no owner")
	}
	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return ErrDuplicateName
		}
		return fmt.Errorf("create server config: %w", err)
	}
	return nil
}

// Update writes the changed fields in one statement carrying both id and
// user_id, then re-reads through the scoped path. RowsAffected == 0 means the
// write touched nothing that existed — never report success for it.
func (r *ServerConfigRepository) Update(ctx context.Context, userID, id uint, fields map[string]any) (*model.ServerConfig, error) {
	if len(fields) == 0 {
		return nil, errors.New("update called with no fields")
	}
	res := r.scoped(ctx, userID).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		if errors.Is(res.Error, gorm.ErrDuplicatedKey) {
			return nil, ErrDuplicateName
		}
		return nil, fmt.Errorf("update server config %d: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, ErrNotFound
	}
	return r.FindByID(ctx, userID, id)
}

// SoftDelete marks a config deleted. The partial name index frees the name
// immediately; GORM's default scope keeps every later query away from the row.
func (r *ServerConfigRepository) SoftDelete(ctx context.Context, userID, id uint) error {
	res := r.scoped(ctx, userID).Where("id = ?", id).Delete(&model.ServerConfig{})
	if res.Error != nil {
		return fmt.Errorf("delete server config %d: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
