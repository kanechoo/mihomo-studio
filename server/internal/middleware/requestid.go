// Package middleware holds the cross-cutting Gin handlers: request identity,
// CORS, access logging, and panic recovery.
package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/response"
)

const (
	// RequestIDHeader is both read and written, so a proxy or frontend that
	// already stamped an ID keeps it across the hop.
	RequestIDHeader = "X-Request-ID"

	requestIDBytes = 8

	// Inbound IDs longer than this are replaced rather than truncated. The value
	// ends up in every log line for the request; an unbounded one lets a caller
	// pad the log with as much text as they like.
	maxInboundRequestIDLen = 64
)

// RequestID assigns every request an identifier and echoes it back.
//
// It exists so a user reporting "saving my config failed" can quote the ID from
// the error response and have it match exactly one request in the logs. Without
// it, the only way to find that request is by timestamp and path, which stops
// working the moment two people hit the same endpoint in the same second.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := sanitiseInbound(c.GetHeader(RequestIDHeader))
		if id == "" {
			id = generate()
		}

		c.Set(response.ContextRequestID, id)
		// Set on the response before the handler runs, so it is present even on
		// responses written by a later panic.
		c.Header(RequestIDHeader, id)

		c.Next()
	}
}

// sanitiseInbound accepts a caller-supplied ID only when it is plainly safe.
//
// The value is written into log lines, so anything outside this set is dropped
// in favour of a generated one: a newline in a request header would otherwise
// let a caller forge whole log entries, and control characters can corrupt the
// terminal of whoever is reading them.
func sanitiseInbound(s string) string {
	if s == "" || len(s) > maxInboundRequestIDLen {
		return ""
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '_':
		default:
			return ""
		}
	}
	return s
}

func generate() string {
	b := make([]byte, requestIDBytes)
	if _, err := rand.Read(b); err != nil {
		// A request ID is a debugging aid, never a security boundary. Failing the
		// request because the OS would not hand over 8 random bytes trades a
		// working response for a slightly harder-to-trace one.
		return "unidentified"
	}
	return hex.EncodeToString(b)
}
