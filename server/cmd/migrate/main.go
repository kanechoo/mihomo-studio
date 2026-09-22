// Command migrate applies the schema migrations, or reports on them.
//
// The API server migrates on boot, so this is not required to run the service.
// It exists for the two situations where migrating on boot is the wrong shape:
// asking "which schema is this database on" without starting anything, and
// applying migrations as a separate step — a Compose job, a CI stage, or a
// deploy that wants the schema moved before the new binaries roll out.
//
// It shares the runner, the embedded files and the advisory lock with the
// server, so running both at once is safe: whichever gets the lock first
// applies, and the other finds nothing to do.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"text/tabwriter"
	"time"

	"github.com/joho/godotenv"
	"gorm.io/gorm"

	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/database"
	"mihomo-studio-server/internal/logging"
)

func main() {
	flag.Usage = func() {
		fmt.Fprint(os.Stderr, "usage: migrate [up|status]\n\n"+
			"  up      apply every pending migration (default)\n"+
			"  status  list what is applied and what is pending\n")
	}
	flag.Parse()

	command := "up"
	if flag.NArg() > 0 {
		command = flag.Arg(0)
	}

	if err := run(command); err != nil {
		slog.Error("migrate failed", logging.Err(err))
		os.Exit(1)
	}
}

func run(command string) error {
	_ = godotenv.Load(".env")

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logger := logging.Setup(cfg)

	db, err := database.New(cfg, logger)
	if err != nil {
		return err
	}
	defer func() { _ = database.Close(db) }()

	// Bounded: this command is run by hand and by deploy scripts, and one that
	// waits forever on a lock another instance is holding is one that hangs a
	// pipeline with no explanation.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	switch command {
	case "up":
		return up(ctx, db, logger)
	case "status":
		return status(ctx, db)
	default:
		flag.Usage()
		return fmt.Errorf("unknown command %q", command)
	}
}

func up(ctx context.Context, db *gorm.DB, logger *slog.Logger) error {
	result, err := database.Migrate(ctx, db)
	if err != nil {
		return err
	}

	if len(result.Applied) == 0 {
		logger.Info("already up to date", slog.Int("versions", result.AlreadyCurrent))
		return nil
	}
	for _, m := range result.Applied {
		logger.Info("applied", slog.String("migration", m.String()))
	}
	return nil
}

func status(ctx context.Context, db *gorm.DB) error {
	statuses, err := database.Report(ctx, db)
	if err != nil {
		return err
	}

	// stdout, unlike the logs: this is the command's output, and someone will
	// pipe it.
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "VERSION\tNAME\tSTATUS\tAPPLIED AT")

	for _, s := range statuses {
		state, at := "pending", ""
		switch {
		case s.Orphan:
			// Recorded here but absent from this binary: the database is ahead of
			// the code, which is what a rolled-back deploy looks like.
			state = "unknown"
			at = s.Applied.AppliedAt.Format(time.RFC3339)
		case s.Applied != nil:
			state = "applied"
			at = s.Applied.AppliedAt.Format(time.RFC3339)
		}
		fmt.Fprintf(w, "%04d\t%s\t%s\t%s\n", s.Version, s.Name, state, at)
	}

	return w.Flush()
}
