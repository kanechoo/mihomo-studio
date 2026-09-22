package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// Limits on what a config may contain. The columns enforce the first two; these
// exist so an over-long name is a 400 naming the field rather than a 500 from
// PostgreSQL that tells the user nothing.
const (
	maxConfigNameLen = 100
	maxConfigDescLen = 500
	maxIRVersionLen  = 20

	// The IR for a config with several hundred proxies is large but nowhere near
	// this. The cap is a backstop against a client storing arbitrary data in a
	// jsonb column, which would make every read of that row expensive forever.
	maxIRBytes = 2 << 20

	// Each rendered artifact is roughly the size of the IR it came from.
	maxRenderedBytes = 2 << 20

	defaultIRVersion = "1.0.0"
)

// ValidationError is a rejection whose message is safe to show the user,
// because this package wrote it. Errors from the database are never in this
// category — they name tables and columns.
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

func invalid(format string, args ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}

// ConfigInput is one saved config as the editor sends it.
type ConfigInput struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	IR          model.JSONB `json:"ir"`
	IRVersion   string      `json:"ir_version"`

	// Produced by the TypeScript exporters in the browser and stored verbatim,
	// because /sub/{token} serves them byte for byte. See the note on
	// model.MihomoConfig for why the rendering does not happen here.
	RenderedMihomo  string `json:"rendered_mihomo"`
	RenderedSingbox string `json:"rendered_singbox"`
}

type Config struct {
	configs *repository.ConfigRepository
}

func NewConfig(configs *repository.ConfigRepository) *Config {
	return &Config{configs: configs}
}

func (s *Config) List(ctx context.Context, userID uint) ([]model.ConfigSummary, error) {
	return s.configs.ListByUser(ctx, userID)
}

func (s *Config) Get(ctx context.Context, userID, id uint) (*model.MihomoConfig, error) {
	return s.configs.FindByID(ctx, userID, id)
}

func (s *Config) Create(ctx context.Context, userID uint, in ConfigInput) (*model.MihomoConfig, error) {
	if err := in.normaliseAndValidate(); err != nil {
		return nil, err
	}

	c := &model.MihomoConfig{
		// The only place ownership is assigned, and it comes from the argument the
		// handler filled in from the verified token — never from the request body,
		// which is why ConfigInput has no user field to be tempted by.
		UserID:          userID,
		Name:            in.Name,
		Description:     in.Description,
		IR:              in.IR,
		IRVersion:       in.IRVersion,
		RenderedMihomo:  in.RenderedMihomo,
		RenderedSingbox: in.RenderedSingbox,
		RenderedAt:      renderedAt(in),
	}

	if err := s.configs.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

// Update replaces the config's contents.
//
// PUT semantics, not PATCH: the editor holds the whole document and sends all
// of it, so an omitted description means the user cleared it. A merge would
// make clearing a field impossible.
func (s *Config) Update(ctx context.Context, userID, id uint, in ConfigInput) (*model.MihomoConfig, error) {
	if err := in.normaliseAndValidate(); err != nil {
		return nil, err
	}

	// A map rather than a struct: GORM's Updates skips zero-valued struct
	// fields, so an empty description would be silently ignored and the old text
	// would survive a deliberate deletion.
	fields := map[string]any{
		"name":             in.Name,
		"description":      in.Description,
		"ir":               in.IR,
		"ir_version":       in.IRVersion,
		"rendered_mihomo":  in.RenderedMihomo,
		"rendered_singbox": in.RenderedSingbox,
		"rendered_at":      renderedAt(in),
	}
	return s.configs.Update(ctx, userID, id, fields)
}

func (s *Config) Delete(ctx context.Context, userID, id uint) error {
	return s.configs.SoftDelete(ctx, userID, id)
}

// renderedAt timestamps the artifacts, and is nil when there are none — which
// is how a config saved without ever being exported is distinguished from one
// whose export produced an empty document.
func renderedAt(in ConfigInput) *time.Time {
	if in.RenderedMihomo == "" && in.RenderedSingbox == "" {
		return nil
	}
	now := time.Now().UTC()
	return &now
}

func (in *ConfigInput) normaliseAndValidate() error {
	in.Name = strings.TrimSpace(in.Name)
	in.Description = strings.TrimSpace(in.Description)
	in.IRVersion = strings.TrimSpace(in.IRVersion)

	if in.Name == "" {
		return invalid("name is required")
	}
	// Runes, because the columns are varchar(n) and PostgreSQL counts characters
	// — a 60-character Chinese name is well within the limit even though its
	// byte length is not.
	if n := utf8.RuneCountInString(in.Name); n > maxConfigNameLen {
		return invalid("name must be at most %d characters, got %d", maxConfigNameLen, n)
	}
	if n := utf8.RuneCountInString(in.Description); n > maxConfigDescLen {
		return invalid("description must be at most %d characters, got %d", maxConfigDescLen, n)
	}

	if in.IRVersion == "" {
		in.IRVersion = defaultIRVersion
	}
	if n := utf8.RuneCountInString(in.IRVersion); n > maxIRVersionLen {
		return invalid("ir_version must be at most %d characters", maxIRVersionLen)
	}

	if err := validateIR(in.IR); err != nil {
		return err
	}

	if len(in.RenderedMihomo) > maxRenderedBytes || len(in.RenderedSingbox) > maxRenderedBytes {
		return invalid("a rendered config exceeds the %d byte limit", maxRenderedBytes)
	}
	return nil
}

// validateIR checks the document is a JSON object before it reaches a jsonb
// column.
//
// The bytes are stored without being interpreted, so this is the only gate.
// PostgreSQL would happily accept `5` or `"hello"` as valid jsonb, and the
// editor would then load a config it cannot open — a corruption that survives
// every future request because nothing downstream re-checks it.
func validateIR(ir model.JSONB) error {
	trimmed := bytes.TrimSpace(ir)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return invalid("ir is required")
	}
	if len(trimmed) > maxIRBytes {
		return invalid("ir exceeds the %d byte limit", maxIRBytes)
	}
	if trimmed[0] != '{' {
		return invalid("ir must be a JSON object")
	}
	if !json.Valid(trimmed) {
		return invalid("ir is not valid JSON")
	}
	return nil
}
