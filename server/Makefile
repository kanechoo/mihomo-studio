.PHONY: help run build tidy fmt vet test clean db-up db-down migrate migrate-status

BINARY := bin/api
PKG    := ./cmd/api

help:
	@echo "run            - load .env and run the API"
	@echo "build          - compile to $(BINARY)"
	@echo "tidy           - resolve and prune go.mod/go.sum"
	@echo "fmt vet        - format and vet"
	@echo "test           - run the suite (repository tests need POSTGRESQL_DSN)"
	@echo "migrate        - apply pending schema migrations"
	@echo "migrate-status - list applied and pending migrations"
	@echo "db-up          - start a local PostgreSQL in Docker"
	@echo "db-down        - stop and remove it (destroys data)"

run:
	go run $(PKG)

build:
	go build -o $(BINARY) $(PKG)

tidy:
	go mod tidy

fmt:
	go fmt ./...

vet:
	go vet ./...

# The repository tests run against a real PostgreSQL — the isolation rules they
# check are enforced by WHERE clauses and partial indexes, and a fake would only
# prove the fake agrees with itself. They skip when the DSN is absent.
test:
	set -a && . ./.env && set +a && go test -count=1 ./...

# The server migrates on boot, so these are for the times that is the wrong
# shape: asking what a database is on without starting anything, or moving the
# schema as its own deploy step.
migrate:
	go run ./cmd/migrate up

migrate-status:
	go run ./cmd/migrate status

clean:
	rm -rf bin/

# Matches the credentials in .env.example so `make db-up` and the default DSN
# line up without editing either. Compose runs its own PostgreSQL in a named
# volume; this is the one for `make run` against a local Go process.
db-up:
	docker run -d --name mihomo-pg -p 5432:5432 \
		-e POSTGRES_USER=mihomo -e POSTGRES_PASSWORD=mihomo -e POSTGRES_DB=mihomo \
		postgres:16-alpine

db-down:
	docker rm -f mihomo-pg
