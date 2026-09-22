package model

import (
	"time"
)

// The two things a server-config share can hand a visitor. They are separate
// values rather than one type plus a query parameter so that a token can never
// be talked into serving the other payload: what a link serves is fixed when
// the link is created.
const (
	// The server config's own mihomo document (listeners, outbounds, dns,
	// rules) — the raw server side.
	ShareTypeFullServerYAML = "full_server_yaml"

	// Every convertible listener on the config turned into client `proxies:`
	// entries and aggregated into one fragment.
	ShareTypeServerToClientProxies = "server_to_client_proxies"
)

func ValidShareType(t string) bool {
	return t == ShareTypeFullServerYAML || t == ShareTypeServerToClientProxies
}

// ServerConfigShare is a revocable capability URL pointing at one server
// config, in the shape of one of the two payloads above.
//
// Like Subscription — whose token machinery this reuses outright — the row is
// a reference, not content. Nothing rendered is stored here: every visit
// resolves the token, loads the referenced ServerConfig's current IR, and lets
// the frontend render from it. That is what makes an edit to the config show
// up through links minted before the edit, which is the whole point of sharing
// the resource rather than a snapshot of it.
type ServerConfigShare struct {
	ID             uint `gorm:"primaryKey"                          json:"id"`
	ServerConfigID uint `gorm:"not null;index"                      json:"server_config_id"`

	// Denormalised from the owning config, as on Subscription: owner-scoped
	// queries without a join, always derived from the verified session.
	UserID uint `gorm:"not null;index:idx_server_shares_user" json:"user_id"`

	Token     string `gorm:"size:64;uniqueIndex;not null" json:"token"`
	ShareType string `gorm:"size:40;not null"             json:"share_type"`

	RevokedAt *time.Time `json:"revoked_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (ServerConfigShare) TableName() string { return "server_config_shares" }

func (s *ServerConfigShare) Active() bool { return s.RevokedAt == nil }
