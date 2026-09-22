// Package response is the single place the API's JSON shapes are defined.
//
// It owns the request-ID context key as well, so that both middleware and
// handlers can reach it without importing each other.
package response

import (
	"github.com/gin-gonic/gin"
)

// ContextRequestID is where middleware.RequestID stores the identifier.
const ContextRequestID = "request_id"

// Machine-readable error codes. The frontend switches on these rather than on
// the status code, because one status covers several distinct causes: a 404 on
// a config could mean "no such id" or "not yours", and only one of those is
// worth showing the user as an error.
const (
	CodeBadRequest   = "bad_request"
	CodeUnauthorized = "unauthorized"
	CodeForbidden    = "forbidden"
	CodeNotFound     = "not_found"
	CodeConflict     = "conflict"
	CodeRateLimited  = "rate_limited"
	CodeInternal     = "internal_error"
	CodeUnavailable  = "unavailable"
)

// ErrorBody is the envelope for every non-2xx response.
//
// Errors are wrapped in an object rather than returned as a bare string so that
// fields can be added later — a validation error listing offending fields, say
// — without changing the shape clients already parse.
type ErrorBody struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// Echoed so a user reporting a failure can quote one string that leads
	// straight to the matching log line.
	RequestID string `json:"request_id,omitempty"`
}

// Fail writes the envelope and stops the handler chain.
//
// The message is for humans and must stay free of internal detail: a wrapped
// GORM error can name tables and columns, and a config not found for user A is
// indistinguishable from one that belongs to user B on purpose. Log the cause
// with c.Error; send the caller the summary.
func Fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, ErrorBody{Error: ErrorDetail{
		Code:      code,
		Message:   message,
		RequestID: RequestID(c),
	}})
}

// RequestID reads the identifier assigned by the RequestID middleware, or ""
// when called outside a request that passed through it.
func RequestID(c *gin.Context) string {
	if c == nil {
		return ""
	}
	v, ok := c.Get(ContextRequestID)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
