package middleware

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// A token the server would plausibly have issued: 43 base64url characters, the
// length model.NewSubscriptionToken produces.
const sampleToken = "Ah7dQx2vKpL9mNbT4rWfZs6UyE1cJo3XgV5iRnP0dHk"

func newTestEngine(out *bytes.Buffer) *gin.Engine {
	gin.SetMode(gin.TestMode)

	logger := slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{Level: slog.LevelDebug}))

	r := gin.New()
	r.Use(RequestID())
	r.Use(Logger(logger))
	return r
}

// The single most important property of the access log. A subscription token is
// a bearer credential in URL form: it reaches proxy passwords, it is not tied to
// a session, and logs outlive it — they get shipped to aggregators and read by
// people who have no business holding it.
func TestAccessLogNeverContainsASubscriptionToken(t *testing.T) {
	var out bytes.Buffer
	r := newTestEngine(&out)
	r.GET("/sub/:token", func(c *gin.Context) { c.String(http.StatusOK, "proxies: []") })

	req := httptest.NewRequest(http.MethodGet, "/sub/"+sampleToken, nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	logged := out.String()
	if strings.Contains(logged, sampleToken) {
		t.Fatalf("the token reached the log:\n%s", logged)
	}
	if !strings.Contains(logged, "/sub/<token>") {
		t.Errorf("want the path recorded as /sub/<token>, got:\n%s", logged)
	}
}

// Redaction must not depend on the request succeeding. A token that no longer
// exists still identifies a subscription someone once had, and the 404 path is
// the one a caller can trigger at will.
func TestAccessLogRedactsOnEveryStatus(t *testing.T) {
	var out bytes.Buffer
	r := newTestEngine(&out)
	r.GET("/sub/:token", func(c *gin.Context) { c.Status(http.StatusNotFound) })

	req := httptest.NewRequest(http.MethodGet, "/sub/"+sampleToken, nil)
	r.ServeHTTP(httptest.NewRecorder(), req)

	if strings.Contains(out.String(), sampleToken) {
		t.Fatalf("the token reached the log on a 404:\n%s", out.String())
	}
}

// The fields are the reason for the change: a record whose status has to be
// recovered from a formatted string is one nobody can alert on.
func TestAccessLogIsStructured(t *testing.T) {
	var out bytes.Buffer
	r := newTestEngine(&out)
	r.GET("/api/v1/configs", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/api/v1/configs", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	var record map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out.String())), &record); err != nil {
		t.Fatalf("the access record is not valid JSON: %v\n%s", err, out.String())
	}

	for _, field := range []string{"method", "path", "status", "duration_ms", "bytes", "ip", "request_id"} {
		if _, ok := record[field]; !ok {
			t.Errorf("field %q is missing from the access record: %v", field, record)
		}
	}
	if got := record["status"]; got != float64(http.StatusOK) {
		t.Errorf("status = %v, want 200", got)
	}

	// The ID in the record is the one the caller was handed, or it cannot be
	// used to find this request.
	if got, want := record["request_id"], rec.Header().Get(RequestIDHeader); got != want {
		t.Errorf("request_id = %v, but the response header says %q", got, want)
	}
}

// A 5xx is ours and a 4xx is the caller's, and only one of them should ever wake
// anyone up. Levelling by status is what makes that a filter rather than a
// search through message text.
func TestAccessLogLevelFollowsStatus(t *testing.T) {
	cases := []struct {
		status int
		want   string
	}{
		{http.StatusOK, "INFO"},
		{http.StatusNotFound, "WARN"},
		{http.StatusTooManyRequests, "WARN"},
		{http.StatusInternalServerError, "ERROR"},
	}

	for _, tc := range cases {
		var out bytes.Buffer
		r := newTestEngine(&out)
		r.GET("/x", func(c *gin.Context) { c.Status(tc.status) })
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))

		var record map[string]any
		if err := json.Unmarshal([]byte(strings.TrimSpace(out.String())), &record); err != nil {
			t.Fatalf("status %d: %v", tc.status, err)
		}
		if got := record["level"]; got != tc.want {
			t.Errorf("status %d logged at %v, want %s", tc.status, got, tc.want)
		}
	}
}
