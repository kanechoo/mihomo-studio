package service

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// The same column-backed limits the client config service enforces, for the
// same reason: an over-long name should be a 400 naming the field, not a 500
// quoting a PostgreSQL error.
const (
	maxServerConfigNameLen = 100
	maxServerConfigDescLen = 500
	maxServerIRVersionLen  = 20

	// A server draft with dozens of listeners is far below this; the cap is the
	// backstop against a jsonb column used as arbitrary storage, which would tax
	// every later read of the row.
	maxServerIRBytes = 2 << 20

	// Each rendered artifact is roughly the size of the IR it came from. Same
	// reasoning as maxRenderedBytes on the client-config service.
	maxServerRenderedBytes = 2 << 20

	// Why a quota here and not on mihomo_configs: nothing else about this table
	// is special, but the list endpoint has no pagination, so a per-user ceiling
	// is what keeps GET /server-configs flat no matter how the product grows.
	// Raising it is a one-line change plus pagination, in that order.
	maxServerConfigsPerUser = 50

	defaultServerIRVersion = "1.0.0"
)

// ServerConfigInput is one saved server-editor document.
//
// There is deliberately no user field: ownership comes from the verified token
// via the handler, never from the body (see ConfigInput for the full argument).
type ServerConfigInput struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	IR          model.JSONB `json:"ir"`
	IRVersion   string      `json:"ir_version"`

	// Produced by the TypeScript exporter/converters in the browser and stored
	// verbatim, because /share/{token} serves them byte for byte. The two
	// payloads back the two share types; see model.ServerConfig for why the
	// rendering does not happen here.
	RenderedServerYAML    string `json:"rendered_server_yaml"`
	RenderedClientProxies string `json:"rendered_client_proxies"`
}

type ServerConfig struct {
	repo *repository.ServerConfigRepository
}

func NewServerConfig(repo *repository.ServerConfigRepository) *ServerConfig {
	return &ServerConfig{repo: repo}
}

func (s *ServerConfig) List(ctx context.Context, userID uint) ([]model.ServerConfigSummary, error) {
	return s.repo.ListByUser(ctx, userID)
}

func (s *ServerConfig) Get(ctx context.Context, userID, id uint) (*model.ServerConfig, error) {
	return s.repo.FindByID(ctx, userID, id)
}

func (s *ServerConfig) Create(ctx context.Context, userID uint, in ServerConfigInput) (*model.ServerConfig, error) {
	if err := in.normaliseAndValidate(); err != nil {
		return nil, err
	}

	n, err := s.repo.Count(ctx, userID)
	if err != nil {
		return nil, err
	}
	if n >= maxServerConfigsPerUser {
		return nil, invalid("you have reached the limit of %d server configs", maxServerConfigsPerUser)
	}

	c := &model.ServerConfig{
		UserID:      userID,
		Name:        in.Name,
		Description: in.Description,
		IR:          in.IR,
		IRVersion:   in.IRVersion,

		RenderedServerYAML:    in.RenderedServerYAML,
		RenderedClientProxies: in.RenderedClientProxies,
		RenderedAt:            serverRenderedAt(in),
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// Update replaces the contents — PUT semantics, as on Config.Update: the editor
// sends the whole document it holds, and an omitted description means cleared.
// The artifacts travel in the same statement as the IR on purpose: a share link
// must never serve one document's listeners next to another's YAML.
func (s *ServerConfig) Update(ctx context.Context, userID, id uint, in ServerConfigInput) (*model.ServerConfig, error) {
	if err := in.normaliseAndValidate(); err != nil {
		return nil, err
	}

	fields := map[string]any{
		"name":                    in.Name,
		"description":             in.Description,
		"ir":                      in.IR,
		"ir_version":              in.IRVersion,
		"rendered_server_yaml":    in.RenderedServerYAML,
		"rendered_client_proxies": in.RenderedClientProxies,
		"rendered_at":             serverRenderedAt(in),
	}
	return s.repo.Update(ctx, userID, id, fields)
}

func (s *ServerConfig) Delete(ctx context.Context, userID, id uint) error {
	return s.repo.SoftDelete(ctx, userID, id)
}

// serverRenderedAt timestamps the artifacts, and is nil when there are none —
// which is how a config saved without ever being exported is distinguished
// from one whose export produced an empty document. Same rule as renderedAt on
// the client-config service.
func serverRenderedAt(in ServerConfigInput) *time.Time {
	if in.RenderedServerYAML == "" && in.RenderedClientProxies == "" {
		return nil
	}
	now := time.Now().UTC()
	return &now
}

func (in *ServerConfigInput) normaliseAndValidate() error {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	in.IRVersion = strings.TrimSpace(in.IRVersion)

	if in.Name == "" {
		return invalid("name is required")
	}
	// Runes, because varchar(n) counts characters in PostgreSQL.
	if n := utf8.RuneCountInString(in.Name); n > maxServerConfigNameLen {
		return invalid("name must be at most %d characters, got %d", maxServerConfigNameLen, n)
	}
	if n := utf8.RuneCountInString(in.Description); n > maxServerConfigDescLen {
		return invalid("description must be at most %d characters, got %d", maxServerConfigDescLen, n)
	}

	if in.IRVersion == "" {
		in.IRVersion = defaultServerIRVersion
	}
	if n := utf8.RuneCountInString(in.IRVersion); n > maxServerIRVersionLen {
		return invalid("ir_version must be at most %d characters", maxServerIRVersionLen)
	}

	if err := validateServerIR(in.IR); err != nil {
		return err
	}

	if len(in.RenderedServerYAML) > maxServerRenderedBytes || len(in.RenderedClientProxies) > maxServerRenderedBytes {
		return invalid("a rendered config exceeds the %d byte limit", maxServerRenderedBytes)
	}
	return nil
}

// validateServerIR gates what reaches the jsonb column. PostgreSQL accepts `5`
// or `"hello"` as jsonb; without this check the editor could save a document it
// can never load back.
func validateServerIR(ir model.JSONB) error {
	trimmed := bytes.TrimSpace(ir)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return invalid("ir is required")
	}
	if len(trimmed) > maxServerIRBytes {
		return invalid("ir exceeds the %d byte limit", maxServerIRBytes)
	}
	if trimmed[0] != '{' {
		return invalid("ir must be a JSON object")
	}
	if !json.Valid(trimmed) {
		return invalid("ir is not valid JSON")
	}
	return nil
}
