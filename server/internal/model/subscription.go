package model

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"time"
)

// SubscriptionTokenBytes is the entropy behind a subscription URL. 32 bytes
// encodes to 43 base64url characters — long enough that enumeration is not a
// threat worth modelling, short enough to paste into a proxy client.
const SubscriptionTokenBytes = 32

// Column widths, mirrored here so callers can clip before PostgreSQL refuses.
const (
	MaxLabelLen     = 100
	MaxUserAgentLen = 255
)

// Subscription is a revocable capability URL pointing at one config.
//
// A Mihomo client cannot perform an OAuth flow or attach a JWT, so the token in
// the URL is the only credential the request carries — anyone holding the URL
// holds the config, and the config holds live proxy credentials. That is why
// the token is high-entropy and independently revocable.
//
// Keeping subscriptions in their own table rather than putting a token column
// on MihomoConfig lets one config carry several tokens — one per device — so a
// lost phone can be cut off without disturbing anything else.
type Subscription struct {
	ID       uint `gorm:"primaryKey"     json:"id"`
	ConfigID uint `gorm:"not null;index" json:"config_id"`

	// Denormalised from the owning config so subscription queries can be scoped
	// by user_id directly, without a join. That keeps the isolation rule
	// identical in every repository, which is the point — a rule with an
	// exception is a rule someone will forget. Always derived from the config's
	// owner, never taken from request input.
	UserID uint `gorm:"not null;index:idx_subs_user" json:"user_id"`

	// Stored in plaintext so the UI can redisplay the URL whenever the user
	// needs to copy it again. The alternative — storing only a hash — buys
	// resistance to a database leak at the cost of showing the URL exactly once,
	// which is the wrong trade for a URL people re-paste across devices.
	// Rotating replaces this value and kills the old URL immediately.
	Token string `gorm:"size:64;uniqueIndex;not null" json:"token"`

	Format string `gorm:"size:20;not null;default:'mihomo'" json:"format"`
	Label  string `gorm:"size:100"                          json:"label,omitempty"`

	RevokedAt *time.Time `json:"revoked_at,omitempty"`

	// Usage telemetry, so a user can tell which subscription a device is
	// actually pulling and spot one that has gone quiet or is being fetched from
	// somewhere unexpected.
	LastAccessAt  *time.Time `                          json:"last_access_at,omitempty"`
	AccessCount   int64      `gorm:"not null;default:0" json:"access_count"`
	LastUserAgent string     `gorm:"size:255"           json:"last_user_agent,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (s *Subscription) Active() bool { return s.RevokedAt == nil }

// NewSubscriptionToken returns a fresh URL-safe token.
//
// crypto/rand, not math/rand: the latter is deterministic from its seed, so one
// leaked token would let an attacker derive every other subscription URL the
// server has ever issued.
func NewSubscriptionToken() (string, error) {
	b := make([]byte, SubscriptionTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate subscription token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// TokenMatches compares in constant time. The database lookup is what actually
// finds the row, so this guards the confirmation step against a timing oracle
// that would otherwise let a token be recovered a character at a time.
func TokenMatches(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// TokenLooksWellFormed reports whether a string could be a token this server
// issued: unpadded base64url, of the length NewSubscriptionToken produces.
//
// It is a cheap filter in front of the database, not a security check — the row
// lookup is what decides. Its job is to keep a flood of junk paths, or a
// megabyte-long URL segment, from becoming a megabyte-long query parameter.
func TokenLooksWellFormed(token string) bool {
	if len(token) != base64.RawURLEncoding.EncodedLen(SubscriptionTokenBytes) {
		return false
	}
	for i := 0; i < len(token); i++ {
		c := token[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '_':
		default:
			return false
		}
	}
	return true
}

// TruncateUserAgent clips a client's User-Agent to the column width. The header
// is attacker-controlled and unbounded; the column is not.
func TruncateUserAgent(ua string) string { return truncate(ua, MaxUserAgentLen) }
