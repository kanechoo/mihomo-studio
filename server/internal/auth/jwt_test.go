package auth

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-that-is-long-enough-for-hs256"

func TestIssueAndParseRoundTrip(t *testing.T) {
	issuer := NewIssuer(testSecret, time.Hour)

	token, expiresAt, err := issuer.Issue(42)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if time.Until(expiresAt) <= 0 {
		t.Fatalf("expiry %v is not in the future", expiresAt)
	}

	got, err := issuer.Parse(token)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if got != 42 {
		t.Fatalf("user id = %d, want 42", got)
	}
}

// The attack this whole file exists for: a token that declares it needs no
// signature. A parser that honours the token's own `alg` header accepts it, and
// from there anyone mints a session for any user ID they can type.
func TestParseRejectsAlgNone(t *testing.T) {
	issuer := NewIssuer(testSecret, time.Hour)

	header := encodeSegment(`{"alg":"none","typ":"JWT"}`)
	claims := encodeSegment(`{"sub":"1","iss":"` + tokenIssuer + `","exp":99999999999}`)
	// Third segment empty — that is what alg:none means.
	forged := header + "." + claims + "."

	if _, err := issuer.Parse(forged); err == nil {
		t.Fatal("alg:none token was accepted")
	}
}

func TestParseRejectsTamperedPayload(t *testing.T) {
	issuer := NewIssuer(testSecret, time.Hour)

	token, _, err := issuer.Issue(1)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	// Swap the claims for ones naming a different user, keeping the original
	// signature. This is the everyday version of the attack: edit the number,
	// hope nobody checks.
	parts := strings.Split(token, ".")
	parts[1] = encodeSegment(`{"sub":"2","iss":"` + tokenIssuer + `","exp":99999999999}`)

	if _, err := issuer.Parse(strings.Join(parts, ".")); err == nil {
		t.Fatal("tampered token was accepted")
	}
}

func TestParseRejectsForeignSecret(t *testing.T) {
	minted := NewIssuer("a-completely-different-signing-secret-value", time.Hour)
	verifier := NewIssuer(testSecret, time.Hour)

	token, _, err := minted.Issue(1)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := verifier.Parse(token); err == nil {
		t.Fatal("token signed with another secret was accepted")
	}
}

func TestParseRejectsExpired(t *testing.T) {
	// Well past the 30s skew leeway.
	expired := NewIssuer(testSecret, -time.Hour)
	verifier := NewIssuer(testSecret, time.Hour)

	token, _, err := expired.Issue(1)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := verifier.Parse(token); err == nil {
		t.Fatal("expired token was accepted")
	}
}

// A correctly signed token can still carry a subject that is not a user ID —
// `sub` is a string by specification. Parsing it loosely would hand the
// repository layer a zero value as its tenant filter.
func TestParseRejectsNonNumericSubject(t *testing.T) {
	issuer := NewIssuer(testSecret, time.Hour)

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   "alice",
		Issuer:    tokenIssuer,
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if _, err := issuer.Parse(signed); err == nil {
		t.Fatal("token with a non-numeric subject was accepted")
	}
}

func TestParseRejectsForeignIssuer(t *testing.T) {
	issuer := NewIssuer(testSecret, time.Hour)

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   "1",
		Issuer:    "some-other-service",
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	if _, err := issuer.Parse(signed); err == nil {
		t.Fatal("token from another issuer was accepted")
	}
}

func TestParseRejectsGarbage(t *testing.T) {
	issuer := NewIssuer(testSecret, time.Hour)
	for _, in := range []string{"", "not-a-token", "a.b.c", "....."} {
		if _, err := issuer.Parse(in); err == nil {
			t.Fatalf("garbage token %q was accepted", in)
		}
	}
}

func encodeSegment(s string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(s))
}
