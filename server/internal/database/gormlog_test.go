package database

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// The SQL this service runs carries the values it is storing, and those are
// config documents — with proxy passwords in them — and subscription tokens.
const secretSQL = `INSERT INTO mihomo_configs (ir) VALUES ('{"password":"hunter2"}')`

// Around the adapter's threshold, so a test can be plainly one side of it.
const (
	slowThreshold = 200 * time.Millisecond
	quick         = time.Millisecond
	slow          = time.Second
)

// traced runs one statement through the adapter and returns the record it
// produced, or nil if it produced none. elapsed decides whether the statement
// counts as slow, so each test states that rather than inheriting it.
func traced(t *testing.T, level slog.Level, elapsed time.Duration, err error) map[string]any {
	t.Helper()

	var out bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&out, &slog.HandlerOptions{Level: level}))

	newGormLogger(logger, slowThreshold).
		Trace(context.Background(), time.Now().Add(-elapsed),
			func() (string, int64) { return secretSQL, 1 }, err)

	line := strings.TrimSpace(out.String())
	if line == "" {
		return nil
	}
	var record map[string]any
	if jsonErr := json.Unmarshal([]byte(line), &record); jsonErr != nil {
		t.Fatalf("trace output is not valid JSON: %v\n%s", jsonErr, line)
	}
	return record
}

// A failing statement is logged at every level, including in production. If the
// statement text went with it, one duplicate-key violation on a config insert
// would write somebody's proxy passwords into a log that gets shipped
// elsewhere and kept for months.
func TestFailingStatementDoesNotLogItsSQLAtInfo(t *testing.T) {
	record := traced(t, slog.LevelInfo, quick, errors.New("duplicate key value violates unique constraint"))
	if record == nil {
		t.Fatal("a failing statement logged nothing at info level")
	}

	if _, ok := record["sql"]; ok {
		t.Errorf("the statement text was logged at info level: %v", record["sql"])
	}
	for _, field := range []string{"err", "caller", "duration_ms"} {
		if _, ok := record[field]; !ok {
			t.Errorf("field %q is missing; without it the error names nothing actionable", field)
		}
	}
	// The caller's location is what replaces the statement: it names the
	// repository method, which is enough to find the query in the source.
	if caller, _ := record["caller"].(string); !strings.Contains(caller, ".go") {
		t.Errorf("caller = %q, want a file:line", caller)
	}
}

// Debug is the deliberate opposite: a developer at a terminal wants the
// statement, and LOG_LEVEL=debug is how they ask for it.
func TestDebugLevelLogsTheStatement(t *testing.T) {
	record := traced(t, slog.LevelDebug, quick, nil)
	if record == nil {
		t.Fatal("nothing was logged at debug level")
	}

	if got, _ := record["sql"].(string); got != secretSQL {
		t.Errorf("sql = %q, want the statement", got)
	}
}

// A successful statement is a debug detail. At info — production's default —
// it must not appear at all, or every insert would print its values.
func TestSuccessfulStatementIsSilentAtInfo(t *testing.T) {
	if record := traced(t, slog.LevelInfo, quick, nil); record != nil {
		t.Errorf("a successful statement was logged at info level: %v", record)
	}
}

// repository.unlogged calls LogMode(Silent) for the three statements whose text
// contains a subscription token. A LogMode that ignored its argument would put
// those tokens straight into the log, which is the leak the whole redaction
// effort exists to prevent.
func TestSilentLogModeLogsNothing(t *testing.T) {
	var out bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&out, &slog.HandlerOptions{Level: slog.LevelDebug}))

	silent := newGormLogger(logger, time.Millisecond).LogMode(gormlogger.Silent)

	// Every path: a plain statement, a slow one, and a failing one.
	silent.Trace(context.Background(), time.Now(),
		func() (string, int64) { return secretSQL, 1 }, nil)
	silent.Trace(context.Background(), time.Now().Add(-time.Hour),
		func() (string, int64) { return secretSQL, 1 }, nil)
	silent.Trace(context.Background(), time.Now(),
		func() (string, int64) { return secretSQL, 0 }, errors.New("boom"))
	silent.Info(context.Background(), "info")
	silent.Warn(context.Background(), "warn")
	silent.Error(context.Background(), "error")

	if out.Len() != 0 {
		t.Errorf("a silenced logger wrote:\n%s", out.String())
	}
}

// Asking for a row that is not there is the ordinary result of a lookup, and
// every 404 in this service produces one. Logged as an error, they would bury
// the failures that matter.
func TestRecordNotFoundIsNotAnError(t *testing.T) {
	if record := traced(t, slog.LevelInfo, quick, gorm.ErrRecordNotFound); record != nil {
		t.Errorf("a missing row was logged as an error: %v", record)
	}
}

// A statement over the threshold means an index is missing — every query here is
// a primary-key or user_id lookup — so it is worth a warning even in production,
// where its text is still withheld.
func TestSlowStatementWarnsWithoutItsSQL(t *testing.T) {
	record := traced(t, slog.LevelInfo, slow, nil)
	if record == nil {
		t.Fatal("a one-second statement was not logged at info level")
	}
	if got := record["level"]; got != "WARN" {
		t.Errorf("level = %v, want WARN", got)
	}
	if _, ok := record["sql"]; ok {
		t.Error("the slow statement's text was logged at info level")
	}
}
