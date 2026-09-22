package model

import "time"

// User is a person who signed in with GitHub.
//
// Identity is GitHub's numeric account ID, never the login name. Logins can be
// changed by their owner, and a released login can then be claimed by someone
// else — keying on it would eventually hand a brand-new account every config,
// and every proxy credential, belonging to the previous holder of that name.
type User struct {
	ID       uint  `gorm:"primaryKey"           json:"id"`
	GithubID int64 `gorm:"uniqueIndex;not null" json:"github_id"`

	// Profile fields are display-only and refreshed from GitHub on every login.
	// None of them is unique: two accounts may share a display name, and Email
	// is frequently empty because the user keeps it private.
	Login     string `gorm:"size:255;not null;index" json:"login"`
	Name      string `gorm:"size:255"                json:"name,omitempty"`
	Email     string `gorm:"size:320"                json:"email,omitempty"`
	AvatarURL string `gorm:"size:512"                json:"avatar_url,omitempty"`

	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	// Not serialised: the user payload is returned on every login, and nobody
	// wants their entire config library attached to it.
	Configs []MihomoConfig `gorm:"constraint:OnDelete:CASCADE" json:"-"`
}

// Column limits, mirroring the size tags above. Kept adjacent so that changing
// one and forgetting the other is visible in a single screen.
const (
	MaxLoginLen     = 255
	MaxNameLen      = 255
	MaxEmailLen     = 320
	MaxAvatarURLLen = 512
)

// TruncateProfile clips the display fields to what the columns hold.
//
// These values come from GitHub, and nothing on this side constrains them. A
// name one character over the limit would otherwise turn a routine login into a
// 500 from PostgreSQL — a failure mode where the user can do nothing but wonder
// why only they cannot sign in.
func (u *User) TruncateProfile() {
	u.Login = truncate(u.Login, MaxLoginLen)
	u.Name = truncate(u.Name, MaxNameLen)
	u.Email = truncate(u.Email, MaxEmailLen)
	u.AvatarURL = truncate(u.AvatarURL, MaxAvatarURLLen)
}

// truncate counts runes, not bytes: PostgreSQL's varchar(n) limit is in
// characters, and cutting a multi-byte name by bytes would also risk splitting
// one in half and storing invalid UTF-8.
func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}
