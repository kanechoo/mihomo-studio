// Package handler holds the Gin handlers. They decode requests, call a service,
// and encode the result — no database access and no business rules.
package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mihomo-studio-server/internal/database"
	"mihomo-studio-server/internal/response"
)

// healthPingTimeout bounds the DB check. It is deliberately shorter than any
// sensible load-balancer probe interval: a health check that hangs is worse
// than one that fails, because the prober is left unable to conclude anything
// while the connection pool fills with stuck checks.
const healthPingTimeout = 2 * time.Second

type Health struct {
	db *gorm.DB
}

func NewHealth(db *gorm.DB) *Health { return &Health{db: db} }

type healthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
}

// Check reports whether the service can actually serve traffic.
//
// The database is pinged rather than assumed: this process is useless without
// it — every endpoint but this one reads or writes — so a health check that
// returned 200 while PostgreSQL was unreachable would keep a broken instance in
// the load balancer's rotation.
func (h *Health) Check(c *gin.Context) {
	// Derived from the request context so that a client hanging up cancels the
	// ping instead of leaving it to run against a connection nobody needs.
	ctx, cancel := context.WithTimeout(c.Request.Context(), healthPingTimeout)
	defer cancel()

	if err := database.Ping(ctx, h.db); err != nil {
		// Recorded for the access log, not returned: the driver's message can
		// carry the host and user from the DSN.
		_ = c.Error(err)
		c.JSON(http.StatusServiceUnavailable, healthResponse{
			Status:   "degraded",
			Database: "unreachable",
		})
		return
	}

	c.JSON(http.StatusOK, healthResponse{Status: "ok", Database: "ok"})
}

// NotFound answers unmatched routes in the API's own error shape.
//
// Gin's default is a bare text body, which means a frontend that parses every
// error response as JSON breaks on typos in a URL — and reports a parse failure
// rather than the 404 that actually happened.
func NotFound(c *gin.Context) {
	response.Fail(c, http.StatusNotFound, response.CodeNotFound, "no such endpoint")
}

// MethodNotAllowed does the same for a known path with the wrong verb.
func MethodNotAllowed(c *gin.Context) {
	response.Fail(c, http.StatusMethodNotAllowed, response.CodeBadRequest,
		"method not allowed for this endpoint")
}
