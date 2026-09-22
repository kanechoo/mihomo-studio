package logging

import (
	"log/slog"

	"github.com/gin-gonic/gin"
)

// contextLogger is where the access-log middleware leaves the request's logger.
const contextLogger = "logger"

// Attach stores a logger for the rest of the request to use.
func Attach(c *gin.Context, logger *slog.Logger) {
	c.Set(contextLogger, logger)
}

// From returns the request's logger, which already carries its request ID.
//
// Anything a handler logs directly should go through this rather than through
// slog's default, so that the line can be tied back to the request that
// produced it — the same identifier the caller was handed in the error body and
// the X-Request-ID header. Falls back to the default logger so that code called
// outside a request, or in a test with a bare context, still logs somewhere.
func From(c *gin.Context) *slog.Logger {
	if c == nil {
		return slog.Default()
	}
	v, ok := c.Get(contextLogger)
	if !ok {
		return slog.Default()
	}
	logger, ok := v.(*slog.Logger)
	if !ok {
		return slog.Default()
	}
	return logger
}
