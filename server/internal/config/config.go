// Package config loads and validates the server's runtime configuration from
// the environment.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// MinJWTSecretLen is the shortest HMAC key the server will accept. HS256 keys
// are brute-forceable offline, and a short one turns "the token is signed" into
// a claim nobody should rely on.
const MinJWTSecretLen = 32

// Log output shapes. JSON is for anything that ships logs somewhere; text is
// for a terminal.
const (
	LogFormatJSON = "json"
	LogFormatText = "text"
)

type Config struct {
	Env           string
	Port          string
	PublicBaseURL string
	CORSOrigins   []string

	// TrustedProxies is the set of proxy addresses, in CIDR or bare-IP form,
	// whose X-Forwarded-For headers may be believed. Empty means trust none.
	//
	// This is not cosmetic since Step 7. The rate limiter buckets by client IP,
	// and Gin reads that from X-Forwarded-For when the peer is trusted — so
	// trusting everyone would let any caller pick their own bucket by varying a
	// header, and the limit would stop existing. Trusting nobody yields the real
	// socket address, which is correct when this is exposed directly and wrong
	// behind a reverse proxy: there, every request appears to come from the proxy
	// and the whole internet shares one bucket. Whichever way this is deployed,
	// one of the two failure modes applies unless this is set to match.
	TrustedProxies []string

	PostgresDSN string

	JWTSecret string
	JWTTTL    time.Duration

	GithubClientID     string
	GithubClientSecret string

	// Bounds on the server-side subscription fetch. That endpoint makes this
	// process issue a request on a user's behalf, so how long it may take and
	// how much it may read are deployment decisions rather than constants.
	ImportFetchTimeout   time.Duration
	ImportFetchMaxBytes  int64
	ImportFetchUserAgent string

	// The mihomo runtime used by POST /api/v1/mihomo/validate. BinaryPath is
	// resolved on PATH when relative; a deployment without a binary simply
	// serves 503 from that endpoint while everything else keeps working.
	MihomoBinaryPath string
	MihomoTimeout    time.Duration

	LogLevel  slog.Level
	LogFormat string
}

func (c *Config) IsProduction() bool { return c.Env == "production" }

// SubscriptionURL builds the URL a Mihomo client fetches for a given token.
// Centralised here so the host is read from one place — a subscription URL that
// points at the wrong origin is silently broken for the client, not for us.
func (c *Config) SubscriptionURL(token string) string {
	return fmt.Sprintf("%s/sub/%s", c.PublicBaseURL, token)
}

// ShareURL builds the URL a visitor opens for a server-config share. Same
// centralisation as SubscriptionURL: the link is minted on the server because
// only it knows the origin that will still be correct months later.
func (c *Config) ShareURL(token string) string {
	return fmt.Sprintf("%s/share/%s", c.PublicBaseURL, token)
}

// Load reads configuration from the environment and validates it up front.
//
// Everything required is checked before the server touches a database or a
// socket: booting with an empty JWT_SECRET and signing every token with "" is
// worse than refusing to boot at all, and the failure would not surface until
// someone's session was already compromised.
func Load() (*Config, error) {
	c := &Config{
		Env:                getEnv("APP_ENV", "development"),
		Port:               getEnv("PORT", "8080"),
		PublicBaseURL:      strings.TrimRight(os.Getenv("PUBLIC_BASE_URL"), "/"),
		CORSOrigins:        splitAndTrim(getEnv("CORS_ORIGINS", "http://localhost:3000")),
		TrustedProxies:     splitAndTrim(os.Getenv("TRUSTED_PROXIES")),
		PostgresDSN:        os.Getenv("POSTGRESQL_DSN"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		GithubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GithubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
	}

	ttl, err := time.ParseDuration(getEnv("JWT_TTL", "168h"))
	if err != nil {
		return nil, fmt.Errorf("JWT_TTL is not a valid duration: %w", err)
	}
	if ttl <= 0 {
		return nil, fmt.Errorf("JWT_TTL must be positive, got %s", ttl)
	}
	c.JWTTTL = ttl

	required := map[string]string{
		"POSTGRESQL_DSN":       c.PostgresDSN,
		"JWT_SECRET":           c.JWTSecret,
		"GITHUB_CLIENT_ID":     c.GithubClientID,
		"GITHUB_CLIENT_SECRET": c.GithubClientSecret,
		"PUBLIC_BASE_URL":      c.PublicBaseURL,
	}
	var missing []string
	for name, value := range required {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		// Map iteration order is randomised, so sort to keep the message stable
		// across runs — otherwise the same misconfiguration reads differently
		// every time and looks like a moving target.
		sort.Strings(missing)
		return nil, fmt.Errorf(
			"missing required environment variables: %s (copy .env.example to .env)",
			strings.Join(missing, ", "),
		)
	}

	if len(c.JWTSecret) < MinJWTSecretLen {
		return nil, fmt.Errorf(
			"JWT_SECRET must be at least %d bytes, got %d (generate one with: openssl rand -base64 48)",
			MinJWTSecretLen, len(c.JWTSecret),
		)
	}

	if c.Env != "development" && c.Env != "production" {
		return nil, fmt.Errorf("APP_ENV must be development or production, got %q", c.Env)
	}

	if err := c.loadImportFetch(); err != nil {
		return nil, err
	}

	if err := c.loadMihomo(); err != nil {
		return nil, err
	}

	if err := c.loadLogging(); err != nil {
		return nil, err
	}

	return c, nil
}

// loadImportFetch resolves the limits on POST /api/v1/import/fetch. All three
// have defaults: this endpoint is a convenience for providers that refuse
// browser requests, and a deployment that never touches these should still get
// sensible bounds rather than none.
func (c *Config) loadImportFetch() error {
	timeout, err := time.ParseDuration(getEnv("IMPORT_FETCH_TIMEOUT", "15s"))
	if err != nil {
		return fmt.Errorf("IMPORT_FETCH_TIMEOUT is not a valid duration: %w", err)
	}
	if timeout <= 0 {
		return fmt.Errorf("IMPORT_FETCH_TIMEOUT must be positive, got %s", timeout)
	}
	c.ImportFetchTimeout = timeout

	raw := getEnv("IMPORT_FETCH_MAX_BYTES", "2097152") // 2 MiB
	maxBytes, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return fmt.Errorf("IMPORT_FETCH_MAX_BYTES is not a number: %w", err)
	}
	if maxBytes <= 0 {
		return fmt.Errorf("IMPORT_FETCH_MAX_BYTES must be positive, got %d", maxBytes)
	}
	c.ImportFetchMaxBytes = maxBytes

	// Subscription services vary their response by User-Agent, so this decides
	// which format the server is offered.
	c.ImportFetchUserAgent = getEnv("IMPORT_FETCH_UA", "clash.meta/1.19.0")

	return nil
}

// loadMihomo resolves the optional real-binary validation service. Both
// settings have defaults, and neither is required: the endpoint degrades to
// 503 when the binary is absent, which is the right answer for development
// environments and slim images alike.
func (c *Config) loadMihomo() error {
	c.MihomoBinaryPath = getEnv("MIHOMO_BINARY_PATH", "mihomo")

	timeout, err := time.ParseDuration(getEnv("MIHOMO_VALIDATE_TIMEOUT", "10s"))
	if err != nil {
		return fmt.Errorf("MIHOMO_VALIDATE_TIMEOUT is not a valid duration: %w", err)
	}
	if timeout <= 0 {
		return fmt.Errorf("MIHOMO_VALIDATE_TIMEOUT must be positive, got %s", timeout)
	}
	// The HTTP server's WriteTimeout bounds every request; a subprocess budget
	// beyond it would be cut off mid-flight anyway. Fail at boot with the
	// arithmetic spelled out rather than time out mysteriously per request.
	const writeTimeout = 60 * time.Second
	if timeout >= writeTimeout {
		return fmt.Errorf("MIHOMO_VALIDATE_TIMEOUT (%s) must stay under the server WriteTimeout (%s)", timeout, writeTimeout)
	}
	c.MihomoTimeout = timeout

	return nil
}

// loadLogging resolves LOG_LEVEL and LOG_FORMAT, both of which default from
// APP_ENV and so must be read after it has been validated.
//
// A development server is read by a person at a terminal and wants everything,
// including the SQL. A production server is read by a log collector and must
// not print statements: they carry config documents, and those contain proxy
// passwords. That is the whole reason the default is per-environment rather
// than a single constant — and the reason LOG_LEVEL=debug in production is a
// decision to make knowingly rather than a convenience.
func (c *Config) loadLogging() error {
	defaultLevel, defaultFormat := "debug", LogFormatText
	if c.IsProduction() {
		defaultLevel, defaultFormat = "info", LogFormatJSON
	}

	level, ok := parseLevel(getEnv("LOG_LEVEL", defaultLevel))
	if !ok {
		return fmt.Errorf("LOG_LEVEL must be debug, info, warn or error, got %q", os.Getenv("LOG_LEVEL"))
	}
	c.LogLevel = level

	format := strings.ToLower(getEnv("LOG_FORMAT", defaultFormat))
	if format != LogFormatJSON && format != LogFormatText {
		return fmt.Errorf("LOG_FORMAT must be %s or %s, got %q", LogFormatJSON, LogFormatText, format)
	}
	c.LogFormat = format

	return nil
}

func parseLevel(name string) (slog.Level, bool) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "debug":
		return slog.LevelDebug, true
	case "info":
		return slog.LevelInfo, true
	case "warn", "warning":
		return slog.LevelWarn, true
	case "error":
		return slog.LevelError, true
	default:
		return slog.LevelInfo, false
	}
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
