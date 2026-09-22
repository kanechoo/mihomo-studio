package model

import (
	"time"

	"gorm.io/gorm"
)

// Export formats a stored config can be served as. These mirror the frontend's
// uiStore exportFormat values, so a subscription's format round-trips through
// the API unchanged.
const (
	FormatMihomo  = "mihomo"
	FormatSingbox = "singbox"
)

func ValidFormat(f string) bool {
	return f == FormatMihomo || f == FormatSingbox
}

// MihomoConfig is one saved configuration belonging to one user.
//
// Two representations are stored side by side, written in the same request:
//
//   - IR is the source of truth. It is what the editor loads back, and what a
//     future server-side renderer would read.
//   - RenderedMihomo / RenderedSingbox are the artifacts the browser produced
//     from that IR, and are what GET /sub/{token} returns verbatim.
//
// The rendering stays in TypeScript (src/core/exporters/) rather than being
// reimplemented here. Those exporters carry details that are easy to get subtly
// wrong — MATCH takes no payload field, empty values are dropped, rule-provider
// keys depend on the provider's type — and a second implementation in Go would
// drift the first time either side changed. Serving the stored artifact means a
// Mihomo client fetches byte-for-byte what the user previewed in the editor.
type MihomoConfig struct {
	ID     uint `gorm:"primaryKey"                     json:"id"`
	UserID uint `gorm:"not null;index:idx_configs_user" json:"user_id"`

	Name        string `gorm:"size:100;not null" json:"name"`
	Description string `gorm:"size:500"          json:"description,omitempty"`

	// The MihomoIR document, as jsonb rather than a normalised set of tables.
	// ProxyNode.config is an open Record<string, any> by design (see
	// src/core/ir/types.ts) so that new protocols need only a schema, not a
	// migration; normalising it here would give that flexibility back.
	IR JSONB `gorm:"type:jsonb;not null" json:"ir"`

	// Mirrors MihomoIR.version. Kept as its own column so a future IR migration
	// can find stale rows with a plain WHERE instead of scanning every document.
	IRVersion string `gorm:"size:20;not null;default:'1.0.0'" json:"ir_version"`

	// Not serialised: these are large, and the only consumer that wants them is
	// the public /sub endpoint, which writes them straight to the response body.
	RenderedMihomo  string     `gorm:"type:text" json:"-"`
	RenderedSingbox string     `gorm:"type:text" json:"-"`
	RenderedAt      *time.Time `                 json:"rendered_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Soft delete. A config store whose delete button is irreversible is a bad
	// config store. Two consequences worth knowing about:
	//   - the (user_id, name) uniqueness must be a partial index, or a deleted
	//     config reserves its name forever (see database.Migrate)
	//   - /sub must not serve a soft-deleted config; GORM's default scope
	//     handles this as long as the query goes through this model
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// foreignKey is explicit because GORM's convention for a has-many is the
	// owner's type name plus its primary key — MihomoConfigID — and the column is
	// ConfigID. Without this, GORM cannot resolve the association and rejects the
	// whole model at AutoMigrate rather than at first use.
	Subscriptions []Subscription `gorm:"foreignKey:ConfigID;constraint:OnDelete:CASCADE" json:"subscriptions,omitempty"`
}

func (MihomoConfig) TableName() string { return "mihomo_configs" }

// ConfigSummary is what the list endpoint returns: everything except the two
// large fields.
//
// A config with several hundred proxies is a substantial document, and the IR
// plus both rendered artifacts can run to megabytes. The list view shows a name
// and a timestamp, so sending all of that for every config would make opening
// the app the most expensive request in the service — and it would grow with
// how much the user has saved, which is exactly the wrong direction.
type ConfigSummary struct {
	ID          uint       `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	IRVersion   string     `json:"ir_version"`
	RenderedAt  *time.Time `json:"rendered_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// Rendered returns the artifact for the requested format.
func (c *MihomoConfig) Rendered(format string) string {
	if format == FormatSingbox {
		return c.RenderedSingbox
	}
	return c.RenderedMihomo
}

// ContentType is what /sub/{token} should advertise. Mihomo accepts YAML for
// its own format; a sing-box config is JSON and mislabelling it as YAML would
// confuse clients that dispatch on the header.
func ContentType(format string) string {
	if format == FormatSingbox {
		return "application/json; charset=utf-8"
	}
	return "text/yaml; charset=utf-8"
}
