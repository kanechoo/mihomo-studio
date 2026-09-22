// Package mihomo runs the real mihomo binary against submitted
// configurations. It is the first content-aware feature on this server: the
// API has always stored config text verbatim, and it still does — this
// package only ever reads bytes handed to it, in a process that is bounded,
// sandboxed by argument array (never a shell), and cleaned up afterwards.
package mihomo

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Result is what one validation run produced. Stdout/stderr are the raw
// process output (bounded); Diagnostics is a best-effort structured reading
// of stderr. The raw text always ships too, because the parser is regex-based
// against mihomo's log format and must never be the only way to see a failure.
type Result struct {
	Valid       bool         `json:"valid"`
	ExitCode    int          `json:"exitCode"`
	Stdout      string       `json:"stdout"`
	Stderr      string       `json:"stderr"`
	DurationMs  int64        `json:"durationMs"`
	Diagnostics []Diagnostic `json:"diagnostics"`
}

// Diagnostic maps one parsed line of mihomo output onto something a UI can
// scroll to. Line is best-effort: mihomo's error lines usually carry a YAML
// line number, but nothing guarantees one.
type Diagnostic struct {
	Line     int    `json:"line,omitempty"`
	Section  string `json:"section,omitempty"`
	Message  string `json:"message"`
	Severity string `json:"severity"` // "error" | "warning"
}

// ErrBinaryMissing reports that MIHOMO_BINARY_PATH does not resolve. The
// handler turns it into 503 so the frontend can degrade to local-only
// validation instead of surfacing an opaque failure.
var ErrBinaryMissing = errors.New("mihomo binary not found")

// Runner executes validations. It is an interface so handlers can be tested
// without a real mihomo on PATH.
type Runner interface {
	Validate(ctx context.Context, config []byte) (Result, error)
	Version(ctx context.Context) (string, error)
}

// resolveBinary turns the configured value into an executable path. A value
// with no separator is looked up on PATH (os.Stat cannot do that — it only
// sees the process working directory, which in a distroless image is "/",
// so a bare "mihomo" would always report missing even with the binary
// installed). Anything else must exist as given.
func resolveBinary(configured string) (string, error) {
	if configured == "" {
		return "", ErrBinaryMissing
	}
	if !strings.ContainsAny(configured, `/\`) {
		if found, err := exec.LookPath(configured); err == nil {
			return found, nil
		}
		return "", ErrBinaryMissing
	}
	if _, err := os.Stat(configured); err != nil {
		return "", ErrBinaryMissing
	}
	return configured, nil
}

// ExecRunner shells out — via exec.CommandContext with an argument array; no
// shell ever sees this input — to the configured binary.
type ExecRunner struct {
	binaryPath string
	timeout    time.Duration
	// now makes duration accounting testable.
	now func() time.Time
}

func NewExecRunner(binaryPath string, timeout time.Duration) *ExecRunner {
	return &ExecRunner{binaryPath: binaryPath, timeout: timeout, now: time.Now}
}

// maxOutputBytes bounds how much process output is kept per stream. A config
// that sends mihomo into a verbose loop must not balloon the response or the
// logs; everything past the cap is truncated with a marker.
const maxOutputBytes = 64 << 10 // 64 KiB

func truncate(s string) string {
	if len(s) <= maxOutputBytes {
		return s
	}
	return s[:maxOutputBytes] + "\n… [truncated]"
}

// Validate writes the config to its own temporary file and runs
// `mihomo -t -f <file>`. The file lives alone in a fresh directory so two
// concurrent validations cannot touch each other, and is removed before this
// call returns.
func (r *ExecRunner) Validate(ctx context.Context, config []byte) (Result, error) {
	start := r.now()

	binary, err := resolveBinary(r.binaryPath)
	if err != nil {
		return Result{}, err
	}

	dir, err := os.MkdirTemp("", "mihomo-validate-")
	if err != nil {
		return Result{}, fmt.Errorf("create temp dir: %w", err)
	}
	defer func() { _ = os.RemoveAll(dir) }()

	path := filepath.Join(dir, "config.yaml")
	// 0600: the file carries whatever secrets the config holds, and only this
	// process's user should read it even transiently.
	if err := os.WriteFile(path, config, 0o600); err != nil {
		return Result{}, fmt.Errorf("write temp config: %w", err)
	}

	runCtx, cancel := context.WithTimeout(ctx, r.timeout)
	defer cancel()

	stdout, stderr, exitCode, err := runCommand(runCtx, binary, "-t", "-f", path)
	duration := r.now().Sub(start)

	result := Result{
		Valid:      err == nil && exitCode == 0,
		ExitCode:   exitCode,
		Stdout:     truncate(stdout),
		Stderr:     truncate(stderr),
		DurationMs: duration.Milliseconds(),
	}
	result.Diagnostics = parseDiagnostics(stderr)

	if err != nil {
		// Context cancellation and start failures are operational errors, not
		// validation outcomes.
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) || ctx.Err() != nil {
			return result, fmt.Errorf("mihomo -t timed out after %s", r.timeout)
		}
		if exitCode == 0 {
			return result, fmt.Errorf("run mihomo: %w", err)
		}
		// The binary ran and failed the config: that IS a validation result.
	}
	return result, nil
}

// Version returns the first line of `mihomo -v`.
func (r *ExecRunner) Version(ctx context.Context) (string, error) {
	binary, err := resolveBinary(r.binaryPath)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	stdout, _, _, err := runCommand(ctx, binary, "-v")
	if err != nil {
		return "", fmt.Errorf("run mihomo -v: %w", err)
	}
	line, _, _ := strings.Cut(stdout, "\n")
	return strings.TrimSpace(line), nil
}

// levelRe matches mihomo's logfmt-ish error lines:
//
//	time=… level=error msg="yaml: line 42: …" …
//
// and plainer forms like `FATA[0000] yaml: line 3: …` from older builds.
var (
	levelRe = regexp.MustCompile(`level=(\w+)\s+msg="([^"]*)"`)
	lineRe  = regexp.MustCompile(`line (\d+)`)
	fataRe  = regexp.MustCompile(`^(?:FATA|ERRO)\[[^\]]*\]\s*(.*)$`)
)

func parseDiagnostics(stderr string) []Diagnostic {
	// Never return nil: encoding/json renders a nil slice as `null`, which
	// breaks array-typed API consumers (the web client calls .slice on it).
	// An empty result must serialize as `[]`.
	if strings.TrimSpace(stderr) == "" {
		return []Diagnostic{}
	}
	out := []Diagnostic{}
	for _, line := range strings.Split(stderr, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var d Diagnostic
		if m := levelRe.FindStringSubmatch(line); m != nil {
			switch m[1] {
			case "error", "fatal", "panic":
				d.Severity = "error"
			case "warn":
				d.Severity = "warning"
			default:
				continue // info/debug noise is not a diagnostic
			}
			d.Message = m[2]
		} else if m := fataRe.FindStringSubmatch(line); m != nil {
			d.Severity = "error"
			d.Message = strings.TrimSpace(m[1])
		} else {
			continue
		}

		if lm := lineRe.FindStringSubmatch(d.Message); lm != nil {
			if n, err := strconv.Atoi(lm[1]); err == nil {
				d.Line = n
			}
		}
		out = append(out, d)
	}
	return out
}
