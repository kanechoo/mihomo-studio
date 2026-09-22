package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/fetcher"
	"mihomo-studio-server/internal/response"
)

func fetchFailure(t *testing.T, err error) (int, response.ErrorBody) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/import/fetch", nil)

	failImportFetchError(c, err)

	var body response.ErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("response body is not the error envelope: %v (%s)", err, recorder.Body)
	}
	return recorder.Code, body
}

// A bad URL is the caller's mistake and says nothing they did not send; a
// failure on the other end is not, and gets a fixed sentence.
func TestImportFetchErrorsAreClassified(t *testing.T) {
	cases := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"invalid url", fetcher.ErrInvalidURL, http.StatusBadRequest, response.CodeBadRequest},
		{"scheme", fetcher.ErrScheme, http.StatusBadRequest, response.CodeBadRequest},
		{"blocked", fetcher.ErrBlocked, http.StatusBadRequest, response.CodeBadRequest},
		{"too large", fetcher.ErrTooLarge, http.StatusBadGateway, response.CodeUnavailable},
		{"not text", fetcher.ErrNotText, http.StatusBadGateway, response.CodeUnavailable},
		{"upstream status", fmt.Errorf("%w: HTTP 403", fetcher.ErrUpstreamStatus),
			http.StatusBadGateway, response.CodeUnavailable},
		{"transport", fmt.Errorf("dial tcp: connection refused"),
			http.StatusBadGateway, response.CodeUnavailable},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, body := fetchFailure(t, tc.err)
			if status != tc.status {
				t.Errorf("status = %d, want %d", status, tc.status)
			}
			if body.Error.Code != tc.code {
				t.Errorf("code = %q, want %q", body.Error.Code, tc.code)
			}
			if strings.TrimSpace(body.Error.Message) == "" {
				t.Error("message is empty")
			}
		})
	}
}

// The status the other server answered with is worth repeating: an expired
// subscription token shows up as a 403, and the user is the only one who can
// fix that.
func TestImportFetchQuotesUpstreamStatus(t *testing.T) {
	_, body := fetchFailure(t, fmt.Errorf("%w: HTTP 403", fetcher.ErrUpstreamStatus))
	if !strings.Contains(body.Error.Message, "403") {
		t.Errorf("message = %q, want it to name the status", body.Error.Message)
	}
}

// The address a refused dial was aimed at must not come back out. On an
// endpoint that fetches URLs for the caller, the error message is the channel:
// "blocked" versus "connection refused" versus a timeout is already a scan of
// the internal network, and echoing the address makes it a readable one.
func TestImportFetchDoesNotEchoBlockedAddresses(t *testing.T) {
	leaky := fmt.Errorf("%w: 169.254.169.254", fetcher.ErrBlocked)

	_, body := fetchFailure(t, leaky)
	if strings.Contains(body.Error.Message, "169.254.169.254") {
		t.Errorf("message = %q, which quotes the address that was refused", body.Error.Message)
	}
}

// Likewise for a transport failure, whose text routinely carries the address
// and port that were dialled.
func TestImportFetchDoesNotEchoTransportDetail(t *testing.T) {
	_, body := fetchFailure(t, fmt.Errorf("dial tcp 10.0.0.5:5432: connect: connection refused"))
	if strings.Contains(body.Error.Message, "10.0.0.5") {
		t.Errorf("message = %q, which quotes the address that was dialled", body.Error.Message)
	}
}
