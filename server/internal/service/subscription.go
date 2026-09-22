package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// A config with more live URLs than this is either a mistake or an attempt to
// make the table grow for free. Twenty is far more devices than anyone has and
// still small enough that the list stays readable.
const maxSubscriptionsPerConfig = 20

// ErrNotRendered is the one refusal on the public path that is not "no such
// token". The subscription is real and live, but the config behind it was saved
// without an export in this format, so there is nothing to serve.
//
// It is worth distinguishing because the fix is the user's to make and takes
// five seconds — open the editor and save again — whereas a 404 would send them
// looking for a broken URL that is not broken.
var ErrNotRendered = errors.New("this config has no rendered artifact for the requested format")

// SubscriptionInput is what the editor sends when binding a URL to a config.
type SubscriptionInput struct {
	// Which artifact the URL serves. Empty means mihomo.
	Format string `json:"format"`
	// A human label, so a user with one URL per device can tell them apart.
	Label string `json:"label"`
}

// SubscriptionView is a subscription as the API returns it: the row, plus the
// URL built from it.
//
// The URL is assembled here rather than in the browser because it depends on
// PUBLIC_BASE_URL, which only the server knows. A frontend guessing it from
// window.location would be right in development and wrong the moment the API
// moves to its own hostname — and the failure would land on the user's phone,
// not on anyone's screen here.
type SubscriptionView struct {
	model.Subscription
	URL string `json:"url"`
}

// Served is one resolved subscription fetch, ready to be written to the wire.
type Served struct {
	SubscriptionID uint
	Format         string
	ContentType    string
	// Suggested filename. Clash-family clients use it to name the profile they
	// have just imported, which is the difference between a phone showing "home"
	// and one showing a 43-character token.
	Filename string
	Body     string
}

type Subscription struct {
	subs    *repository.SubscriptionRepository
	configs *repository.ConfigRepository
	cfg     *config.Config
}

func NewSubscription(
	subs *repository.SubscriptionRepository,
	configs *repository.ConfigRepository,
	cfg *config.Config,
) *Subscription {
	return &Subscription{subs: subs, configs: configs, cfg: cfg}
}

// List returns the subscriptions on one of the caller's configs.
//
// The ownership check comes first and is not an optimisation: without it, a
// request naming someone else's config would return an empty list, and an empty
// list is an answer — it says the config exists and currently has no URLs. The
// 404 says nothing.
func (s *Subscription) List(ctx context.Context, userID, configID uint) ([]SubscriptionView, error) {
	if err := s.configs.Exists(ctx, userID, configID); err != nil {
		return nil, err
	}

	subs, err := s.subs.ListByConfig(ctx, userID, configID)
	if err != nil {
		return nil, err
	}

	views := make([]SubscriptionView, 0, len(subs))
	for i := range subs {
		views = append(views, s.view(&subs[i]))
	}
	return views, nil
}

// Bind mints a new subscription URL for a config.
func (s *Subscription) Bind(ctx context.Context, userID, configID uint, in SubscriptionInput) (*SubscriptionView, error) {
	if err := in.normaliseAndValidate(); err != nil {
		return nil, err
	}
	if err := s.configs.Exists(ctx, userID, configID); err != nil {
		return nil, err
	}

	active, err := s.subs.CountActiveByConfig(ctx, userID, configID)
	if err != nil {
		return nil, err
	}
	if active >= maxSubscriptionsPerConfig {
		return nil, invalid("this config already has %d active subscriptions, which is the limit; revoke one first",
			maxSubscriptionsPerConfig)
	}

	token, err := model.NewSubscriptionToken()
	if err != nil {
		return nil, err
	}

	sub := &model.Subscription{
		ConfigID: configID,
		// Taken from the verified token by way of the handler, and never from the
		// request body — same rule as everywhere else. Here it does double duty:
		// it is also what the public endpoint later uses to decide which user's
		// configs this URL is allowed to reach.
		UserID: userID,
		Token:  token,
		Format: in.Format,
		Label:  in.Label,
	}
	if err := s.subs.Create(ctx, sub); err != nil {
		return nil, err
	}

	view := s.view(sub)
	return &view, nil
}

// Rotate issues a new token for an existing subscription.
//
// This is the response to a leaked URL: the label, the format and the access
// history survive, and the URL that got out stops working immediately. Revoking
// and binding again would achieve the first half and lose the second.
func (s *Subscription) Rotate(ctx context.Context, userID, id uint) (*SubscriptionView, error) {
	token, err := model.NewSubscriptionToken()
	if err != nil {
		return nil, err
	}

	sub, err := s.subs.RotateToken(ctx, userID, id, token)
	if err != nil {
		return nil, err
	}

	view := s.view(sub)
	return &view, nil
}

func (s *Subscription) Revoke(ctx context.Context, userID, id uint) error {
	return s.subs.Revoke(ctx, userID, id)
}

// Resolve turns a token from the URL into the bytes to serve.
//
// This is the whole public path, and the ordering matters. The token finds a
// subscription; the subscription names its owner; the config is then loaded
// through the same user-scoped method the authenticated endpoints use, with
// that owner as the tenant. There is no query here that a token could widen —
// holding one gets you the configs of exactly one user, the one who minted it.
func (s *Subscription) Resolve(ctx context.Context, rawToken string) (*Served, error) {
	token := strings.TrimSpace(rawToken)
	if !model.TokenLooksWellFormed(token) {
		// Shaped wrong, so no row can match it. Answering from here keeps a
		// stream of junk paths off the database entirely.
		return nil, repository.ErrNotFound
	}

	sub, err := s.subs.FindActiveByToken(ctx, token)
	if err != nil {
		return nil, err
	}

	// Soft-deleted configs disappear here for free: GORM's default scope adds
	// `deleted_at IS NULL`, so deleting a config silently stops every URL
	// pointing at it without needing to find and revoke them one by one.
	cfg, err := s.configs.FindByID(ctx, sub.UserID, sub.ConfigID)
	if err != nil {
		return nil, err
	}

	body := cfg.Rendered(sub.Format)
	if body == "" {
		return nil, ErrNotRendered
	}

	return &Served{
		SubscriptionID: sub.ID,
		Format:         sub.Format,
		ContentType:    model.ContentType(sub.Format),
		Filename:       filenameFor(cfg.Name, sub.Format),
		Body:           body,
	}, nil
}

// RecordAccess stamps usage telemetry. Its error is worth logging and never
// worth failing on: the client already has its config, and a subscription that
// breaks because a counter could not be incremented would be absurd.
func (s *Subscription) RecordAccess(ctx context.Context, id uint, userAgent string) error {
	return s.subs.RecordAccess(ctx, id, userAgent)
}

func (s *Subscription) view(sub *model.Subscription) SubscriptionView {
	return SubscriptionView{Subscription: *sub, URL: s.cfg.SubscriptionURL(sub.Token)}
}

func (in *SubscriptionInput) normaliseAndValidate() error {
	in.Format = strings.TrimSpace(strings.ToLower(in.Format))
	in.Label = strings.TrimSpace(in.Label)

	if in.Format == "" {
		in.Format = model.FormatMihomo
	}
	if !model.ValidFormat(in.Format) {
		return invalid("format must be %q or %q", model.FormatMihomo, model.FormatSingbox)
	}
	if n := utf8.RuneCountInString(in.Label); n > model.MaxLabelLen {
		return invalid("label must be at most %d characters, got %d", model.MaxLabelLen, n)
	}
	return nil
}

// filenameFor names the downloaded profile after the config it came from.
func filenameFor(configName, format string) string {
	ext := "yaml"
	if format == model.FormatSingbox {
		ext = "json"
	}
	name := strings.TrimSpace(configName)
	if name == "" {
		name = "config"
	}
	return fmt.Sprintf("%s.%s", name, ext)
}
