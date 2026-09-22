// Package logging installs the process-wide structured logger and carries a
// request-scoped one through the Gin context.
//
// Everything the service emits goes through here, in one format, on one stream.
// That is the point of the change: log lines are read by machines long before a
// person sees them, and a line whose fields have to be recovered with a regular
// expression is a line nobody can alert on. A structured record makes
// "every 5xx in the last hour, grouped by path" a query rather than a project.
package logging

import (
	"log/slog"
	"os"
	"time"

	"mihomo-studio-server/internal/config"
)

// Stream is stderr for every environment, deliberately.
//
// Logs are diagnostics, and stdout belongs to commands whose output is meant to
// be piped somewhere — cmd/devtoken prints a token that a shell captures. A
// container runtime collects both streams, so nothing is lost by the choice.
var stream = os.Stderr

// Setup builds the logger, installs it as the default, and returns it.
//
// Installing it as the default matters beyond convenience: slog.SetDefault also
// routes the standard log package through this handler, so a stray log.Printf
// in a dependency lands in the same stream, in the same format, instead of
// becoming the one unparseable line in the file.
func Setup(cfg *config.Config) *slog.Logger {
	opts := &slog.HandlerOptions{Level: cfg.LogLevel}

	var handler slog.Handler
	if cfg.LogFormat == config.LogFormatJSON {
		handler = slog.NewJSONHandler(stream, opts)
	} else {
		// Only the clock time, and no date. A human reading a dev server's output
		// is correlating it with something that happened seconds ago, and the full
		// RFC 3339 stamp pushes the message itself off the right of the terminal.
		opts.ReplaceAttr = shortenTime
		handler = slog.NewTextHandler(stream, opts)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

func shortenTime(groups []string, a slog.Attr) slog.Attr {
	if len(groups) == 0 && a.Key == slog.TimeKey {
		a.Value = slog.StringValue(a.Value.Time().Format("15:04:05.000"))
	}
	return a
}

// Err is the one attribute key for a failure, so that every error in the
// service is greppable — and searchable in a log aggregator — by one field name.
func Err(err error) slog.Attr {
	if err == nil {
		return slog.String("err", "")
	}
	return slog.String("err", err.Error())
}

// Millis renders a duration as a number rather than slog.Duration's "1.234ms"
// string, because a duration a machine cannot compare is not a metric.
func Millis(key string, d time.Duration) slog.Attr {
	return slog.Float64(key, float64(d.Microseconds())/1000)
}
