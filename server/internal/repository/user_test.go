package repository

import (
	"context"
	"errors"
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"mihomo-studio-server/internal/model"
)

// A github_id no real account will have, so a stray commit is recognisable.
const testGithubID = int64(999000111)

// openTx gives each test a transaction that is always rolled back. The upsert
// under test is a single statement whose whole point is what the database does
// with a conflict, so it has to run against a real PostgreSQL — but it must not
// leave rows behind in the developer's database.
func openTx(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("POSTGRESQL_DSN")
	if dsn == "" {
		t.Skip("POSTGRESQL_DSN is not set; run with: set -a && . ./.env && set +a && go test ./...")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger:         gormlogger.Default.LogMode(gormlogger.Silent),
		TranslateError: true,
	})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}

	tx := db.Begin()
	if tx.Error != nil {
		t.Fatalf("begin: %v", tx.Error)
	}
	t.Cleanup(func() { tx.Rollback() })
	return tx
}

// The property the whole account model rests on: a second login must land on
// the row the first one created. If it did not, a user would come back to an
// empty config list and no way to reach the one they had.
func TestUpsertByGithubIDReusesTheSameRow(t *testing.T) {
	repo := NewUserRepository(openTx(t))
	ctx := context.Background()

	first := &model.User{
		GithubID:  testGithubID,
		Login:     "octocat",
		Name:      "The Octocat",
		AvatarURL: "https://example.test/a.png",
	}
	if err := repo.UpsertByGithubID(ctx, first); err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	if first.ID == 0 {
		t.Fatal("first upsert did not return an ID")
	}

	// Same account, renamed on GitHub since. The profile is display data and
	// follows; the identity does not.
	second := &model.User{
		GithubID:  testGithubID,
		Login:     "octocat-renamed",
		Name:      "Renamed",
		AvatarURL: "https://example.test/b.png",
	}
	if err := repo.UpsertByGithubID(ctx, second); err != nil {
		t.Fatalf("second upsert: %v", err)
	}

	if second.ID != first.ID {
		t.Fatalf("second login created a new row: id %d then %d", first.ID, second.ID)
	}
	if !second.CreatedAt.Equal(first.CreatedAt) {
		t.Errorf("created_at moved: %v then %v", first.CreatedAt, second.CreatedAt)
	}

	stored, err := repo.FindByID(ctx, first.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if stored.Login != "octocat-renamed" || stored.Name != "Renamed" {
		t.Errorf("profile was not refreshed: %+v", stored)
	}

	var count int64
	if err := repo.db.Model(&model.User{}).
		Where("github_id = ?", testGithubID).Count(&count).Error; err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Errorf("rows for one github account = %d, want 1", count)
	}
}

func TestFindByIDMissing(t *testing.T) {
	repo := NewUserRepository(openTx(t))

	if _, err := repo.FindByID(context.Background(), 2147483000); !errors.Is(err, ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}

// GitHub does not constrain these to the column widths, so an over-long name
// must be clipped rather than becoming a 500 on an otherwise valid login.
func TestUpsertTruncatesOverlongProfile(t *testing.T) {
	repo := NewUserRepository(openTx(t))
	ctx := context.Background()

	long := make([]rune, model.MaxNameLen+50)
	for i := range long {
		long[i] = '名'
	}

	u := &model.User{GithubID: testGithubID + 1, Login: "long", Name: string(long)}
	u.TruncateProfile()

	if err := repo.UpsertByGithubID(ctx, u); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if got := len([]rune(u.Name)); got != model.MaxNameLen {
		t.Errorf("stored name length = %d, want %d", got, model.MaxNameLen)
	}
}
