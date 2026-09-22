package database

import (
	"fmt"

	"gorm.io/gorm"
)

// Schema reports the tables and indexes actually present, so a boot can show
// what it produced instead of asking the operator to go and check with psql.
//
// It is also the check that catches a migration which ran without doing what it
// was written to do: the partial indexes this service depends on are the kind of
// object that a hand-edited SQL file can silently omit, and a missing one turns
// a uniqueness rule into a suggestion rather than an error.
type Schema struct {
	Tables  []string
	Indexes []string
}

func Inspect(db *gorm.DB) (*Schema, error) {
	// Scanned through a named struct rather than straight into []string: GORM
	// maps columns onto struct fields reliably, and a bare slice of primitives
	// depends on scan behaviour that is easy to get wrong and silently returns
	// nothing.
	type nameRow struct {
		Name string
	}

	var s Schema

	const tablesQuery = `
		SELECT table_name AS name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		ORDER BY table_name`
	var tables []nameRow
	if err := db.Raw(tablesQuery).Scan(&tables).Error; err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	for _, t := range tables {
		s.Tables = append(s.Tables, t.Name)
	}

	const indexesQuery = `
		SELECT indexname AS name FROM pg_indexes
		WHERE schemaname = 'public'
		ORDER BY indexname`
	var indexes []nameRow
	if err := db.Raw(indexesQuery).Scan(&indexes).Error; err != nil {
		return nil, fmt.Errorf("list indexes: %w", err)
	}
	for _, i := range indexes {
		s.Indexes = append(s.Indexes, i.Name)
	}

	return &s, nil
}
