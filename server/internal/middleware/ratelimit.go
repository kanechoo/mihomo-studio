package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/ratelimit"
	"mihomo-studio-server/internal/response"
)

// KeyFunc decides which bucket a request counts against. Returning "" means the
// limiter does not apply to this request.
type KeyFunc func(*gin.Context) string

// RateLimit refuses requests that arrive faster than the limiter allows.
//
// Placed before the handler, so a refused request costs a map lookup rather
// than a database round trip — which is the point on /sub/:token, where the
// work behind the endpoint is two indexed queries and an update, and the caller
// needs no credential to ask for it.
func RateLimit(limiter *ratelimit.Limiter, key KeyFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		allowed, retryAfter := limiter.Allow(key(c))
		if allowed {
			c.Next()
			return
		}

		// Retry-After in seconds, per RFC 9110. Mihomo clients do not read it, but
		// it is what tells a script — and a human with curl — that the refusal is
		// temporary and how long to wait, rather than leaving them to guess or to
		// retry immediately and stay refused.
		seconds := int(retryAfter / time.Second)
		if seconds < 1 {
			seconds = 1
		}
		c.Header("Retry-After", strconv.Itoa(seconds))

		response.Fail(c, http.StatusTooManyRequests, response.CodeRateLimited,
			"too many requests; wait "+strconv.Itoa(seconds)+"s and try again")
	}
}

// ClientIPKey buckets by caller address.
//
// What ClientIP returns depends on TRUSTED_PROXIES: with none trusted it is the
// socket address, which is the value this limiter needs. Trusting every proxy —
// Gin's default, disabled in router.New — would make it read whatever
// X-Forwarded-For the caller sent, and a limit whose key the caller chooses is
// not a limit.
func ClientIPKey(c *gin.Context) string { return c.ClientIP() }

// SubscriptionTokenKey buckets by which subscription is being fetched, so that
// one client stuck in a retry loop cannot spend the allowance of every other
// client behind the same address.
//
// The token is hashed rather than used directly. It is a bearer credential, and
// a long-lived in-memory map holding thousands of them is a structure that ends
// up in a heap profile or a core dump — the same reason the access log redacts
// it out of the path.
//
// Malformed tokens get no bucket at all. They cannot match a row, so the
// handler rejects them without touching the database, and giving each junk
// string its own bucket is exactly how a caller would fill the map. The per-IP
// limiter is what covers them.
func SubscriptionTokenKey(c *gin.Context) string {
	token := c.Param("token")
	if !model.TokenLooksWellFormed(token) {
		return ""
	}
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:16])
}

// ShareTokenKey buckets by which server-config share is being fetched.
//
// An alias, not a copy: the two public token routes carry the same kind of
// credential under the same parameter name, so they share one key function
// rather than growing a second implementation to keep in step.
func ShareTokenKey(c *gin.Context) string { return SubscriptionTokenKey(c) }

// UserIDKey buckets by the authenticated caller.
//
// For routes that already require a token, where the address is the wrong key:
// a household behind one NAT address is several users, and one user on a phone
// moving between networks is several addresses. Only usable after RequireAuth —
// with no verified user there is no bucket, and the middleware runs the handler
// unlimited, which is safe here because that handler refuses anonymous callers
// anyway.
func UserIDKey(c *gin.Context) string {
	userID, ok := auth.UserID(c)
	if !ok {
		return ""
	}
	return strconv.FormatUint(uint64(userID), 10)
}
