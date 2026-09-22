// Package service holds the business rules. It coordinates repositories and
// external clients; it does not know that HTTP exists.
package service

import (
	"context"
	"fmt"
	"time"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// Session is what a successful login produces.
type Session struct {
	Token     string      `json:"token"`
	ExpiresAt time.Time   `json:"expires_at"`
	User      *model.User `json:"user"`
}

type Auth struct {
	github *auth.GithubClient
	issuer *auth.Issuer
	users  *repository.UserRepository
}

func NewAuth(github *auth.GithubClient, issuer *auth.Issuer, users *repository.UserRepository) *Auth {
	return &Auth{github: github, issuer: issuer, users: users}
}

// SignInWithGithub turns an OAuth code into a session.
//
// Signing in twice must land on the same row: the account is keyed on GitHub's
// numeric ID, so a second login updates the profile in place rather than
// creating a parallel account whose configs the user cannot see from the first.
func (s *Auth) SignInWithGithub(ctx context.Context, code string) (*Session, error) {
	accessToken, err := s.github.Exchange(ctx, code)
	if err != nil {
		return nil, err
	}

	profile, err := s.github.User(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	// The access token has served its only purpose. It goes out of scope here
	// and is never written to the database or the log.

	now := time.Now().UTC()
	user := &model.User{
		GithubID:    profile.ID,
		Login:       profile.Login,
		Name:        profile.Name,
		Email:       profile.Email,
		AvatarURL:   profile.AvatarURL,
		LastLoginAt: &now,
	}
	user.TruncateProfile()

	if err := s.users.UpsertByGithubID(ctx, user); err != nil {
		return nil, err
	}

	token, expiresAt, err := s.issuer.Issue(user.ID)
	if err != nil {
		return nil, fmt.Errorf("issue session token: %w", err)
	}

	return &Session{Token: token, ExpiresAt: expiresAt, User: user}, nil
}

// CurrentUser backs GET /api/v1/me.
//
// It reads the row rather than trusting the token's contents, so a renamed
// account or a changed avatar shows up on the next request instead of at the
// next login — and, more importantly, a user deleted from the database stops
// resolving even though their unexpired token still verifies.
func (s *Auth) CurrentUser(ctx context.Context, userID uint) (*model.User, error) {
	return s.users.FindByID(ctx, userID)
}
