package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/repository"
	"mihomo-studio-server/internal/response"
	"mihomo-studio-server/internal/service"
)

// Comfortably above the service's per-field limits (2 MB of IR plus two 2 MB
// artifacts) without letting one request decide how much memory this process
// allocates.
const maxConfigBodyBytes = 8 << 20

type Config struct {
	svc *service.Config
}

func NewConfig(svc *service.Config) *Config { return &Config{svc: svc} }

// List returns the caller's configs as summaries.
func (h *Config) List(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}

	configs, err := h.svc.List(c.Request.Context(), userID)
	if err != nil {
		failConfigError(c, err, "could not list configs")
		return
	}

	// Wrapped in an object rather than returned as a bare array, so that
	// pagination or a total can be added later without changing the shape every
	// client already parses.
	c.JSON(http.StatusOK, gin.H{"configs": configs})
}

// Get returns one config with its IR and rendered artifacts.
func (h *Config) Get(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := configID(c)
	if !ok {
		return
	}

	cfg, err := h.svc.Get(c.Request.Context(), userID, id)
	if err != nil {
		failConfigError(c, err, "could not load the config")
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *Config) Create(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	in, ok := bindConfigInput(c)
	if !ok {
		return
	}

	cfg, err := h.svc.Create(c.Request.Context(), userID, in)
	if err != nil {
		failConfigError(c, err, "could not save the config")
		return
	}
	c.JSON(http.StatusCreated, cfg)
}

func (h *Config) Update(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := configID(c)
	if !ok {
		return
	}
	in, ok := bindConfigInput(c)
	if !ok {
		return
	}

	cfg, err := h.svc.Update(c.Request.Context(), userID, id, in)
	if err != nil {
		failConfigError(c, err, "could not save the config")
		return
	}
	c.JSON(http.StatusOK, cfg)
}

func (h *Config) Delete(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := configID(c)
	if !ok {
		return
	}

	if err := h.svc.Delete(c.Request.Context(), userID, id); err != nil {
		failConfigError(c, err, "could not delete the config")
		return
	}
	// No body: the client already knows which config it deleted, and there is
	// nothing left to describe.
	c.Status(http.StatusNoContent)
}

func bindConfigInput(c *gin.Context) (service.ConfigInput, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxConfigBodyBytes)

	var in service.ConfigInput
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(err)
		// The decoder's own message can quote the offending part of the body,
		// which for this endpoint means echoing proxy passwords into a response
		// and, from there, into whatever the client logs.
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"request body is not valid JSON, or exceeds the size limit")
		return in, false
	}
	return in, true
}

// configID reads :id from the path.
//
// A non-numeric segment is a malformed request rather than a missing config, so
// it is a 400. That leaks nothing: the caller already knows what they typed.
func configID(c *gin.Context) (uint, bool) {
	return pathID(c, "config")
}

// pathID reads :id from the path, naming the resource in the failure message so
// that a bad id on a nested route says which of the two ids was wrong.
func pathID(c *gin.Context, resource string) (uint, bool) {
	raw := c.Param("id")
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id == 0 {
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			resource+" id must be a positive integer")
		return 0, false
	}
	return uint(id), true
}

// requireUser reads the caller established by the auth middleware.
//
// Unreachable behind RequireAuth, and present anyway because the alternative to
// this branch is running a query with userID 0 — a filter that matches nothing
// today and is one schema change away from matching something.
func requireUser(c *gin.Context) (uint, bool) {
	userID, ok := auth.UserID(c)
	if !ok {
		response.Fail(c, http.StatusUnauthorized, response.CodeUnauthorized,
			"authentication required")
		return 0, false
	}
	return userID, true
}

// failConfigError maps the service's errors onto status codes.
//
// The ErrNotFound branch is the isolation guarantee as the caller sees it: a
// config that does not exist and a config belonging to someone else produce the
// same 404, so the API never confirms that another user's ID is real.
func failConfigError(c *gin.Context, err error, fallback string) {
	_ = c.Error(err)

	var invalid *service.ValidationError
	switch {
	case errors.As(err, &invalid):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest, invalid.Message)
	case errors.Is(err, repository.ErrNotFound):
		response.Fail(c, http.StatusNotFound, response.CodeNotFound, "no such config")
	case errors.Is(err, repository.ErrDuplicateName):
		response.Fail(c, http.StatusConflict, response.CodeConflict,
			"you already have a config with this name")
	default:
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal, fallback)
	}
}
