package mihomo

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// A bare name must resolve through PATH: os.Stat alone only sees the process
// working directory, which regressed the validator to 503 on deployments
// where MIHOMO_BINARY_PATH is "mihomo" with the binary on PATH.
func TestResolveBinaryBareNameUsesPath(t *testing.T) {
	name := "go"
	if runtime.GOOS == "windows" {
		name = "go.exe"
	}
	got, err := resolveBinary(name)
	if err != nil {
		t.Fatalf("resolveBinary(%q) = %v", name, err)
	}
	if got == name {
		t.Fatalf("expected a resolved path, got bare %q", got)
	}
}

func TestResolveBinaryMissing(t *testing.T) {
	if _, err := resolveBinary("definitely-not-a-real-binary-xyz"); err != ErrBinaryMissing {
		t.Fatalf("expected ErrBinaryMissing, got %v", err)
	}
	if _, err := resolveBinary(""); err != ErrBinaryMissing {
		t.Fatalf("expected ErrBinaryMissing for empty, got %v", err)
	}
}

func TestResolveBinaryAbsolutePath(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "mihomo")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := resolveBinary(bin)
	if err != nil {
		t.Fatal(err)
	}
	if got != bin {
		t.Fatalf("got %q want %q", got, bin)
	}
	if _, err := resolveBinary(filepath.Join(dir, "absent")); err != ErrBinaryMissing {
		t.Fatalf("expected ErrBinaryMissing, got %v", err)
	}
}

func TestValidatePassesTestFlag(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses a POSIX shell stub")
	}
	dir := t.TempDir()
	argvFile := filepath.Join(dir, "argv")
	stub := filepath.Join(dir, "mihomo")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"" + argvFile + "\"\n"
	if err := os.WriteFile(stub, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	r := NewExecRunner(stub, 10*time.Second)
	res, err := r.Validate(context.Background(), []byte("proxies: []\n"))
	if err != nil {
		t.Fatalf("Validate = %v", err)
	}
	if !res.Valid {
		t.Fatalf("expected valid result, got %+v", res)
	}
	argv, err := os.ReadFile(argvFile)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(argv)), "\n")
	if len(lines) != 3 || lines[0] != "-t" || lines[1] != "-f" || !strings.HasSuffix(lines[2], "config.yaml") {
		t.Fatalf("expected [-t -f <config.yaml>], got %q", lines)
	}
}
