package mihomo

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParseDiagnosticsExtractsLineNumbers(t *testing.T) {
	stderr := "time=2026-08-25T00:00:00 level=info msg=\"start\"\n" +
		"time=2026-08-25T00:00:00 level=error msg=\"yaml: line 42: did not find expected key\"\n"
	diags := parseDiagnostics(stderr)
	if len(diags) != 1 {
		t.Fatalf("diagnostics = %+v, want exactly the one error line", diags)
	}
	if diags[0].Line != 42 || diags[0].Severity != "error" {
		t.Fatalf("diagnostic = %+v, want line 42 severity error", diags[0])
	}
}

func TestParseDiagnosticsNeverNil(t *testing.T) {
	// A valid config produces empty stderr; the result must still serialize
	// as `[]`, never `null` — the web client calls .slice on it.
	for _, stderr := range []string{"", "   \n  ", "time=2026-08-25T00:00:00 level=info msg=\"start\""} {
		diags := parseDiagnostics(stderr)
		if diags == nil {
			t.Fatalf("parseDiagnostics(%q) = nil, want empty slice", stderr)
		}
		raw, err := json.Marshal(diags)
		if err != nil {
			t.Fatal(err)
		}
		if strings.TrimSpace(string(raw)) == "null" {
			t.Fatalf("parseDiagnostics(%q) serializes as null, want []", stderr)
		}
	}
}
