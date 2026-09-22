package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrCodeRejected means GitHub refused the authorization code: it was never
// valid, has already been redeemed, or has expired. It is the one GitHub
// failure that is the caller's fault rather than an outage, so it maps to 401
// while everything else maps to 503.
var ErrCodeRejected = errors.New("github rejected the authorization code")

const (
	githubTokenURL = "https://github.com/login/oauth/access_token"
	githubUserURL  = "https://api.github.com/user"

	// GitHub's API rejects requests without a User-Agent.
	githubUserAgent  = "mihomo-studio-server"
	githubAPIVersion = "2022-11-28"

	// The default http.Client has no timeout at all. A GitHub outage that
	// accepts connections and never answers would otherwise pin one of our
	// request-handling goroutines per login attempt, indefinitely.
	githubTimeout = 10 * time.Second

	// Both responses are small JSON objects. Reading without a bound means a
	// compromised or misbehaving upstream can decide how much memory this
	// process allocates.
	maxGithubResponseBytes = 1 << 20
)

// GithubUser is the subset of GitHub's profile this service stores.
type GithubUser struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
	Name  string `json:"name"`
	// Present only when the account's email is public. Left empty otherwise —
	// reading a private address needs the user:email scope, and the service has
	// no feature that would use it.
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

// GithubClient performs the two server-side halves of the OAuth flow.
type GithubClient struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client

	// Overridable so tests can point at a local server; production never sets
	// them.
	tokenURL string
	userURL  string
}

func NewGithubClient(clientID, clientSecret string) *GithubClient {
	return &GithubClient{
		clientID:     clientID,
		clientSecret: clientSecret,
		httpClient:   &http.Client{Timeout: githubTimeout},
		tokenURL:     githubTokenURL,
		userURL:      githubUserURL,
	}
}

// Exchange trades the code the browser was redirected with for an access token.
//
// This runs on the server because it requires the client secret. Doing it in
// the browser would ship that secret to every visitor, and anyone holding it
// can mint tokens for this OAuth app against any user who can be persuaded to
// click an authorize link.
func (g *GithubClient) Exchange(ctx context.Context, code string) (string, error) {
	form := url.Values{
		"client_id":     {g.clientID},
		"client_secret": {g.clientSecret},
		"code":          {code},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.tokenURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Without this GitHub answers in application/x-www-form-urlencoded, which
	// parses into a token that silently keeps its trailing "&scope=..." on.
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", githubUserAgent)

	resp, err := g.httpClient.Do(req)
	if err != nil {
		// The URL is fixed and carries no secret, but the form body did — so the
		// error is reported without the request that produced it.
		return "", fmt.Errorf("call github token endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxGithubResponseBytes))
	if err != nil {
		return "", fmt.Errorf("read token response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github token endpoint returned %s", resp.Status)
	}

	var payload struct {
		AccessToken      string `json:"access_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}

	// GitHub reports a bad code as HTTP 200 with an error field. Checking only
	// the status here is the classic way to end up treating "" as a valid access
	// token and then reporting a confusing failure one request later.
	if payload.Error != "" {
		return "", fmt.Errorf("%w: %s", ErrCodeRejected, payload.Error)
	}
	if payload.AccessToken == "" {
		return "", errors.New("github returned no access token and no error")
	}
	return payload.AccessToken, nil
}

// User reads the profile the access token belongs to.
//
// The token is used for this one call and then dropped. Storing it would mean
// holding a live credential to someone's GitHub account in order to display
// their avatar.
func (g *GithubClient) User(ctx context.Context, accessToken string) (*GithubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.userURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("User-Agent", githubUserAgent)

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call github user endpoint: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxGithubResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("read user response: %w", err)
	}
	if resp.StatusCode == http.StatusUnauthorized {
		// The token was accepted moments ago, so this means it was revoked
		// between the two calls — rare, but it is the user's session to retry.
		return nil, fmt.Errorf("%w: access token rejected", ErrCodeRejected)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github user endpoint returned %s", resp.Status)
	}

	var user GithubUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, fmt.Errorf("decode user response: %w", err)
	}
	// Identity is this number; every config and proxy credential in the database
	// hangs off it. A zero here would merge every such response into one shared
	// account, so it is treated as a failed login rather than a default.
	if user.ID == 0 {
		return nil, errors.New("github profile has no id")
	}
	return &user, nil
}
