package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/repository"
	"mihomo-studio-server/internal/response"
	"mihomo-studio-server/internal/service"
)

// A share body is one share_type. Anything larger is not one.
const maxServerShareBodyBytes = 1 << 10

type ServerConfigShare struct {
	svc *service.ServerConfigShare
}

func NewServerConfigShare(svc *service.ServerConfigShare) *ServerConfigShare {
	return &ServerConfigShare{svc: svc}
}

// List returns the shares bound to one server config.
func (h *ServerConfigShare) List(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	configID, ok := pathID(c, "server config")
	if !ok {
		return
	}

	shares, err := h.svc.List(c.Request.Context(), userID, configID)
	if err != nil {
		failServerConfigError(c, err, "could not list server config shares")
		return
	}
	c.JSON(http.StatusOK, gin.H{"shares": shares})
}

// Create mints a share URL for a server config.
func (h *ServerConfigShare) Create(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	configID, ok := pathID(c, "server config")
	if !ok {
		return
	}

	var in service.ServerConfigShareInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxServerShareBodyBytes)
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&in); err != nil {
			_ = c.Error(err)
			response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
				"request body is not valid JSON, or exceeds the size limit")
			return
		}
	}

	share, err := h.svc.Create(c.Request.Context(), userID, configID, in)
	if err != nil {
		failServerShareError(c, err, "could not create the share")
		return
	}
	c.JSON(http.StatusCreated, share)
}

// Revoke switches a share off for good.
func (h *ServerConfigShare) Revoke(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "share")
	if !ok {
		return
	}

	if err := h.svc.Revoke(c.Request.Context(), userID, id); err != nil {
		failServerShareError(c, err, "could not revoke the share")
		return
	}
	c.Status(http.StatusNoContent)
}

// Serve is the public endpoint: GET /share/:token.
//
// The only route in the service besides /sub with no session. Everything it is
// allowed to return is decided by the token, which the service resolves to
// exactly one share and, through that share's owner, exactly one server
// config.
//
// The response body is the config's stored YAML artifact, written through as-is:
// the browser's exporter and listener-to-proxy converters produced it at save
// time (see model.ServerConfig), so a visitor receives byte for byte what the
// owner previewed. Rendering does not happen here — a second YAML pipeline in
// Go would drift from the editor's the first time either side changed. What
// makes a link current is upstream of this function: every editor save rewrites
// the artifacts alongside the IR, so an old link serves the edited document.
func (h *ServerConfigShare) Serve(c *gin.Context) {
	served, err := h.svc.Resolve(c.Request.Context(), c.Param("token"))
	if err != nil {
		failShareServe(c, err)
		return
	}

	// The URL is a bearer credential and the body carries proxy secrets, so no
	// shared cache may keep a copy. A client that wants conditional fetches can
	// have them later via ETag; storing this in a CDN is never right.
	c.Header("Cache-Control", "no-store")
	c.Header("Content-Disposition", contentDisposition(served.Filename))
	c.Data(http.StatusOK, served.ContentType, []byte(served.Body))
}

// failShareServe answers the public endpoint's failures.
//
// A revoked token, a token that never existed, and a token whose config has
// been deleted all produce the same 404 with the same message; the one
// non-404 is ErrNotRendered, whose fix — save once from the editor — is worth
// naming rather than hiding behind a missing link. Same shape as the
// subscription handler's failServe.
func failShareServe(c *gin.Context, err error) {
	_ = c.Error(err)

	switch {
	case errors.Is(err, service.ErrNotRendered):
		response.Fail(c, http.StatusConflict, response.CodeConflict,
			"this server config has not been saved with the artifact this share serves; open it in the editor and save again")
	case errors.Is(err, repository.ErrNotFound):
		response.Fail(c, http.StatusNotFound, response.CodeNotFound,
			"this share link is not valid")
	default:
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal,
			"could not load this share")
	}
}

// failServerShareError maps authenticated share errors onto status codes,
// mirroring failSubscriptionError.
func failServerShareError(c *gin.Context, err error, fallback string) {
	_ = c.Error(err)

	var invalidErr *service.ValidationError
	switch {
	case errors.As(err, &invalidErr):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest, invalidErr.Message)
	case errors.Is(err, repository.ErrRevoked):
		response.Fail(c, http.StatusConflict, response.CodeConflict,
			"this share has been revoked; create a new one instead")
	case errors.Is(err, repository.ErrNotFound):
		response.Fail(c, http.StatusNotFound, response.CodeNotFound, "no such share")
	default:
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal, fallback)
	}
}
