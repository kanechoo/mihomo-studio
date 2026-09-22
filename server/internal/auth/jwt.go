// Package auth owns identity: issuing and verifying the session token, and
// talking to GitHub to find out who is signing in.
//
// It knows nothing about HTTP routing or the database. That keeps the one piece
// of security-critical code in this service small enough to read in full.
package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrInvalidToken covers every reason a token was not accepted — expired,
// tampered with, wrong algorithm, malformed, unparseable subject.
//
// Deliberately one error rather than several: the caller's only sane response
// is 401, and a message distinguishing "expired" from "bad signature" tells an
// attacker which half of a forgery attempt worked.
var ErrInvalidToken = errors.New("invalid or expired token")

const (
	// The only algorithm this service issues or accepts. Pinned in both
	// directions — see Parse.
	signingAlg = "HS256"

	// Recorded as `iss` and required on the way back in. If this secret is ever
	// shared with another service, a token minted there stops being valid here.
	tokenIssuer = "mihomo-studio-server"

	// Tolerance for clock skew between whichever machines sign and verify. Small
	// on purpose: it extends the life of every token by this much.
	clockSkewLeeway = 30 * time.Second
)

// Issuer signs and verifies session tokens with a single HMAC key.
type Issuer struct {
	secret []byte
	ttl    time.Duration
	parser *jwt.Parser
}

// NewIssuer builds an issuer. The secret's minimum length is enforced at config
// load, because a boot with a weak key must fail before anything is signed with
// it rather than at the first login.
func NewIssuer(secret string, ttl time.Duration) *Issuer {
	return &Issuer{
		secret: []byte(secret),
		ttl:    ttl,
		parser: jwt.NewParser(
			// The single most important line in this file. Without it the parser
			// accepts whatever `alg` the token's own header asks for, so a token
			// with `alg: none` and an empty signature verifies, and anyone can mint
			// a session for any user ID. The same option blocks the RS256→HS256
			// confusion attack, where a public key is submitted as an HMAC secret.
			jwt.WithValidMethods([]string{signingAlg}),
			jwt.WithIssuer(tokenIssuer),
			// A token without `exp` would otherwise be treated as valid forever.
			jwt.WithExpirationRequired(),
			jwt.WithLeeway(clockSkewLeeway),
		),
	}
}

// Issue mints a token for a user and reports when it stops working.
//
// The expiry is returned so the frontend can drop the token and show a login
// screen on schedule, instead of discovering the expiry through a failed save.
func (i *Issuer) Issue(userID uint) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(i.ttl)

	// The claims carry the user ID and nothing else. A display name or avatar in
	// here would be a copy of the database that cannot be corrected until the
	// token expires, and the payload is only base64 — not secret.
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatUint(uint64(userID), 10),
		Issuer:    tokenIssuer,
		IssuedAt:  jwt.NewNumericDate(now),
		NotBefore: jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, expiresAt, nil
}

// Parse verifies a token and returns the user ID it was issued for.
//
// Everything that follows in a request — which configs are listed, which rows a
// write may touch — is derived from this number, so a lenient parse here would
// undo the isolation the repository layer is built to guarantee.
func (i *Issuer) Parse(token string) (uint, error) {
	claims := &jwt.RegisteredClaims{}
	parsed, err := i.parser.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) {
		return i.secret, nil
	})
	if err != nil || !parsed.Valid {
		return 0, ErrInvalidToken
	}

	// Subject is a string by specification, so a token could legitimately parse
	// and still carry "alice" or "-1" here.
	id, err := strconv.ParseUint(claims.Subject, 10, 64)
	if err != nil || id == 0 {
		return 0, ErrInvalidToken
	}
	return uint(id), nil
}
