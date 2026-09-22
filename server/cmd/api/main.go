// Command api is the Mihomo config server.
//
// main is a composition root and nothing else: it loads configuration, opens
// the database, migrates, builds the router, and serves. Every decision beyond
// wiring lives in internal/.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/database"
	"mihomo-studio-server/internal/logging"
	"mihomo-studio-server/internal/router"
)

const envFile = ".env"

const (
	// Slowloris: a connection that dribbles headers forever occupies a slot for
	// free. This is the one timeout with no legitimate reason to be generous.
	readHeaderTimeout = 10 * time.Second
	readTimeout       = 30 * time.Second
	// Generous because /sub/:token can serve a large config to a client on a
	// slow link, and cutting that off mid-body leaves it with a truncated
	// document rather than an error it can retry.
	writeTimeout = 60 * time.Second
	idleTimeout  = 120 * time.Second

	// Long enough for a normal request to finish, short enough that a restart is
	// not held hostage by one stuck handler.
	shutdownTimeout = 15 * time.Second
)

// Indexes that exist for a specific reason and are easy to lose in a schema
// change. The migrations create them; this checks they survived.
var expectedIndexes = []string{
	"idx_configs_user_name_active",
	"idx_subs_token_active",
	// The geosite read path's ordering — bundles first, then alphabetical — is
	// an index scan only while this exists; without it every picker load sorts
	// fifteen hundred rows by hand.
	"idx_geosite_tags_sort",
	// The server-config list's per-user name uniqueness. Same story as the
	// configs index: it is partial, and a plain UNIQUE rebuild would let a
	// soft-deleted row reserve its name forever.
	"idx_server_configs_user_name_active",
}

func main() {
	if err := run(); err != nil {
		// Non-zero exit matters: a supervisor or CI step has no other way to tell
		// a failed boot from a clean one.
		slog.Error("startup failed", logging.Err(err))
		os.Exit(1)
	}
}

func run() error {
	// Registered first, so that a signal arriving during a migration cancels it
	// — the transaction rolls back and nothing is half-applied — rather than
	// being ignored until the server is already listening.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Read before the logger exists, because the logger is configured from the
	// variables this loads. What happened is reported once there is somewhere to
	// report it to.
	dotenvLoaded, dotenvErr := loadDotEnv()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	logger := logging.Setup(cfg)
	switch {
	case dotenvErr != nil:
		logger.Warn("could not read "+envFile, logging.Err(dotenvErr))
	case dotenvLoaded:
		logger.Info("loaded " + envFile)
	}

	logger.Info("config loaded",
		slog.String("env", cfg.Env),
		slog.String("port", cfg.Port),
		slog.String("public_base_url", cfg.PublicBaseURL),
		slog.String("log_level", cfg.LogLevel.String()),
		slog.Int("trusted_proxies", len(cfg.TrustedProxies)))

	db, err := database.New(cfg, logger)
	if err != nil {
		return err
	}
	defer func() {
		if err := database.Close(db); err != nil {
			logger.Warn("closing database", logging.Err(err))
		}
	}()
	logger.Info("database connected")

	result, err := database.Migrate(ctx, db)
	if err != nil {
		return err
	}
	logMigrations(logger, result)

	schema, err := database.Inspect(db)
	if err != nil {
		return err
	}
	if missing := missingFrom(schema.Indexes, expectedIndexes); len(missing) > 0 {
		return fmt.Errorf("expected indexes are absent after migration: %s", strings.Join(missing, ", "))
	}
	logger.Info("schema verified",
		slog.Int("tables", len(schema.Tables)),
		slog.Int("indexes", len(schema.Indexes)))

	return serve(ctx, cfg, logger, router.New(cfg, db, logger))
}

func logMigrations(logger *slog.Logger, result *database.Result) {
	applied := make([]string, 0, len(result.Applied))
	for _, m := range result.Applied {
		applied = append(applied, m.String())
	}

	logger.Info("migrations up to date",
		slog.Int("applied_now", len(result.Applied)),
		slog.Int("already_current", result.AlreadyCurrent),
		slog.String("applied", strings.Join(applied, ",")))

	// The database has versions this build does not carry, which means it was
	// migrated by a newer build — a rolled-back deploy, most likely. Not fatal:
	// the schema is almost always a superset, and refusing to start would turn a
	// rollback into an outage. It is worth saying loudly, because the running
	// code was written against a schema that is no longer the one in front of it.
	if len(result.Orphans) > 0 {
		versions := make([]string, 0, len(result.Orphans))
		for _, v := range result.Orphans {
			versions = append(versions, fmt.Sprintf("%04d", v))
		}
		logger.Warn("the database has migrations this build does not carry; it was migrated by a newer version",
			slog.String("versions", strings.Join(versions, ",")))
	}
}

// serve runs the HTTP server until a signal arrives, then drains.
//
// Draining is what makes a deploy invisible: without it, every request in
// flight at the moment of the restart is severed. For this service that means a
// half-written config save, which is the one operation a user would notice
// losing.
func serve(ctx context.Context, cfg *config.Config, logger *slog.Logger, h http.Handler) error {
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           h,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", slog.String("addr", "http://localhost:"+cfg.Port))
		// ErrServerClosed is what Shutdown produces on the way out; it is the
		// success path, not a failure.
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- fmt.Errorf("listen on port %s: %w", cfg.Port, err)
			return
		}
		errCh <- nil
	}()

	select {
	case err := <-errCh:
		// A port already in use fails here, before any signal — report it rather
		// than blocking forever on a server that never started.
		return err
	case <-ctx.Done():
	}

	logger.Info("shutting down, waiting for in-flight requests")

	// context.Background, not ctx: ctx is already cancelled by the signal, and
	// passing it would make Shutdown abort instantly — the exact opposite of
	// what it is being called for.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	logger.Info("stopped cleanly")
	return nil
}

// loadDotEnv reads server/.env when it is there. Its absence is normal rather
// than an error: in production the variables come from the environment itself
// and no such file exists.
func loadDotEnv() (loaded bool, err error) {
	if _, statErr := os.Stat(envFile); statErr != nil {
		return false, nil
	}
	if err := godotenv.Load(envFile); err != nil {
		return false, err
	}
	return true, nil
}

func missingFrom(have, want []string) []string {
	present := make(map[string]struct{}, len(have))
	for _, h := range have {
		present[h] = struct{}{}
	}
	var missing []string
	for _, w := range want {
		if _, ok := present[w]; !ok {
			missing = append(missing, w)
		}
	}
	return missing
}
