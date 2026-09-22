package model

import (
	"time"

	"gorm.io/gorm"
)

// ServerConfig is one saved server-editor configuration belonging to one user.
//
// Like MihomoConfig, the IR is the source of truth and the rendered artifacts
// are produced in the browser (src/core/server/), stored verbatim, and served
// byte for byte — the share endpoint returns exactly what the editor
// previewed. The two payloads exist for the two share types: the config's own
// server document, and every convertible listener aggregated into a client
// `proxies:` fragment.
type ServerConfig struct {
	ID     uint `gorm:"primaryKey"                             json:"id"`
	UserID uint `gorm:"not null;index:idx_server_configs_user" json:"user_id"`

	Name        string `gorm:"size:100;not null" json:"name"`
	Description string `gorm:"size:500"          json:"description,omitempty"`

	// The ServerConfigIR document (schemaVersion, dns, listeners, outbounds,
	// rules). jsonb rather than normalised tables for the same reason as
	// mihomo_configs.ir — listener protocol records are open maps by design.
	IR JSONB `gorm:"type:jsonb;not null" json:"ir"`

	// Mirrors ServerConfigIR's exporter version. A column so a future IR
	// migration can find stale rows without opening every document.
	IRVersion string `gorm:"size:20;not null;default:'1.0.0'" json:"ir_version"`

	// Not serialised: these are large, and the only consumer that wants them is
	// the public /share endpoint, which writes them straight to the response
	// body.
	RenderedServerYAML    string     `gorm:"type:text" json:"-"`
	RenderedClientProxies string     `gorm:"type:text" json:"-"`
	RenderedAt            *time.Time `                 json:"rendered_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Soft delete, with the same consequences as on mihomo_configs: name
	// uniqueness must be partial (see 0004_server_configs.sql), and nothing
	// outside this table references it, so there is no /sub analogue to guard.
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

func (ServerConfig) TableName() string { return "server_configs" }

// Rendered returns the artifact for the requested share type.
func (c *ServerConfig) Rendered(shareType string) string {
	if shareType == ShareTypeServerToClientProxies {
		return c.RenderedClientProxies
	}
	return c.RenderedServerYAML
}

// ServerConfigSummary is the list payload: everything except ir and the two
// rendered artifacts, which for a fully-populated server draft are by far the
// largest fields. RenderedAt stays: it is what tells the share panel whether
// this config has anything for its links to serve.
type ServerConfigSummary struct {
	ID          uint       `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	IRVersion   string     `json:"ir_version"`
	RenderedAt  *time.Time `json:"rendered_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
