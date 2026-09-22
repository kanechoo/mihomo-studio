package handler

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/logging"
	"mihomo-studio-server/internal/repository"
	"mihomo-studio-server/internal/response"
	"mihomo-studio-server/internal/service"
)

// A bind body is a format and a label. Anything larger is not one.
const maxSubscriptionBodyBytes = 4 << 10

type Subscription struct {
	svc *service.Subscription
}

func NewSubscription(svc *service.Subscription) *Subscription { return &Subscription{svc: svc} }

// List returns the subscriptions bound to one config.
func (h *Subscription) List(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	configID, ok := pathID(c, "config")
	if !ok {
		return
	}

	subs, err := h.svc.List(c.Request.Context(), userID, configID)
	if err != nil {
		failSubscriptionError(c, err, "could not list subscriptions")
		return
	}
	c.JSON(http.StatusOK, gin.H{"subscriptions": subs})
}

// Bind mints a subscription URL for a config.
func (h *Subscription) Bind(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	configID, ok := pathID(c, "config")
	if !ok {
		return
	}

	// An absent body is the common case — bind with no options — so a decode
	// failure on an empty request must not be an error.
	var in service.SubscriptionInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSubscriptionBodyBytes)
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&in); err != nil {
			_ = c.Error(err)
			response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
				"request body is not valid JSON, or exceeds the size limit")
			return
		}
	}

	sub, err := h.svc.Bind(c.Request.Context(), userID, configID, in)
	if err != nil {
		failSubscriptionError(c, err, "could not create the subscription")
		return
	}
	c.JSON(http.StatusCreated, sub)
}

// Rotate replaces a subscription's token.
//
// POST rather than PUT: this is not idempotent. Two rotations produce two
// different tokens, and a client that retries a request whose response it never
// saw has just invalidated the URL the first attempt handed back.
func (h *Subscription) Rotate(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "subscription")
	if !ok {
		return
	}

	sub, err := h.svc.Rotate(c.Request.Context(), userID, id)
	if err != nil {
		failSubscriptionError(c, err, "could not rotate the subscription")
		return
	}
	c.JSON(http.StatusOK, sub)
}

// Revoke switches a subscription off for good.
func (h *Subscription) Revoke(c *gin.Context) {
	userID, ok := requireUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c, "subscription")
	if !ok {
		return
	}

	if err := h.svc.Revoke(c.Request.Context(), userID, id); err != nil {
		failSubscriptionError(c, err, "could not revoke the subscription")
		return
	}
	c.Status(http.StatusNoContent)
}

// Serve is the public endpoint: GET /sub/:token.
//
// The only route in the service with no session. Everything it is allowed to
// return is decided by the token, which the service resolves to exactly one
// subscription and, through that subscription's owner, exactly one config.
func (h *Subscription) Serve(c *gin.Context) {
	served, err := h.svc.Resolve(c.Request.Context(), c.Param("token"))
	if err != nil {
		failServe(c, err)
		return
	}

	// The URL is a bearer credential and the body contains proxy passwords, so
	// no shared cache may keep a copy. A client that wants conditional fetches
	// can have them later via ETag; storing this in a CDN is never right.
	c.Header("Cache-Control", "no-store")
	c.Header("Content-Disposition", contentDisposition(served.Filename))
	c.Data(http.StatusOK, served.ContentType, []byte(served.Body))

	// After the body, so the client waits on the config rather than on a counter.
	//
	// WithoutCancel because the request context is done the moment the client
	// disconnects, and a client that fetched its config and hung up has still
	// fetched its config — that is precisely the event being recorded.
	if err := h.svc.RecordAccess(context.WithoutCancel(c.Request.Context()), served.SubscriptionID, c.Request.UserAgent()); err != nil {
		// Logged directly rather than through c.Error: the response is already on
		// the wire, so the middleware's record for this request has been written.
		logging.From(c).Error("subscription telemetry failed", logging.Err(err))
	}
}

// failServe answers the public endpoint's failures.
//
// A revoked token, a token that never existed, and a token whose config has
// been deleted all produce the same 404 with the same message. The distinctions
// are real, and every one of them would tell an anonymous caller something
// about a stranger's account.
func failServe(c *gin.Context, err error) {
	_ = c.Error(err)

	switch {
	case errors.Is(err, service.ErrNotRendered):
		response.Fail(c, http.StatusConflict, response.CodeConflict,
			"this config has not been exported in the format this subscription serves; open it in the editor and save again")
	case errors.Is(err, repository.ErrNotFound):
		response.Fail(c, http.StatusNotFound, response.CodeNotFound,
			"this subscription link is not valid")
	default:
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal,
			"could not load this subscription")
	}
}

func failSubscriptionError(c *gin.Context, err error, fallback string) {
	_ = c.Error(err)

	var invalid *service.ValidationError
	switch {
	case errors.As(err, &invalid):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest, invalid.Message)
	case errors.Is(err, repository.ErrRevoked):
		response.Fail(c, http.StatusConflict, response.CodeConflict,
			"this subscription has been revoked; create a new one instead")
	case errors.Is(err, repository.ErrNotFound):
		response.Fail(c, http.StatusNotFound, response.CodeNotFound, "no such subscription")
	default:
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal, fallback)
	}
}

// contentDisposition names the downloaded profile after the config.
//
// Two forms, per RFC 6266: a plain `filename` that every client understands but
// which may only carry ASCII, and a `filename*` carrying the real UTF-8 name for
// clients that read it. Without the second, a config named 家里 arrives as a row
// of underscores.
//
// Both are escaped, and that is not cosmetic — the config name is user-supplied,
// and a name containing a newline would otherwise end the header and let the
// user write response headers of their own.
func contentDisposition(filename string) string {
	ascii := asciiFilename(filename)
	return `attachment; filename="` + ascii + `"; filename*=UTF-8''` + rfc5987Escape(filename)
}

// asciiFilename is the fallback form: printable ASCII only, with the characters
// that would terminate the quoted string removed.
//
// The extension is split off first. Sanitising the whole string instead would
// reduce a name like 家里.yaml to ".yaml" — a hidden file with no name at all —
// because every character before the dot is replaced and then trimmed away.
func asciiFilename(filename string) string {
	stem, ext := filename, ""
	if i := strings.LastIndexByte(filename, '.'); i > 0 {
		stem, ext = filename[:i], filename[i:]
	}

	var b strings.Builder
	for _, r := range stem {
		switch {
		case r == '"' || r == '\\' || r < 0x20 || r > 0x7e:
			b.WriteByte('_')
		default:
			b.WriteRune(r)
		}
	}

	stem = strings.Trim(b.String(), "_ .")
	if stem == "" {
		// A name written entirely in a non-Latin script collapses to nothing
		// here. The filename* form still carries it; this is only what clients
		// that ignore that parameter will show.
		stem = "config"
	}
	return stem + ext
}

// rfc5987Escape percent-encodes everything outside the unreserved set. That is
// stricter than the grammar requires and never wrong, which is the right trade
// for a header assembled from user input.
func rfc5987Escape(s string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch {
		case ch >= 'A' && ch <= 'Z', ch >= 'a' && ch <= 'z', ch >= '0' && ch <= '9',
			ch == '-', ch == '.', ch == '_', ch == '~':
			b.WriteByte(ch)
		default:
			b.WriteByte('%')
			b.WriteByte(hex[ch>>4])
			b.WriteByte(hex[ch&0x0f])
		}
	}
	return b.String()
}
