package service

import (
	"context"
	"strings"

	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// Why a ceiling here: the same arithmetic as subscriptions — more live URLs
// than this is either a mistake or an attempt to grow the table for free.
const maxSharesPerServerConfig = 20

// ServerConfigShareInput is what the editor sends when creating a share.
type ServerConfigShareInput struct {
	ShareType string `json:"share_type"`
}

// ServerConfigShareView is a share as the API returns it: the row, plus the
// URL built from it. The URL is assembled server-side for the same reason as
// SubscriptionView's — PUBLIC_BASE_URL is deployment knowledge.
type ServerConfigShareView struct {
	model.ServerConfigShare
	URL string `json:"url"`
}

// ServedServerShare is one resolved share visit, ready to be written to the
// wire. The body is the stored artifact: the browser's exporter/converters
// produced it at save time, and it travels to the visitor byte for byte — the
// same arrangement as /sub, and for the same reasons (see model.MihomoConfig).
// Nothing is re-rendered here, so there is no second YAML pipeline to drift.
type ServedServerShare struct {
	ShareType   string
	Name        string
	ContentType string
	// Suggested download filename; the extension is .yaml for both payloads.
	Filename string
	Body     string
}

type ServerConfigShare struct {
	shares  *repository.ServerConfigShareRepository
	configs *repository.ServerConfigRepository
	cfg     *config.Config
}

func NewServerConfigShare(
	shares *repository.ServerConfigShareRepository,
	configs *repository.ServerConfigRepository,
	cfg *config.Config,
) *ServerConfigShare {
	return &ServerConfigShare{shares: shares, configs: configs, cfg: cfg}
}

// List returns the shares on one of the caller's server configs. The ownership
// check comes first, as on subscriptions: without it, naming someone else's
// config would return an empty list — an answer that says the config exists.
func (s *ServerConfigShare) List(ctx context.Context, userID, serverConfigID uint) ([]ServerConfigShareView, error) {
	if err := s.configs.Exists(ctx, userID, serverConfigID); err != nil {
		return nil, err
	}

	rows, err := s.shares.ListByConfig(ctx, userID, serverConfigID)
	if err != nil {
		return nil, err
	}

	views := make([]ServerConfigShareView, 0, len(rows))
	for i := range rows {
		views = append(views, s.view(&rows[i]))
	}
	return views, nil
}

// Create mints a new share URL for a server config.
func (s *ServerConfigShare) Create(ctx context.Context, userID, serverConfigID uint, in ServerConfigShareInput) (*ServerConfigShareView, error) {
	in.ShareType = strings.TrimSpace(strings.ToLower(in.ShareType))
	if !model.ValidShareType(in.ShareType) {
		return nil, invalid("share_type must be %q or %q",
			model.ShareTypeFullServerYAML, model.ShareTypeServerToClientProxies)
	}
	if err := s.configs.Exists(ctx, userID, serverConfigID); err != nil {
		return nil, err
	}

	active, err := s.shares.CountActiveByConfig(ctx, userID, serverConfigID)
	if err != nil {
		return nil, err
	}
	if active >= maxSharesPerServerConfig {
		return nil, invalid("this server config already has %d active shares, which is the limit; revoke one first",
			maxSharesPerServerConfig)
	}

	token, err := model.NewSubscriptionToken()
	if err != nil {
		return nil, err
	}

	share := &model.ServerConfigShare{
		ServerConfigID: serverConfigID,
		UserID:         userID,
		Token:          token,
		ShareType:      in.ShareType,
	}
	if err := s.shares.Create(ctx, share); err != nil {
		return nil, err
	}

	view := s.view(share)
	return &view, nil
}

func (s *ServerConfigShare) Revoke(ctx context.Context, userID, id uint) error {
	return s.shares.Revoke(ctx, userID, id)
}

// Resolve turns a token from the URL into the bytes to serve.
//
// The ordering is the subscription resolver's, restated: the token finds a
// share; the share names its owner; the config is then loaded through the same
// user-scoped method the authenticated endpoints use, with that owner as the
// tenant. No query here can be widened by holding a token — it reaches exactly
// one config, and always its current saved state. The editor rewrites both
// artifacts in the same statement as the IR on every save, so a link minted
// before an edit serves the edited YAML, never a stale copy.
func (s *ServerConfigShare) Resolve(ctx context.Context, rawToken string) (*ServedServerShare, error) {
	token := strings.TrimSpace(rawToken)
	if !model.TokenLooksWellFormed(token) {
		// Shaped wrong, so no row can match it; keep the junk off the database.
		return nil, repository.ErrNotFound
	}

	share, err := s.shares.FindActiveByToken(ctx, token)
	if err != nil {
		return nil, err
	}

	// Soft-deleted configs disappear here for free: GORM's default scope adds
	// `deleted_at IS NULL`, so deleting the config stops every link pointing at
	// it without hunting down the shares one by one. A deleted config must not
	// keep serving through old links, and this is where that is enforced.
	cfg, err := s.configs.FindByID(ctx, share.UserID, share.ServerConfigID)
	if err != nil {
		return nil, err
	}

	body := cfg.Rendered(share.ShareType)
	if body == "" {
		return nil, ErrNotRendered
	}

	return &ServedServerShare{
		ShareType:   share.ShareType,
		Name:        cfg.Name,
		ContentType: "text/yaml; charset=utf-8",
		Filename:    filenameFor(cfg.Name, model.FormatMihomo),
		Body:        body,
	}, nil
}

func (s *ServerConfigShare) view(share *model.ServerConfigShare) ServerConfigShareView {
	return ServerConfigShareView{ServerConfigShare: *share, URL: s.cfg.ShareURL(share.Token)}
}
