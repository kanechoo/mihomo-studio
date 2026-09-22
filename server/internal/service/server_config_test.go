package service

import (
	"context"
	"os"
	"strings"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"mihomo-studio-server/internal/model"
	"mihomo-studio-server/internal/repository"
)

// openTx mirrors repository.openTx: one rolled-back transaction per test,
// skipped when no database is configured. The quota and validation rules below
// are the service's own logic; the transaction just gives them a real
// repository to talk to.
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

func openServerConfigFixture(t *testing.T) (*ServerConfig, *model.User) {
	t.Helper()

	tx := openTx(t)
	users := repository.NewUserRepository(tx)
	ctx := context.Background()

	user := &model.User{GithubID: 900000031, Login: "alice"}
	if err := users.UpsertByGithubID(ctx, user); err != nil {
		t.Fatalf("create user: %v", err)
	}

	return NewServerConfig(repository.NewServerConfigRepository(tx)), user
}

func validServerInput(name string) ServerConfigInput {
	return ServerConfigInput{
		Name: name,
		IR:   model.JSONB(`{"schemaVersion":1,"dns":{"enable":false},"listeners":[]}`),
	}
}

func TestServerConfigCreateNormalisesAndRejects(t *testing.T) {
	svc, user := openServerConfigFixture(t)
	ctx := context.Background()

	if _, err := svc.Create(ctx, user.ID, validServerInput("  spaced  ")); err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := svc.Create(ctx, user.ID, validServerInput("")); err == nil {
		t.Fatal("empty name accepted")
	} else if !strings.Contains(err.Error(), "name is required") {
		t.Fatalf("empty name error: %v", err)
	}

	long := strings.Repeat("汉", 101)
	if _, err := svc.Create(ctx, user.ID, validServerInput(long)); err == nil {
		t.Fatal("over-long name accepted")
	}

	bad := validServerInput("ok")
	bad.IR = model.JSONB(`5`)
	if _, err := svc.Create(ctx, user.ID, bad); err == nil {
		t.Fatal("scalar ir accepted")
	}
}

func TestServerConfigQuotaIsEnforced(t *testing.T) {
	svc, user := openServerConfigFixture(t)
	ctx := context.Background()

	for i := 0; i < maxServerConfigsPerUser; i++ {
		if _, err := svc.Create(ctx, user.ID, validServerInput(strings.Repeat("x", 90)+string(rune('a'+i%26))+ // unique names
			"-"+itoa(i))); err != nil {
			t.Fatalf("create %d: %v", i, err)
		}
	}

	if _, err := svc.Create(ctx, user.ID, validServerInput("one too many")); err == nil {
		t.Fatal("quota not enforced")
	} else if !strings.Contains(err.Error(), "limit of 50") {
		t.Fatalf("quota error text: %v", err)
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}
