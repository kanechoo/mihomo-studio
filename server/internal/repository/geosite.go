package repository

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"mihomo-studio-server/internal/model"
)

// GeositeRepository reads the geosite tag catalogue.
//
// Like UserRepository, it is an exception to the user-scoping rule: the
// catalogue is reference data shared by every account, so there is no owner to
// scope by and no method takes a userID. It stays behind this package anyway,
// so "which queries touch which tables" remains answerable from one directory.
type GeositeRepository struct {
	db *gorm.DB
}

func NewGeositeRepository(db *gorm.DB) *GeositeRepository {
	return &GeositeRepository{db: db}
}

// ListNames returns every tag in the catalogue, curated category-* bundles
// first and then alphabetically — the order the picker displays them in.
//
// The ordering lives here rather than in the handler because it is a property
// of the data's shape (the is_category flag) that happens to match what every
// consumer wants; sorting it again client-side would mean every caller has to
// know how.
func (r *GeositeRepository) ListNames(ctx context.Context) ([]string, error) {
	var names []string
	err := r.db.WithContext(ctx).
		Model(&model.GeositeTag{}).
		Order("is_category DESC, name ASC").
		Pluck("name", &names).Error
	if err != nil {
		return nil, fmt.Errorf("list geosite tags: %w", err)
	}
	return names, nil
}
