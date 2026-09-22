package middleware

import (
	"log/slog"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/logging"
	"mihomo-studio-server/internal/response"
)

// tokenPathPrefixes are the routes whose path is itself a credential: the
// subscription URL a Mihomo client polls, and the share URL a visitor opens.
var tokenPathPrefixes = []string{"/sub/", "/share/"}

// Logger writes one structured record per request, and hands the rest of the
// request a logger already carrying its ID.
//
// gin.Logger() would do most of this, but it logs the raw path — and the raw
// path of /sub/{token} contains the only credential a Mihomo client has. See
// redactPath.
func Logger(base *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// Captured before c.Next: a handler is free to rewrite the request URL,
		// and the record should describe what was asked for, not what it became.
		path := redactPath(c.Request.URL.Path)

		// Every line a handler writes for this request carries the same ID as the
		// access record and as the error body the caller was handed, so one string
		// from a bug report finds all of them.
		requestLogger := base.With(slog.String("request_id", response.RequestID(c)))
		logging.Attach(c, requestLogger)

		c.Next()

		status := c.Writer.Status()

		attrs := []slog.Attr{
			slog.String("method", c.Request.Method),
			slog.String("path", path),
			slog.Int("status", status),
			logging.Millis("duration_ms", time.Since(start)),
			slog.Int("bytes", c.Writer.Size()),
			slog.String("ip", c.ClientIP()),
		}

		// Errors gin collected during the request (c.Error) carry the detail that
		// the status code alone loses — which repository call failed, and why.
		if len(c.Errors) > 0 {
			attrs = append(attrs, slog.String("errors",
				c.Errors.ByType(gin.ErrorTypePrivate).String()))
		}

		// The level is the status, so that "show me the failures" is a filter
		// rather than a search. A 4xx is the caller's problem and a 5xx is ours,
		// and only the second should ever page anyone.
		requestLogger.LogAttrs(c.Request.Context(), levelFor(status), "request", attrs...)
	}
}

func levelFor(status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

// redactPath removes share and subscription tokens from anything written to
// the logs.
//
// A token on either public route is a bearer credential in URL form: anyone
// who reads it can fetch that user's config, proxy passwords included. Access
// logs get shipped to aggregators, tailed in shared terminals, and kept far
// longer than the token is rotated, so the token must not enter them in the
// first place. The path is kept — knowing that /sub or /share was hit, and how
// often, is the point of the record — but the secret segment is replaced.
func redactPath(path string) string {
	for _, prefix := range tokenPathPrefixes {
		if strings.HasPrefix(path, prefix) {
			return prefix + "<token>"
		}
	}
	return path
}
