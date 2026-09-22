package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const preflightMaxAge = 12 * time.Hour

// CORS answers cross-origin requests from the configured origins only.
//
// Written by hand rather than pulled in as a dependency: the policy is a dozen
// lines, and the one decision that matters — never reflecting an arbitrary
// Origin — is easier to see here than in another package's option struct.
//
// The allowlist is exact-match. Wildcards are not supported on purpose: the
// browser is carrying a bearer token that grants full access to a user's proxy
// credentials, and "*" would let any page on the internet spend it.
func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[strings.TrimRight(strings.TrimSpace(o), "/")] = struct{}{}
	}

	allowMethods := strings.Join([]string{
		http.MethodGet, http.MethodPost, http.MethodPut,
		http.MethodDelete, http.MethodOptions,
	}, ", ")
	allowHeaders := strings.Join([]string{
		"Authorization", "Content-Type", RequestIDHeader,
	}, ", ")
	maxAge := strconv.Itoa(int(preflightMaxAge.Seconds()))

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Vary is set for every request that carries an Origin, allowed or not.
		// Without it a shared cache can store the response for one origin and
		// replay it to another, handing out an Allow-Origin header that was never
		// meant for that caller.
		if origin != "" {
			c.Header("Vary", "Origin")
		}

		_, ok := allowed[origin]
		if origin != "" && ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Expose-Headers", RequestIDHeader)
		}

		if c.Request.Method == http.MethodOptions {
			// An unapproved origin gets 403 rather than a 204 with no CORS headers.
			// Both fail in the browser, but this one says why in the network tab
			// instead of looking like a broken endpoint.
			if !ok {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			c.Header("Access-Control-Allow-Methods", allowMethods)
			c.Header("Access-Control-Allow-Headers", allowHeaders)
			c.Header("Access-Control-Max-Age", maxAge)
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
