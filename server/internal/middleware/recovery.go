package middleware

import (
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"runtime/debug"
	"strings"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/logging"
	"mihomo-studio-server/internal/response"
)

// Recovery turns a panic into a 500 instead of a dropped connection.
//
// A panic in one handler must not take the process down: the other users mid-
// request would lose their work for a nil map in code none of them touched.
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}

			logger := logging.From(c)

			// A client that hung up mid-write makes every subsequent write panic.
			// There is no error to report — nobody is listening — and logging a
			// stack trace for it turns a routine disconnect into noise that looks
			// like a bug.
			if isBrokenPipe(rec) {
				logger.Info("client disconnected",
					slog.String("method", c.Request.Method),
					slog.String("path", redactPath(c.Request.URL.Path)))
				c.Abort()
				return
			}

			// The stack goes to the log, never to the client: it names internal
			// paths and packages, and hands an attacker a map of the binary.
			logger.Error("panic recovered",
				slog.Any("panic", rec),
				slog.String("method", c.Request.Method),
				slog.String("path", redactPath(c.Request.URL.Path)),
				slog.String("stack", string(debug.Stack())))

			// Headers may already be on the wire — a handler can panic halfway
			// through writing a body. Overwriting the status then is impossible,
			// so only the abort is meaningful.
			if c.Writer.Written() {
				c.Abort()
				return
			}
			response.Fail(c, http.StatusInternalServerError, response.CodeInternal,
				"internal server error")
		}()

		c.Next()
	}
}

func isBrokenPipe(rec any) bool {
	err, ok := rec.(error)
	if !ok {
		return false
	}
	var ne *net.OpError
	if !errors.As(err, &ne) {
		return false
	}
	var se *os.SyscallError
	if !errors.As(ne.Err, &se) {
		return false
	}
	msg := strings.ToLower(se.Error())
	return strings.Contains(msg, "broken pipe") || strings.Contains(msg, "connection reset by peer")
}
