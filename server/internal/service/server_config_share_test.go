package service

import (
	"context"
	"strings"
	"testing"

	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// The full path a visitor's link walks, wired over one rolled-back
// transaction: save → create → resolve. Every property this feature exists
// for is asserted against what actually comes back out of Resolve.
type shareHarness struct {
	svc     *ServerConfigShare
	configs *ServerConfig
	user    *model.User
}

func newShareHarness(t *testing.T) *shareHarness {
	t.Helper()

	tx := openTx(t)
	users := repository.NewUserRepository(tx)
	ctx := context.Background()

	user := &model.User{GithubID: 900000051, Login: "alice"}
	if err := users.UpsertByGithubID(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}

	h := &shareHarness{
		svc: NewServerConfigShare(
			repository.NewServerConfigShareRepository(tx),
			repository.NewServerConfigRepository(tx),
			&config.Config{PublicBaseURL: "https://mihomo.example"},
		),
		configs: NewServerConfig(repository.NewServerConfigRepository(tx)),
		user:    user,
	}
	t.Cleanup(func() { tx.Rollback() })
	return h
}

const bareIR = `{"schemaVersion":1,"dns":{"enable":false},"listeners":[]}`

func (h *shareHarness) createBareConfig(t *testing.T, name string) *model.ServerConfig {
	t.Helper()
	cfg, err := h.configs.Create(context.Background(), h.user.ID, ServerConfigInput{
		Name: name,
		IR:   model.JSONB(bareIR),
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	return cfg
}

// saveDocument stands in for one editor save: the IR and both rendered
// artifacts travel together, exactly as ServerConfigUpdate carries them.
func (h *shareHarness) saveDocument(t *testing.T, id uint, name, ir, serverYAML, proxiesYAML string) {
	t.Helper()
	if ir == "" {
		ir = bareIR
	}
	if _, err := h.configs.Update(context.Background(), h.user.ID, id, ServerConfigInput{
		Name:                  name,
		IR:                    model.JSONB(ir),
		RenderedServerYAML:    serverYAML,
		RenderedClientProxies: proxiesYAML,
	}); err != nil {
		t.Fatalf("update config: %v", err)
	}
}

func TestServerShareCreateValidatesTypeAndOwnership(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()
	cfg := h.createBareConfig(t, "relay")

	// An unknown payload type is refused before anything is minted.
	if _, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{ShareType: "snapshot"}); err == nil {
		t.Fatal("unknown share_type accepted")
	} else if !strings.Contains(err.Error(), "share_type") {
		t.Fatalf("unexpected error text: %v", err)
	}

	// Naming someone else's config — or one that does not exist — is 404, not
	// an empty success.
	if _, err := h.svc.Create(ctx, h.user.ID, cfg.ID+999, ServerConfigShareInput{ShareType: model.ShareTypeFullServerYAML}); err != repository.ErrNotFound {
		t.Fatalf("create on foreign config: err = %v, want ErrNotFound", err)
	}

	for _, shareType := range []string{model.ShareTypeFullServerYAML, model.ShareTypeServerToClientProxies} {
		view, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{ShareType: shareType})
		if err != nil {
			t.Fatalf("create %s: %v", shareType, err)
		}
		if view.Token == "" || view.URL == "" || !strings.HasSuffix(view.URL, "/"+view.Token) {
			t.Fatalf("view for %s carries no usable URL: %+v", shareType, view)
		}
	}
}

// The property the whole feature rests on: the link serves the config as it
// was last SAVED. The editor rewrites the artifacts in the same statement as
// the IR on every save, so a later save must reach links minted before it.
func TestServerShareResolveServesTheLatestSavedArtifacts(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()

	cfg := h.createBareConfig(t, "relay")
	h.saveDocument(t, cfg.ID, "relay", "", "listeners: []\n", "proxies: []\n")

	created, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{
		ShareType: model.ShareTypeFullServerYAML,
	})
	if err != nil {
		t.Fatalf("create share: %v", err)
	}

	resolved, err := h.svc.Resolve(ctx, created.Token)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved.ShareType != model.ShareTypeFullServerYAML || resolved.Name != "relay" {
		t.Fatalf("resolved descriptor mismatch: %+v", resolved)
	}
	if resolved.Body != "listeners: []\n" {
		t.Fatalf("first resolve returned %q", resolved.Body)
	}
	if resolved.ContentType != "text/yaml; charset=utf-8" {
		t.Fatalf("content type = %q", resolved.ContentType)
	}
	if resolved.Filename != "relay.yaml" {
		t.Fatalf("filename = %q, want relay.yaml", resolved.Filename)
	}

	// Scenario from the brief: 10:00 the share is minted; 10:30 the config is
	// saved again; 11:00 the same link must serve the new YAML.
	h.saveDocument(t, cfg.ID, "relay", "", "# port 8443\nlisteners: []\n", "")

	resolved, err = h.svc.Resolve(ctx, created.Token)
	if err != nil {
		t.Fatalf("resolve after edit: %v", err)
	}
	if resolved.Body == "listeners: []\n" || !strings.Contains(resolved.Body, "port 8443") {
		t.Fatalf("stale YAML served through a live share link: %q", resolved.Body)
	}
}

// Each share type serves its own artifact. They must never cross.
func TestServerShareTypesServeTheirOwnArtifacts(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()
	cfg := h.createBareConfig(t, "relay")
	h.saveDocument(t, cfg.ID, "relay", "", "listeners: []\n", "proxies: []\n")

	var tokens []string
	for _, shareType := range []string{model.ShareTypeFullServerYAML, model.ShareTypeServerToClientProxies} {
		created, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{ShareType: shareType})
		if err != nil {
			t.Fatalf("create %s share: %v", shareType, err)
		}
		tokens = append(tokens, created.Token)
	}

	fullResolved, err := h.svc.Resolve(ctx, tokens[0])
	if err != nil {
		t.Fatalf("resolve full: %v", err)
	}
	proxiesResolved, err := h.svc.Resolve(ctx, tokens[1])
	if err != nil {
		t.Fatalf("resolve proxies: %v", err)
	}

	if fullResolved.Body != "listeners: []\n" || proxiesResolved.Body != "proxies: []\n" {
		t.Fatalf("payloads crossed: full=%q proxies=%q", fullResolved.Body, proxiesResolved.Body)
	}
}

// A config saved without artifacts has nothing for its links to serve. That is
// a distinct refusal from a missing link because the fix belongs to the owner:
// open the editor and save once.
func TestServerShareWithoutArtifactIsNotRendered(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()
	cfg := h.createBareConfig(t, "bare")

	for _, shareType := range []string{model.ShareTypeFullServerYAML, model.ShareTypeServerToClientProxies} {
		created, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{ShareType: shareType})
		if err != nil {
			t.Fatalf("create %s share: %v", shareType, err)
		}
		if _, err := h.svc.Resolve(ctx, created.Token); err != ErrNotRendered {
			t.Fatalf("%s without artifact: err = %v, want ErrNotRendered", shareType, err)
		}
	}

	// Saving with artifacts turns the links on.
	h.saveDocument(t, cfg.ID, "bare", "", "listeners: []\n", "proxies: []\n")

	rows, err := h.svc.List(ctx, h.user.ID, cfg.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected both shares to survive, got %d", len(rows))
	}
	for _, row := range rows {
		resolved, err := h.svc.Resolve(ctx, row.Token)
		if err != nil {
			t.Fatalf("resolve %s after save: %v", row.ShareType, err)
		}
		if resolved.Body == "" {
			t.Fatalf("%s resolved an empty body", row.ShareType)
		}
	}
}

// Deleting the source config must take every link with it — never keep serving
// the last saved YAML behind a token.
func TestServerShareDiesWithItsConfig(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()
	cfg := h.createBareConfig(t, "doomed")
	h.saveDocument(t, cfg.ID, "doomed", "", "listeners: []\n", "proxies: []\n")

	var tokens []string
	for _, shareType := range []string{model.ShareTypeFullServerYAML, model.ShareTypeServerToClientProxies} {
		created, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{ShareType: shareType})
		if err != nil {
			t.Fatalf("create %s share: %v", shareType, err)
		}
		tokens = append(tokens, created.Token)
		if _, err := h.svc.Resolve(ctx, created.Token); err != nil {
			t.Fatalf("resolve %s before delete: %v", shareType, err)
		}
	}

	if err := h.configs.Delete(ctx, h.user.ID, cfg.ID); err != nil {
		t.Fatalf("delete config: %v", err)
	}

	for _, token := range tokens {
		if _, err := h.svc.Resolve(ctx, token); err != repository.ErrNotFound {
			t.Fatalf("link outlived its config: err = %v, want ErrNotFound", err)
		}
	}

	// And nothing new can be minted against a deleted config either.
	if _, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{
		ShareType: model.ShareTypeFullServerYAML,
	}); err != repository.ErrNotFound {
		t.Fatalf("create share on deleted config: err = %v, want ErrNotFound", err)
	}
}

// Revoking must be the off switch it is on subscriptions: the row stays in the
// owner's list, the public path stops answering.
func TestServerShareRevokeStopsResolutionButKeepsTheRow(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()
	cfg := h.createBareConfig(t, "relay")
	h.saveDocument(t, cfg.ID, "relay", "", "listeners: []\n", "")

	created, err := h.svc.Create(ctx, h.user.ID, cfg.ID, ServerConfigShareInput{
		ShareType: model.ShareTypeServerToClientProxies,
	})
	if err != nil {
		t.Fatalf("create share: %v", err)
	}

	if err := h.svc.Revoke(ctx, h.user.ID, created.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if _, err := h.svc.Resolve(ctx, created.Token); err != repository.ErrNotFound {
		t.Fatalf("revoked token still resolves: err = %v, want ErrNotFound", err)
	}

	rows, err := h.svc.List(ctx, h.user.ID, cfg.ID)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 1 || rows[0].RevokedAt == nil {
		t.Fatalf("owner cannot see the revoked share: %+v", rows)
	}
}

// Junk paths are filtered before the database, and a shaped-but-unknown token
// answers 404 rather than an error an anonymous caller could read into.
func TestServerShareRejectsMalformedAndUnknownTokens(t *testing.T) {
	h := newShareHarness(t)
	ctx := context.Background()

	for _, token := range []string{"", "short", "../../etc/passwd", strings.Repeat("A", 500)} {
		if _, err := h.svc.Resolve(ctx, token); err != repository.ErrNotFound {
			t.Fatalf("malformed token %q: err = %v, want ErrNotFound", token, err)
		}
	}

	token, err := model.NewSubscriptionToken()
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	if _, err := h.svc.Resolve(ctx, token); err != repository.ErrNotFound {
		t.Fatalf("unknown token: err = %v, want ErrNotFound", err)
	}
}
