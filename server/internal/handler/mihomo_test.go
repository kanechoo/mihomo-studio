package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/mihomo"
)

// fakeRunner stands in for the subprocess so these tests exercise the HTTP
// contract — status codes, the response envelope, and what leaks — rather
// than a real mihomo build.
type fakeRunner struct {
	result mihomo.Result
	err    error
}

func (f *fakeRunner) Validate(context.Context, []byte) (mihomo.Result, error) {
	return f.result, f.err
}

func (f *fakeRunner) Version(context.Context) (string, error) {
	if f.err != nil {
		return "", f.err
	}
	return "Mihomo Meta v1.19.0", nil
}

func newTestMihomoServer(runner mihomo.Runner) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewMihomo(runner)
	r.POST("/validate", h.Validate)
	r.GET("/version", h.Version)
	return r
}

func postValidate(r *gin.Engine, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/validate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestValidateSuccessReturnsStructuredResult(t *testing.T) {
	r := newTestMihomoServer(&fakeRunner{
		result: mihomo.Result{Valid: true, ExitCode: 0, Stderr: "", Diagnostics: nil},
	})
	w := postValidate(r, `{"config":"mode: rule\n"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got mihomo.Result
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("response not the validate shape: %v", err)
	}
	if !got.Valid {
		t.Fatalf("valid = false, want true")
	}
}

func TestValidateFailedConfigIs200WithValidFalse(t *testing.T) {
	// A config mihomo rejects is a successful validation of a bad document —
	// the run happened and produced a verdict. It must not be a 5xx.
	r := newTestMihomoServer(&fakeRunner{
		result: mihomo.Result{
			Valid:       false,
			ExitCode:    1,
			Stderr:      "yaml: unmarshal errors",
			Diagnostics: []mihomo.Diagnostic{{Message: "yaml: unmarshal errors", Severity: "error"}},
		},
	})
	w := postValidate(r, `{"config":"mode: nonsense\n"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var got mihomo.Result
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if got.Valid || len(got.Diagnostics) == 0 {
		t.Fatalf("expected valid=false with diagnostics, got %+v", got)
	}
}

func TestValidateBinaryMissingIs503(t *testing.T) {
	r := newTestMihomoServer(&fakeRunner{err: mihomo.ErrBinaryMissing})
	w := postValidate(r, `{"config":"mode: rule\n"}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
	// The envelope code must be "unavailable" so the client can distinguish
	// "no validator here" from every other failure class.
	if !strings.Contains(w.Body.String(), `"unavailable"`) {
		t.Fatalf("body missing unavailable code: %s", w.Body.String())
	}
}

func TestValidateTimeoutIs503(t *testing.T) {
	r := newTestMihomoServer(&fakeRunner{err: errors.New("mihomo -t timed out after 10s")})
	w := postValidate(r, `{"config":"mode: rule\n"}`)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}

func TestValidateRejectsEmptyAndMalformedBodies(t *testing.T) {
	r := newTestMihomoServer(&fakeRunner{})
	if w := postValidate(r, `{"config":""}`); w.Code != http.StatusBadRequest {
		t.Fatalf("empty config: status = %d, want 400", w.Code)
	}
	if w := postValidate(r, `{"config":"   \n  "}`); w.Code != http.StatusBadRequest {
		t.Fatalf("whitespace config: status = %d, want 400", w.Code)
	}
	if w := postValidate(r, `not json`); w.Code != http.StatusBadRequest {
		t.Fatalf("malformed body: status = %d, want 400", w.Code)
	}
}

func TestVersionBinaryMissingIs503(t *testing.T) {
	r := newTestMihomoServer(&fakeRunner{err: mihomo.ErrBinaryMissing})
	req := httptest.NewRequest(http.MethodGet, "/version", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", w.Code)
	}
}
