package auth

import "github.com/gin-gonic/gin"

// ContextUserID is where the JWT middleware stores the verified caller.
//
// Kept here rather than in middleware so that handlers can read it without
// importing the middleware package, and so there is exactly one name for it:
// two spellings of this key would mean a handler silently reading nothing and
// treating the request as anonymous.
const ContextUserID = "auth_user_id"

// UserID returns the authenticated caller's ID.
//
// The boolean is not a formality. Every repository call takes this value as its
// tenant filter, and a handler that ignored a false here would run its query
// with userID 0 — which matches no rows today, but is one schema change away
// from matching someone's.
func UserID(c *gin.Context) (uint, bool) {
	if c == nil {
		return 0, false
	}
	v, ok := c.Get(ContextUserID)
	if !ok {
		return 0, false
	}
	id, ok := v.(uint)
	if !ok || id == 0 {
		return 0, false
	}
	return id, true
}
