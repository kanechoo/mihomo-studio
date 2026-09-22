package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"mihomo-studio-server/internal/fetcher"
	"mihomo-studio-server/internal/response"
)

// A URL and nothing else. Anything larger is not one.
const maxImportFetchBodyBytes = 4 << 10

// ImportFetch retrieves a subscription document on the caller's behalf.
//
// The browser does this itself normally, and should: the URL is a credential,
// and the direct request keeps it between the user and their provider. This
// exists for the providers that send no CORS headers, which a page cannot read
// from at all — the browser reports that failure identically to a DNS error, so
// there is nothing the frontend can do about it on its own.
//
// It requires a session for the obvious reason: without one it is a URL fetcher
// anybody can point at anything, which is a service worth abusing quite apart
// from what it can reach.
type ImportFetch struct {
	client *fetcher.Client
}

func NewImportFetch(client *fetcher.Client) *ImportFetch { return &ImportFetch{client: client} }

type importFetchRequest struct {
	URL string `json:"url" binding:"required"`
}

type importFetchResponse struct {
	Content string `json:"content"`
	// Passed through for diagnosis. The frontend classifies by parsing the body,
	// not by trusting this: providers label YAML as text/plain often enough.
	ContentType string `json:"content_type,omitempty"`
}

func (h *ImportFetch) Fetch(c *gin.Context) {
	if _, ok := requireUser(c); !ok {
		return
	}

	var in importFetchRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxImportFetchBodyBytes)
	if err := c.ShouldBindJSON(&in); err != nil {
		_ = c.Error(err)
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"request body must be JSON with a url field")
		return
	}

	doc, err := h.client.Fetch(c.Request.Context(), in.URL)
	if err != nil {
		failImportFetchError(c, err)
		return
	}

	c.JSON(http.StatusOK, importFetchResponse{
		Content:     doc.Content,
		ContentType: doc.ContentType,
	})
}

// failImportFetchError splits "the URL is wrong" from "the other server is".
//
// The first group is quoted back because it is actionable and says nothing the
// caller did not already send. Everything else is logged and answered with a
// fixed sentence: a transport error can name the address that was dialled, and
// on this endpoint that address may be one the caller was probing for.
func failImportFetchError(c *gin.Context, err error) {
	_ = c.Error(err)

	switch {
	case errors.Is(err, fetcher.ErrInvalidURL):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"that is not a valid URL")
	case errors.Is(err, fetcher.ErrScheme):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"only http and https URLs can be fetched")
	case errors.Is(err, fetcher.ErrBlocked):
		response.Fail(c, http.StatusBadRequest, response.CodeBadRequest,
			"that host is not one this server will fetch from")
	case errors.Is(err, fetcher.ErrTooLarge):
		response.Fail(c, http.StatusBadGateway, response.CodeUnavailable,
			"the subscription is larger than this server will fetch")
	case errors.Is(err, fetcher.ErrNotText):
		response.Fail(c, http.StatusBadGateway, response.CodeUnavailable,
			"the subscription server did not return a text document")
	case errors.Is(err, fetcher.ErrUpstreamStatus):
		// The status is the one thing here worth repeating: a 403 means the
		// token in the URL has expired, and that is the user's to fix. The
		// error already reads "…refused the request: HTTP 403".
		response.Fail(c, http.StatusBadGateway, response.CodeUnavailable, err.Error())
	default:
		response.Fail(c, http.StatusBadGateway, response.CodeUnavailable,
			"could not fetch that subscription")
	}
}
