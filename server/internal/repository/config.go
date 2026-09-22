package repository

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"mihomo-studio-server/internal/model"
)

// ErrDuplicateName is the partial unique index on (user_id, name) speaking. It
// is scoped per user, so it never means "someone else took this name".
var ErrDuplicateName = errors.New("a config with this name already exists")

// ConfigRepository is the sole route from the API to mihomo_configs.
//
// Every method takes userID first and folds it into the WHERE clause. That is
// the whole isolation mechanism: there is no method here that can be called
// without naming a tenant, so leaking another user's row would take deleting a
// parameter rather than forgetting to add one.
type ConfigRepository struct {
	db *gorm.DB
}

func NewConfigRepository(db *gorm.DB) *ConfigRepository { return &ConfigRepository{db: db} }

// scoped is the base query for one user. Every method starts here.
func (r *ConfigRepository) scoped(ctx context.Context, userID uint) *gorm.DB {
	return r.db.WithContext(ctx).Model(&model.MihomoConfig{}).Where("user_id = ?", userID)
}

// ListByUser returns the caller's configs, newest change first.
func (r *ConfigRepository) ListByUser(ctx context.Context, userID uint) ([]model.ConfigSummary, error) {
	// Named explicitly rather than SELECT *: this is the query whose entire
	// purpose is to not fetch ir and the rendered artifacts, and a later column
	// added to the model must not silently join the payload.
	const columns = `id, name, description, ir_version, rendered_at, created_at, updated_at`

	summaries := []model.ConfigSummary{}
	err := r.scoped(ctx, userID).
		Select(columns).
		Order("updated_at DESC").
		Find(&summaries).Error
	if err != nil {
		return nil, fmt.Errorf("list configs for user %d: %w", userID, err)
	}
	return summaries, nil
}

// FindByID loads one config, including the IR and the rendered artifacts.
//
// A config belonging to someone else returns ErrNotFound rather than a
// permission error, and the handler turns that into a 404. The distinction
// matters: a 403 would confirm that the ID exists, which lets anyone enumerate
// how many configs the service holds and when they were created.
func (r *ConfigRepository) FindByID(ctx context.Context, userID, id uint) (*model.MihomoConfig, error) {
	var c model.MihomoConfig
	err := r.scoped(ctx, userID).Where("id = ?", id).First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find config %d: %w", id, err)
	}
	return &c, nil
}

// Exists reports whether the user owns a live config with this id.
//
// The ownership check that /configs/:id/subscriptions needs, without the cost
// FindByID would carry: that method loads the IR and both rendered artifacts,
// which for a large config is megabytes fetched only to be discarded.
func (r *ConfigRepository) Exists(ctx context.Context, userID, id uint) error {
	var n int64
	if err := r.scoped(ctx, userID).Where("id = ?", id).Count(&n).Error; err != nil {
		return fmt.Errorf("check config %d: %w", id, err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// Create inserts a config. UserID must already be set from the verified token.
func (r *ConfigRepository) Create(ctx context.Context, c *model.MihomoConfig) error {
	if c.UserID == 0 {
		// Not reachable through the handlers, which take the ID from the JWT. It
		// is here because the failure it prevents is a row owned by nobody, which
		// no later query would ever return and no user could ever delete.
		return errors.New("refusing to create a config with no owner")
	}

	if err := r.db.WithContext(ctx).Create(c).Error; err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return ErrDuplicateName
		}
		return fmt.Errorf("create config: %w", err)
	}
	return nil
}

// Update writes the changed fields and returns the stored row.
//
// The update is a single statement carrying both id and user_id. Loading the
// row first to check ownership and then writing it would leave a window between
// the two, and would cost a round trip on every save.
func (r *ConfigRepository) Update(ctx context.Context, userID, id uint, fields map[string]any) (*model.MihomoConfig, error) {
	if len(fields) == 0 {
		return nil, errors.New("update called with no fields")
	}

	res := r.scoped(ctx, userID).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		if errors.Is(res.Error, gorm.ErrDuplicatedKey) {
			return nil, ErrDuplicateName
		}
		return nil, fmt.Errorf("update config %d: %w", id, res.Error)
	}
	// Zero rows means the config does not exist, is soft-deleted, or belongs to
	// another user. Without this check, UPDATE ... WHERE id = <someone else's>
	// succeeds while changing nothing, and the API reports success for a write
	// that never happened.
	if res.RowsAffected == 0 {
		return nil, ErrNotFound
	}

	return r.FindByID(ctx, userID, id)
}

// SoftDelete marks a config deleted, leaving the row in place.
//
// GORM's Delete on a model with gorm.DeletedAt sets the timestamp rather than
// removing anything, so the config can be recovered and — because the name
// index is partial — its name becomes available again immediately.
func (r *ConfigRepository) SoftDelete(ctx context.Context, userID, id uint) error {
	res := r.scoped(ctx, userID).Where("id = ?", id).Delete(&model.MihomoConfig{})
	if res.Error != nil {
		return fmt.Errorf("delete config %d: %w", id, res.Error)
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
