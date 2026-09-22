package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/response"
)

const (
	authorizationHeader = "Authorization"
	bearerScheme        = "bearer"
)

// RequireAuth rejects any request without a valid session token and records who
// the caller is for the handlers behind it.
//
// This is where every user_id in the service originates. Nothing downstream may
// take that value from a body, a query parameter, or a path segment: those are
// all chosen by the caller, and accepting one would let anybody read anybody
// else's configs by editing a number.
func RequireAuth(issuer *auth.Issuer) gin.HandlerFunc {
	return func(c *gin.Context) {
		token, ok := bearerToken(c.GetHeader(authorizationHeader))
		if !ok {
			unauthorized(c, "authentication required")
			return
		}

		userID, err := issuer.Parse(token)
		if err != nil {
			// Logged for the access line, not returned: the reason a token failed
			// is feedback an attacker can iterate against.
			_ = c.Error(err)
			unauthorized(c, "invalid or expired token")
			return
		}

		c.Set(auth.ContextUserID, userID)
		c.Next()
	}
}

// bearerToken pulls the credential out of "Bearer <token>".
//
// The scheme is compared case-insensitively because RFC 7235 says it is
// case-insensitive, and clients do send "bearer" — refusing those produces a
// 401 that looks like a bad token and sends people hunting in the wrong place.
func bearerToken(header string) (string, bool) {
	scheme, value, found := strings.Cut(strings.TrimSpace(header), " ")
	if !found || !strings.EqualFold(scheme, bearerScheme) {
		return "", false
	}
	value = strings.TrimSpace(value)
	if value == "" {
		return "", false
	}
	return value, true
}

func unauthorized(c *gin.Context, message string) {
	// Required by RFC 7235 on a 401, and it is what tells a client the failure
	// is an authentication problem rather than the endpoint being broken.
	c.Header("WWW-Authenticate", `Bearer realm="api"`)
	response.Fail(c, http.StatusUnauthorized, response.CodeUnauthorized, message)
}
