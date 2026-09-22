// Package repository is the only layer that touches the database.
//
// Every method that reads or writes tenant-owned data takes a userID and folds
// it into the query, so isolation is a property of the type signature rather
// than of remembering to add a WHERE clause. Handlers and services never hold a
// *gorm.DB, which is what makes that guarantee hold.
package repository

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mihomo-studio-server/internal/model"
)

// ErrNotFound is returned instead of gorm.ErrRecordNotFound so that the layers
// above never import GORM. Keeping the ORM behind this package is what allows
// "every query is scoped" to be checked by reading one directory.
var ErrNotFound = errors.New("not found")

// UserRepository is the exception to the user-scoping rule, and the only one:
// it manages identity itself, so there is no prior user to scope by. Every
// other repository added from Step 4 on takes userID on each method.
type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository { return &UserRepository{db: db} }

// UpsertByGithubID creates the user on first login and refreshes the profile on
// every login after that. The passed struct is filled in with the stored row,
// including the assigned ID.
//
// One statement rather than SELECT-then-INSERT: two browser tabs finishing the
// OAuth dance at the same moment would both find no row and both insert, and
// the loser gets a unique-violation error on what is a perfectly ordinary first
// login. ON CONFLICT makes the race impossible instead of unlikely.
func (r *UserRepository) UpsertByGithubID(ctx context.Context, u *model.User) error {
	err := r.db.WithContext(ctx).
		// The profile columns only. created_at is excluded deliberately — it
		// records when the account was first seen, and refreshing it on every
		// login would erase that.
		Clauses(
			clause.OnConflict{
				Columns: []clause.Column{{Name: "github_id"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"login", "name", "email", "avatar_url", "last_login_at", "updated_at",
				}),
			},
			// Reads the row back, so the caller gets the real ID and timestamps on
			// the update path as well as the insert path.
			clause.Returning{},
		).
		Omit(clause.Associations).
		Create(u).Error
	if err != nil {
		return fmt.Errorf("upsert user: %w", err)
	}
	return nil
}

// FindByID loads a user by primary key.
func (r *UserRepository) FindByID(ctx context.Context, id uint) (*model.User, error) {
	var u model.User
	if err := r.db.WithContext(ctx).First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("find user %d: %w", id, err)
	}
	return &u, nil
}
