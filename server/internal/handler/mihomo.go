package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/mihomo"
	"mihomo-studio-server/internal/response"
)

// Mihomo serves the real-binary validation endpoints. Like ImportFetch, this
// handler holds a stateless tool rather than a repository — there is nothing
// here to persist and no tenant scoping beyond the JWT that guards the route.
type Mihomo struct {
	runner mihomo.Runner
}

func NewMihomo(runner mihomo.Runner) *Mihomo {
	return &Mihomo{runner: runner}
}

type validateRequest struct {
	// Config is the whole YAML document, exactly as the editor would export
	// it. It is validated as a string before it ever reaches the subprocess.
	Config *string `json:"config" binding:"required"`
}

// Validate runs `mihomo -t` over a submitted document. The subprocess is
// bounded three ways — argument array (no shell), its own temporary file at
// 0600 inside a fresh directory, and a context timeout — so the worst case is
// one wasted CPU slice, not an incident.
func (h *Mihomo) Validate(c *gin.Context) {
	var req validateRequest
	// Bounded like every other body read; the largest legitimate configs are
	// well under this.
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, "bad_request",
			"invalid JSON body or config too large")
		return
	}
	if strings.TrimSpace(pointerOrEmpty(req.Config)) == "" {
		response.Fail(c, http.StatusBadRequest, "bad_request", "config must not be empty")
		return
	}

	result, err := h.runner.Validate(c.Request.Context(), []byte(*req.Config))
	if err != nil {
		if errors.Is(err, mihomo.ErrBinaryMissing) {
			response.Fail(c, http.StatusServiceUnavailable, "unavailable",
				"mihomo binary is not available on this deployment")
			return
		}
		// Timeouts land here too. That is still a usable answer for the client:
		// the run happened, it just did not finish. Report it as unavailable so
		// the frontend retries-or-gives-up logic stays simple.
		//
		// The error text stays server-side: it names paths and exit states, and
		// err.Error() in the body would hand internals to whoever asked. The
		// access log gets it through c.Error; the client gets a fixed sentence.
		_ = c.Error(err)
		response.Fail(c, http.StatusServiceUnavailable, "unavailable",
			"could not run mihomo -t on this deployment")
		return
	}

	c.JSON(http.StatusOK, result)
}

// Version reports what binary backs the validator, so the UI can show which
// mihomo generation a verdict belongs to.
func (h *Mihomo) Version(c *gin.Context) {
	version, err := h.runner.Version(c.Request.Context())
	if err != nil {
		if errors.Is(err, mihomo.ErrBinaryMissing) {
			response.Fail(c, http.StatusServiceUnavailable, "unavailable",
				"mihomo binary is not available on this deployment")
			return
		}
		response.Fail(c, http.StatusInternalServerError, "internal_error", "failed to run mihomo -v")
		return
	}
	c.JSON(http.StatusOK, gin.H{"version": version, "checkedAt": time.Now().UTC().Format(time.RFC3339)})
}

func pointerOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
