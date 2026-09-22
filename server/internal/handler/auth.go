package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/repository"
	"mihomo-studio-server/internal/response"
	"mihomo-studio-server/internal/service"
)

// An OAuth code is around 20 characters. The cap is generous enough to survive
// GitHub changing the format and small enough that this unauthenticated
// endpoint cannot be used to make the process read an arbitrary amount of JSON.
const maxAuthBodyBytes = 4 << 10

type Auth struct {
	svc *service.Auth
}

func NewAuth(svc *service.Auth) *Auth { return &Auth{svc: svc} }

type githubLoginRequest struct {
	Code string `json:"code" binding:"required,max=512"`
}

// GithubLogin exchanges an OAuth code for a session token.
//
// The endpoint is public — it has to be, it is how a caller stops being
// anonymous — so it is the one place a stranger can make this service open an
// outbound connection. Hence the body cap here and the rate limit in Step 7.
func (h *Auth) GithubLogin(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAuthBodyBytes)

	var req githubLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"request body must be JSON with a non-empty code field")
		return
	}

	session, err := h.svc.SignInWithGithub(c.Request.Context(), req.Code)
	if err != nil {
		// Every branch logs the real cause and returns a summary: the wrapped
		// error can name the token endpoint, and further down the chain a GORM
		// failure can name tables and columns.
		_ = c.Error(err)

		if errors.Is(err, auth.ErrCodeRejected) {
			// The caller's code was no good — usually a stale one from a reloaded
			// callback page, since GitHub codes are single-use.
			response.Fail(c, http.StatusUnauthorized, response.CodeUnauthorized,
				"github did not accept this authorization code; start the sign-in again")
			return
		}

		// GitHub unreachable, or the database refused the write. Neither is the
		// caller's doing and both are worth retrying, which is what 503 says.
		response.Fail(c, http.StatusServiceUnavailable, response.CodeUnavailable,
			"could not complete sign-in, please try again")
		return
	}

	c.JSON(http.StatusOK, session)
}

// Me returns the signed-in user, and doubles as the frontend's check that a
// stored token is still good before it shows the editor.
func (h *Auth) Me(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	user, err := h.svc.CurrentUser(c.Request.Context(), userID)
	if err != nil {
		_ = c.Error(err)
		if errors.Is(err, repository.ErrNotFound) {
			// The signature verified but the account is gone. 401 rather than 404:
			// the missing thing is the caller's own session, and the client should
			// discard the token and sign in again.
			response.Fail(c, http.StatusUnauthorized, response.CodeUnauthorized,
				"this session no longer refers to an account")
			return
		}
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal,
			"could not load the current user")
		return
	}

	c.JSON(http.StatusOK, user)
}
