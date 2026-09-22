package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/repository"
	"mihomo-studio-server/internal/response"
	"mihomo-studio-server/internal/service"
)

// Same reasoning as maxConfigBodyBytes: far above the service's 2 MB IR cap,
// below what one request could make this process allocate.
const maxServerConfigBodyBytes = 8 << 20

type ServerConfig struct {
	svc *service.ServerConfig
}

func NewServerConfig(svc *service.ServerConfig) *ServerConfig {
	return &ServerConfig{svc: svc}
}

func (h *ServerConfig) List(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	configs, err := h.svc.List(c.Request.Context(), userID)
	if err != nil {
		failServerConfigError(c, err, "could not list server configs")
		return
	}

	c.JSON(http.StatusOK, gin.H{"server_configs": configs})
}

func (h *ServerConfig) Get(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "server config")
	if !ok {
		return
	}

	cfg, err := h.svc.Get(c.Request.Context(), userID, id)
	if err != nil {
		failServerConfigError(c, err, "could not load the server config")
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *ServerConfig) Create(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	in, ok := bindServerConfigInput(c)
	if !ok {
		return
	}

	cfg, err := h.svc.Create(c.Request.Context(), userID, in)
	if err != nil {
		failServerConfigError(c, err, "could not save the server config")
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (h *ServerConfig) Update(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "server config")
	if !ok {
		return
	}
	in, ok := bindServerConfigInput(c)
	if !ok {
		return
	}

	cfg, err := h.svc.Update(c.Request.Context(), userID, id, in)
	if err != nil {
		failServerConfigError(c, err, "could not save the server config")
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *ServerConfig) Delete(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "server config")
	if !ok {
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, id); err != nil {
		failServerConfigError(c, err, "could not delete the server config")
		return
	}
	c.Status(http.StatusNoContent)
}

func bindServerConfigInput(c *gin.Context) (service.ServerConfigInput, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxServerConfigBodyBytes)

	var in service.ServerConfigInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(err)
		// Fixed message, as on bindConfigInput: the decoder's error can quote
		// the body, and a server config carries private keys and PSKs.
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"request body is not valid JSON, or exceeds the size limit")
		return in, false
	}
	return in, true
}

// failServerConfigError maps service errors onto status codes. The 404 branch
// is the isolation guarantee: another user's ID and a missing ID are the same
// answer.
func failServerConfigError(c *gin.Context, err error, fallback string) {
	_ = c.Error(err)

	var invalidErr *service.ValidationError
	switch {
	case errors.As(err, &invalidErr):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest, invalidErr.Message)
	case errors.Is(err, repository.ErrNotFound):
		response.Fail(c, http.StatusNotFound, response.CodeNotFound, "no such server config")
	case errors.Is(err, repository.ErrDuplicateName):
		response.Fail(c, http.StatusConflict, response.CodeConflict,
			"you already have a server config with this name")
	default:
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal, fallback)
	}
}
