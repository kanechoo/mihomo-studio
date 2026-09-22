// Command devtoken mints a session token for a fake local account.
//
// It exists because the only other way to obtain a token is to complete a real
// GitHub redirect in a browser, which cannot be scripted and cannot easily
// produce the *two* accounts needed to test that one user cannot reach the
// other's configs.
//
// Development only. It is a separate binary from the server, it refuses to run
// unless APP_ENV is development, and it needs JWT_SECRET — so it grants nothing
// that whoever holds that secret does not already have.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"os"
	"time"

	"github.com/joho/godotenv"

	"mihomo-studio-server/internal/auth"
	"mihomo-studio-server/internal/config"
	"mihomo-studio-server/internal/database"
	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

func main() {
	githubID := flag.Int64("github-id", 999000001, "fake GitHub account ID; a different value means a different user")
	login := flag.String("login", "devuser", "login name to store")
	flag.Parse()

	if err := run(*githubID, *login); err != nil {
		log.Fatal(err)
	}
}

func run(githubID int64, login string) error {
	_ = godotenv.Load(".env")

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.IsProduction() {
		return fmt.Errorf("refusing to run with APP_ENV=production")
	}

	// A logger of its own, at warn: this command's output is the token, and the
	// statement log that a development server wants would bury the two lines
	// that matter here.
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	db, err := database.New(cfg, logger)
	if err != nil {
		return err
	}
	defer func() { _ = database.Close(db) }()
	now := time.Now().UTC()
	user := &model.User{
		GithubID:    githubID,
		Login:       login,
		Name:        login,
		Email:       login + "@example.test",
		AvatarURL:   "https://example.test/avatar.png",
		LastLoginAt: &now,
	}
	user.TruncateProfile()

	if err := repository.NewUserRepository(db).UpsertByGithubID(context.Background(), user); err != nil {
		return err
	}

	token, expiresAt, err := auth.NewIssuer(cfg.JWTSecret, cfg.JWTTTL).Issue(user.ID)
	if err != nil {
		return err
	}

	fmt.Fprintf(os.Stderr, "user id %d (github_id %d, login %s), token expires %s\n",
		user.ID, user.GithubID, user.Login, expiresAt.Format(time.RFC3339))
	// The token alone goes to stdout so it can be captured: TOKEN=$(go run ./cmd/devtoken)
	fmt.Println(token)
	return nil
}
