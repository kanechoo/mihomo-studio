package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/response"
	"mihomo-studio-server/internal/service"
)

type Geosite struct {
	svc *service.Geosite
}

func NewGeosite(svc *service.Geosite) *Geosite { return &Geosite{svc: svc} }

type geositeListResponse struct {
	Names []string `json:"names"`
	Total int      `json:"total"`
}

// List answers GET /api/v1/geosite with the whole geosite tag catalogue,
// bundles first. It is the endpoint the editor's geosite pickers load their
// options from — previously a separate service on :5001, now this server's own
// seeded table.
func (h *Geosite) List(c *gin.Context) {
	names, err := h.svc.List(c.Request.Context())
	if err != nil {
		_ = c.Error(err)
		response.Fail(c, http.StatusInternalServerError, response.CodeInternal,
			"could not load the geosite list")
		return
	}

	c.JSON(http.StatusOK, geositeListResponse{Names: names, Total: len(names)})
}
