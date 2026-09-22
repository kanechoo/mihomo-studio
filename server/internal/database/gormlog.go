package database

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
	"gorm.io/gorm/utils"

	"mihomo-studio-server/internal/logging"
)

// gormSlog adapts GORM's logger onto slog, so the service emits one stream in
// one format instead of structured records interleaved with GORM's own text.
//
// It also decides, in one place, when a statement's text is allowed out. GORM
// interpolates parameters into the SQL it prints, and the parameters here are
// config documents — which contain proxy passwords — and subscription tokens.
// The previous logger tied this to the environment, which left one hole: an
// erroring or slow statement is printed at every level, so a duplicate-key
// violation on a config insert would write the whole document to a production
// log. Below, the statement is attached only when the logger is actually
// emitting debug records, and the caller's file and line take its place
// otherwise — enough to find the query, without its values.
type gormSlog struct {
	logger        *slog.Logger
	level         gormlogger.LogLevel
	slowThreshold time.Duration
}

func newGormLogger(logger *slog.Logger, slowThreshold time.Duration) gormlogger.Interface {
	return gormSlog{
		logger: logger,
		// Always Info at this layer; what actually reaches the output is decided by
		// the slog level. Two independent level knobs would mean LOG_LEVEL=debug
		// quietly doing nothing because GORM had already dropped the record.
		level:         gormlogger.Info,
		slowThreshold: slowThreshold,
	}
}

// LogMode returns a copy at the requested level.
//
// Silencing has to work: repository.unlogged calls LogMode(Silent) for the
// three statements whose text contains a subscription token, and a LogMode that
// ignored its argument would put those tokens straight back into the log.
func (l gormSlog) LogMode(level gormlogger.LogLevel) gormlogger.Interface {
	l.level = level
	return l
}

func (l gormSlog) Info(ctx context.Context, msg string, args ...any) {
	if l.level >= gormlogger.Info {
		l.logger.InfoContext(ctx, "gorm: "+sprintf(msg, args))
	}
}

func (l gormSlog) Warn(ctx context.Context, msg string, args ...any) {
	if l.level >= gormlogger.Warn {
		l.logger.WarnContext(ctx, "gorm: "+sprintf(msg, args))
	}
}

func (l gormSlog) Error(ctx context.Context, msg string, args ...any) {
	if l.level >= gormlogger.Error {
		l.logger.ErrorContext(ctx, "gorm: "+sprintf(msg, args))
	}
}

// Trace is called once per statement, with the SQL built lazily by fc.
func (l gormSlog) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	if l.level <= gormlogger.Silent {
		return
	}

	elapsed := time.Since(begin)
	slow := l.slowThreshold > 0 && elapsed > l.slowThreshold

	switch {
	case err != nil && l.level >= gormlogger.Error:
		// A row that is not there is the ordinary result of asking for one, and
		// every 404 in this service produces one. Logging it as an error would
		// bury the failures that matter under the ones that do not.
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return
		}
		l.emit(ctx, slog.LevelError, "database statement failed", fc, elapsed, err)

	case slow && l.level >= gormlogger.Warn:
		// Every query in this service is a primary-key or user_id lookup, so one
		// crossing the threshold means an index is missing, not that the work was
		// large.
		l.emit(ctx, slog.LevelWarn, "slow database statement", fc, elapsed, nil)

	case l.level >= gormlogger.Info:
		l.emit(ctx, slog.LevelDebug, "database statement", fc, elapsed, nil)
	}
}

func (l gormSlog) emit(
	ctx context.Context,
	level slog.Level,
	msg string,
	fc func() (string, int64),
	elapsed time.Duration,
	err error,
) {
	if !l.logger.Enabled(ctx, level) {
		return
	}

	sql, rows := fc()

	attrs := []slog.Attr{
		logging.Millis("duration_ms", elapsed),
		slog.Int64("rows", rows),
	}
	if err != nil {
		attrs = append(attrs, logging.Err(err))
	}

	// The statement itself is debug-only, whatever level this record is being
	// emitted at. Without the text, the caller's location is what makes the line
	// actionable — it names the repository method, which is enough to find the
	// query in the source.
	if l.logger.Enabled(ctx, slog.LevelDebug) {
		attrs = append(attrs, slog.String("sql", sql))
	} else {
		attrs = append(attrs, slog.String("caller", utils.FileWithLineNum()))
	}

	l.logger.LogAttrs(ctx, level, msg, attrs...)
}

// sprintf defers to GORM's own formatting only when there is something to
// format; GORM calls Info with a bare string in some paths, and running that
// through a formatter would mangle any percent sign it contains.
func sprintf(msg string, args []any) string {
	if len(args) == 0 {
		return msg
	}
	return fmt.Sprintf(msg, args...)
}
