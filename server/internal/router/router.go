// Package router builds the route table.
//
// One file lists every path the service answers, so "what does this server
// expose, and what is protected" is a question answered by reading, not by
// grepping for route registrations across handlers.
package router

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/fetcher"
	"mihomo-studio-server/internal/handler"
	"mihomo-studio-server/internal/logging"
	"mihomo-studio-server/internal/middleware"
	"mihomo-studio-server/internal/mihomo"
	"mihomo-studio-server/internal/ratelimit"
	"mihomo-studio-server/internal/repository"
	"mihomo-studio-server/internal/service"
)

// Rate limits, per minute. The two unauthenticated routes are the ones that
// need them: everything else costs a valid JWT to reach, which is its own
// limit, and a signed-in user hammering their own config list is a support
// conversation rather than an attack.
const (
	// Per subscription token. A Mihomo client polls on an interval measured in
	// minutes or hours, so this is two orders of magnitude above normal use and
	// only catches a client stuck in a retry loop — which is common, costs the
	// database an indexed read and a write every time, and inflates the fetch
	// count the owner is meant to be able to read something into.
	subFetchesPerToken = 20

	// Per client address, covering every subscription it asks for. Deliberately
	// generous: a household or office behind one NAT address can legitimately
	// have many devices each polling their own URL, and refusing those is a
	// worse failure than the flood this bounds.
	subFetchesPerIP = 120

	// Per client address. Signing in is a handful of requests in a lifetime, and
	// each one spends an outbound call to GitHub — so this endpoint is a way to
	// make someone else's server generate traffic against a third party, quite
	// apart from what it costs here.
	loginsPerIP = 10

	// Per signed-in user. Importing a subscription is a deliberate act — open
	// the dialog, paste a URL, press a button — so this is far above anything a
	// person does by hand, and exists because the endpoint spends an outbound
	// request against a third party on every call. Keyed by user rather than by
	// address: this route already requires a token, and an address is both too
	// coarse (an office shares one) and too fine (a phone changes networks).
	importFetchesPerUser = 30

	// Per signed-in user. Each validation spawns a real `mihomo -t` process —
	// CPU and a slice of disk for its temp file — which makes this the most
	// expensive endpoint per call by far. Ten per minute covers a person
	// iterating on one config with generous headroom.
	validationsPerUser = 10

	// Per client address. The geosite catalogue is the one other unauthenticated
	// read, and the browser fetches it about once a day per user — but it is
	// public, which makes it the one place a stranger can spend database reads,
	// so it keeps its own bucket rather than relying on being cheap.
	geositePerIP = 60

	// Share fetches, mirroring the subscription limits: per token, because a
	// visitor refreshing in a loop should spend their own bucket; and a
	// generous per-address allowance, because one link is often opened across a
	// household or office behind a single NAT address.
	shareFetchesPerToken = 20
	shareFetchesPerIP    = 120
)

// New wires middleware and routes onto a fresh engine.
func New(cfg *config.Config, db *gorm.DB, logger *slog.Logger) *gin.Engine {
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	// gin.New, not gin.Default: Default installs its own logger and recovery,
	// and this service replaces both — one to keep subscription tokens out of
	// the logs, the other to return the API's JSON error shape.
	r := gin.New()

	// Gin trusts every proxy by default, which makes ClientIP() read whatever
	// X-Forwarded-For the caller sent. That is fine until something depends on
	// it — the rate limiters below — at which point a spoofable client IP means
	// a per-IP limit anyone can step around by varying a header. The default
	// here is to trust nothing, which yields the real socket address; a
	// deployment behind a reverse proxy sets TRUSTED_PROXIES to that proxy,
	// because otherwise every request appears to come from it and the whole
	// internet shares one bucket.
	//
	// The error is deliberately not fatal: a malformed entry costs a per-IP
	// limit, and refusing to boot over it would cost the whole service.
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		logger.Warn("TRUSTED_PROXIES was not accepted; falling back to trusting none",
			logging.Err(err))
		_ = r.SetTrustedProxies(nil)
	}

	// Order matters. RequestID is first so every later record and error body can
	// quote it; Logger is next so it can attach the request-scoped logger the
	// others use; Recovery precedes the handlers it guards; CORS runs before
	// them so a rejected preflight never reaches application code.
	r.Use(middleware.RequestID())
	r.Use(middleware.Logger(logger))
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS(cfg.CORSOrigins))

	r.NoRoute(handler.NotFound)
	r.HandleMethodNotAllowed = true
	r.NoMethod(handler.MethodNotAllowed)

	health := handler.NewHealth(db)
	r.GET("/healthz", health.Check)

	// Built once and shared: the issuer holds the parsed signing key, and the
	// GitHub client holds a pooled http.Client. Rebuilding either per request
	// would mean a fresh connection to GitHub on every login.
	issuer := auth.NewIssuer(cfg.JWTSecret, cfg.JWTTTL)
	authHandler := handler.NewAuth(service.NewAuth(
		auth.NewGithubClient(cfg.GithubClientID, cfg.GithubClientSecret),
		issuer,
		repository.NewUserRepository(db),
	))
	// One config repository, shared: the subscription service reads configs
	// through the same user-scoped methods the config endpoints use, which is
	// what keeps the public /sub path from needing a query of its own.
	configRepo := repository.NewConfigRepository(db)
	configHandler := handler.NewConfig(service.NewConfig(configRepo))
	serverConfigHandler := handler.NewServerConfig(service.NewServerConfig(
		repository.NewServerConfigRepository(db),
	))
	subscriptionHandler := handler.NewSubscription(service.NewSubscription(
		repository.NewSubscriptionRepository(db),
		configRepo,
		cfg,
	))
	serverShareHandler := handler.NewServerConfigShare(service.NewServerConfigShare(
		repository.NewServerConfigShareRepository(db),
		repository.NewServerConfigRepository(db),
		cfg,
	))
	// Holds a pooled http.Client with an address filter on its dialer, so it is
	// built once here rather than per request.
	// The real-binary validator is optional: when MIHOMO_BINARY_PATH does not
	// resolve, the endpoints answer 503 and the frontend degrades to local
	// validation only. Boot must not depend on it.
	validateRunner := mihomo.NewExecRunner(cfg.MihomoBinaryPath, cfg.MihomoTimeout)
	mihomoHandler := handler.NewMihomo(validateRunner)

	importFetchHandler := handler.NewImportFetch(fetcher.New(fetcher.Options{
		Timeout:   cfg.ImportFetchTimeout,
		MaxBytes:  cfg.ImportFetchMaxBytes,
		UserAgent: cfg.ImportFetchUserAgent,
	}))
	geositeHandler := handler.NewGeosite(service.NewGeosite(
		repository.NewGeositeRepository(db),
	))

	// One limiter per bucket space, built here and captured by the middleware,
	// so the counters live as long as the process rather than as long as a
	// request.
	loginLimiter := ratelimit.New(loginsPerIP, time.Minute)
	subIPLimiter := ratelimit.New(subFetchesPerIP, time.Minute)
	subTokenLimiter := ratelimit.New(subFetchesPerToken, time.Minute)
	importFetchLimiter := ratelimit.New(importFetchesPerUser, time.Minute)
	validateLimiter := ratelimit.New(validationsPerUser, time.Minute)
	geositeLimiter := ratelimit.New(geositePerIP, time.Minute)

	v1 := r.Group("/api/v1")

	// Public. This is how a caller stops being anonymous, so it cannot itself
	// require a token — which leaves the rate limit as the only thing standing
	// between an anonymous caller and the work behind it.
	v1.POST("/auth/github",
		middleware.RateLimit(loginLimiter, middleware.ClientIPKey),
		authHandler.GithubLogin)

	// Also public, deliberately: the geosite catalogue is shared reference data,
	// not tenant data — there is no owner to scope it by, and gating it would
	// only move the sign-in wall in front of a list of tag names. The editor
	// needs the list the moment it opens, which is not always after sign-in has
	// settled. The rate limit is what bounds an anonymous caller instead.
	v1.GET("/geosite",
		middleware.RateLimit(geositeLimiter, middleware.ClientIPKey),
		geositeHandler.List)

	// Everything else lives behind the token. The group exists so that adding a
	// route is a decision about which group to put it in — a new route cannot
	// end up unprotected by forgetting to attach middleware to it.
	protected := v1.Group("")
	protected.Use(middleware.RequireAuth(issuer))
	{
		protected.GET("/me", authHandler.Me)

		// Every handler below reads its user ID from the token the middleware
		// verified. Nothing here takes an owner from the path or the body.
		protected.GET("/configs", configHandler.List)
		protected.POST("/configs", configHandler.Create)
		protected.GET("/configs/:id", configHandler.Get)
		protected.PUT("/configs/:id", configHandler.Update)
		protected.DELETE("/configs/:id", configHandler.Delete)

		// The server editor's documents. A separate resource from /configs —
		// different IR, no rendered artifacts, no subscriptions — with the same
		// ownership rules: every handler reads the user from the token.
		protected.GET("/server-configs", serverConfigHandler.List)
		protected.POST("/server-configs", serverConfigHandler.Create)
		protected.GET("/server-configs/:id", serverConfigHandler.Get)
		protected.PUT("/server-configs/:id", serverConfigHandler.Update)
		protected.DELETE("/server-configs/:id", serverConfigHandler.Delete)

		// Subscriptions hang off the config they serve, because a subscription
		// without one is meaningless. Rotate and revoke address the subscription
		// directly — by then the client holds its id, and repeating the config in
		// the path would only add something to get wrong.
		protected.GET("/configs/:id/subscriptions", subscriptionHandler.List)
		protected.POST("/configs/:id/subscriptions", subscriptionHandler.Bind)
		protected.POST("/subscriptions/:id/rotate", subscriptionHandler.Rotate)
		protected.DELETE("/subscriptions/:id", subscriptionHandler.Revoke)

		// Server-config shares follow the subscriptions precedent: create and
		// list hang off the config they serve; revoke addresses the share
		// directly, by then the client holds its id.
		protected.GET("/server-configs/:id/shares", serverShareHandler.List)
		protected.POST("/server-configs/:id/shares", serverShareHandler.Create)
		protected.DELETE("/server-config-shares/:id", serverShareHandler.Revoke)

		// Fetches a *third-party* subscription for the editor's import dialog,
		// for providers that send no CORS headers and so cannot be read from a
		// page. Deliberately not under /subscriptions, which throughout this API
		// means the links this service issues — the two have nothing to do with
		// each other beyond the word.
		protected.POST("/import/fetch",
			middleware.RateLimit(importFetchLimiter, middleware.UserIDKey),
			importFetchHandler.Fetch)
		protected.POST("/mihomo/validate",
			middleware.RateLimit(validateLimiter, middleware.UserIDKey),
			mihomoHandler.Validate)
		protected.GET("/mihomo/version",
			middleware.RateLimit(validateLimiter, middleware.UserIDKey),
			mihomoHandler.Version)
	}

	// The public endpoint, deliberately outside /api/v1 — it is a URL people
	// paste into a proxy client, so it stays short and survives API versioning.
	//
	// It carries no session because the caller cannot have one: a Mihomo client
	// does not complete an OAuth flow. The token in the path is the credential,
	// and it is the reason middleware.Logger redacts this path.
	//
	// Two limiters, in this order. By address first, because it is the cheaper
	// key and the one that bounds a caller working through tokens from a script.
	// By token second, so that one device retrying in a loop is refused on its
	// own account rather than out of the allowance shared with every other
	// device behind the same address.
	r.GET("/sub/:token",
		middleware.RateLimit(subIPLimiter, middleware.ClientIPKey),
		middleware.RateLimit(subTokenLimiter, middleware.SubscriptionTokenKey),
		subscriptionHandler.Serve)

	// The server-share page's data endpoint, public for the same reason /sub
	// is: the visitor of a share link is whoever it was sent to, session or
	// not. The token in the path is the credential. Two limiters, same order as
	// above — by address to bound scripted token-swapping, then by token so one
	// busy link does not exhaust everyone behind the same address.
	shareIPLimiter := ratelimit.New(shareFetchesPerIP, time.Minute)
	shareTokenLimiter := ratelimit.New(shareFetchesPerToken, time.Minute)
	r.GET("/share/:token",
		middleware.RateLimit(shareIPLimiter, middleware.ClientIPKey),
		middleware.RateLimit(shareTokenLimiter, middleware.ShareTokenKey),
		serverShareHandler.Serve)

	return r
}
