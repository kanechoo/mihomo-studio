package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/ratelimit"
	"mihomo-studio-server/internal/response"
)

func limitedEngine(limit int, key KeyFunc) *gin.Engine {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(RequestID())
	r.GET("/sub/:token",
		RateLimit(ratelimit.New(limit, time.Minute), key),
		func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	return r
}

func get(r *gin.Engine, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

// Past the limit the handler must not run at all. That is the point of putting
// this in front of it: /sub/:token needs no credential to reach, and the work
// behind it is two indexed queries and a write.
func TestRateLimitRefusesPastTheLimit(t *testing.T) {
	r := limitedEngine(2, ClientIPKey)
	path := "/sub/" + sampleToken

	for i := 1; i <= 2; i++ {
		if code := get(r, path).Code; code != http.StatusOK {
			t.Fatalf("request %d returned %d, want 200", i, code)
		}
	}

	rec := get(r, path)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("the 3rd request returned %d, want 429", rec.Code)
	}

	// A refusal a client cannot act on is a refusal it will retry immediately.
	retryAfter := rec.Header().Get("Retry-After")
	seconds, err := strconv.Atoi(retryAfter)
	if err != nil || seconds < 1 {
		t.Errorf("Retry-After = %q, want a positive whole number of seconds", retryAfter)
	}

	// The frontend switches on the code, not the status, so it has to be there
	// and it has to be the documented one.
	var body response.ErrorBody
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the 429 body is not the API's error envelope: %v", err)
	}
	if body.Error.Code != response.CodeRateLimited {
		t.Errorf("code = %q, want %q", body.Error.Code, response.CodeRateLimited)
	}
	if body.Error.RequestID == "" {
		t.Error("the 429 body carries no request_id, so a user reporting it cannot be traced")
	}
}

// The token bucket exists so that one device retrying in a loop is refused on
// its own account, rather than out of an allowance shared with every other
// device behind the same address.
func TestPerTokenLimitDoesNotAffectOtherTokens(t *testing.T) {
	r := limitedEngine(1, SubscriptionTokenKey)
	other := "Zz9yXw8vUt7sRq6pOn5mLk4jIh3gFe2dCb1aZy0xWv1"

	if code := get(r, "/sub/"+sampleToken).Code; code != http.StatusOK {
		t.Fatalf("first fetch returned %d, want 200", code)
	}
	if code := get(r, "/sub/"+sampleToken).Code; code != http.StatusTooManyRequests {
		t.Fatalf("second fetch of the same token returned %d, want 429", code)
	}
	if code := get(r, "/sub/"+other).Code; code != http.StatusOK {
		t.Errorf("a different token returned %d; the buckets are shared", code)
	}
}

// A token is a bearer credential, and this map lives for the life of the
// process. Hashing keeps thousands of live credentials out of a structure that
// ends up in a heap profile or a core dump.
func TestSubscriptionTokenKeyHashes(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Params = gin.Params{{Key: "token", Value: sampleToken}}

	key := SubscriptionTokenKey(c)
	if key == "" {
		t.Fatal("a well-formed token got no bucket")
	}
	if strings.Contains(key, sampleToken) || key == sampleToken {
		t.Error("the bucket key is the token itself")
	}
	if len(key) != 32 {
		t.Errorf("key length = %d, want 32 hex characters", len(key))
	}
}

// Junk paths get no bucket of their own, or filling the map would be as easy as
// requesting a different nonsense URL each time. They cannot match a row
// anyway, and the per-IP limiter is what bounds them.
func TestMalformedTokensGetNoBucket(t *testing.T) {
	for _, token := range []string{"", "short", strings.Repeat("x", 500), "has spaces in it"} {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Params = gin.Params{{Key: "token", Value: token}}

		if key := SubscriptionTokenKey(c); key != "" {
			t.Errorf("token %q got bucket %q, want none", token, key)
		}
	}
}
