// Package database opens and migrates the PostgreSQL connection described by
// POSTGRESQL_DSN.
package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"mihomo-studio-server/internal/config"
)

const (
	maxOpenConns    = 25
	maxIdleConns    = 5
	connMaxLifetime = time.Hour
	pingTimeout     = 5 * time.Second

	// Queries slower than this are logged even when statement logging is off.
	// Every query in this service is a primary-key or user_id lookup, so one
	// crossing this line means an index is missing, not that the work was large.
	slowQueryThreshold = 200 * time.Millisecond
)

// New opens the connection pool and verifies it before the caller starts
// serving traffic.
func New(cfg *config.Config, logger *slog.Logger) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(cfg.PostgresDSN), &gorm.Config{
		// Routed through slog like everything else, and it is the adapter rather
		// than a log level that decides whether a statement's text may be printed
		// — statements here carry proxy passwords. See gormlog.go.
		Logger: newGormLogger(logger, slowQueryThreshold),
		// Write timestamps in UTC regardless of the host's zone, so rows written
		// by servers in different regions stay directly comparable.
		NowFunc: func() time.Time { return time.Now().UTC() },
		// Surface gorm.ErrDuplicatedKey and friends instead of raw driver errors,
		// so a duplicate config name can be mapped to 409 without matching on
		// PostgreSQL error strings.
		TranslateError: true,
	})
	if err != nil {
		// The DSN carries the database password — report the failure without it.
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("access underlying sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(connMaxLifetime)

	// gorm.Open does not necessarily dial. Without an explicit ping, a wrong host
	// or password would not surface until whichever request happened to arrive
	// first, long after the process reported itself healthy.
	ctx, cancel := context.WithTimeout(context.Background(), pingTimeout)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return db, nil
}

// Ping backs GET /healthz, so a database that has gone away shows up as an
// unhealthy service rather than as errors on unrelated requests.
func Ping(ctx context.Context, db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}

// Close releases the pool. Safe to call on a partially initialised handle.
func Close(db *gorm.DB) error {
	if db == nil {
		return nil
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
