# Mihomo Studio

English | [简体中文](README.zh-CN.md)

A Mihomo (Clash Meta) configuration management platform: dual in-browser editors
— one for client-side outbound configurations, one for server-side inbound
configurations — backed by a Go service providing OAuth sign-in, cloud storage,
and subscription / share links.

## Project layout

```
├── src/            # Frontend (React + TypeScript + Vite)
│   ├── core/       # Domain core: IR, schemas, parsers, exporters, validation (pure functions, no UI dependencies)
│   │   ├── ir/     # Intermediate representation (IR) types and factories
│   │   ├── server/ # Server-config IR, schemas, validation, import/export
│   │   ├── exporters/   # Mihomo YAML / Sing-Box JSON exporters
│   │   ├── importers/   # URI and subscription importers
│   │   └── parsers/     # Protocol URI parsing and base64 codecs
│   ├── schemas/    # Form schema definitions (fields, conditions, validation)
│   ├── components/ # UI components (editor layout, forms, home page, server editor)
│   ├── store/      # Zustand state (documents, cloud, shares, authentication)
│   ├── api/        # Backend API client
│   └── locales/    # i18n (Chinese / English)
├── server/         # Backend (Go + Gin + GORM + PostgreSQL)
│   ├── internal/   # handler, service, repository, middleware, auth, config
│   └── cmd/        # api, migrate, devtoken entry points
└── deploy/         # nginx configuration, frontend image Dockerfile
```

## Features

### Client config editor (`/client-config-editor`)

Outbound-oriented configuration design, including:

- **Broad protocol coverage**: mainstream outbound types (VLESS, Trojan, VMess,
  Shadowsocks, Hysteria2, TUIC, WireGuard, AnyTLS, Snell, among others) and rule
  types, plus top-level sections such as general settings, DNS, TUN, and
  proxy-providers.
- **IR-first, schema-driven**: configurations are stored as an intermediate
  representation (IR); forms are generated declaratively from schemas, with
  conditional visibility (`showIf`) and locked fields (`lockIf`).
- **Five-stage validation**: syntax → fields → cross-field → protocol semantics
  → cross-listener conflict analysis; export is blocked while errors remain.
- **Live preview and dual-format export**: real-time YAML preview in Monaco,
  with export to both Mihomo YAML and Sing-Box JSON.
- **REALITY support**: X25519 key pairs are generated in the browser via
  `@noble/curves`.

### Server config editor (`/server-config-editor`)

Inbound listeners and global settings, covering mainstream listener types
(HTTP/SOCKS/Mixed, Shadowsocks, VMess/VLESS/Trojan, TUIC, Hysteria2, AnyTLS,
among others), with tabs spanning overview, general, listeners, outbound,
rules, DNS, and validation — reusing the client editor's schema and five-stage
validation machinery.

### Cloud and sharing

- **GitHub OAuth sign-in**: signed-in configurations persist in the cloud, with
  rename and delete support.
- **Subscription links**: each client config can mint multiple per-device
  subscription links, with rotation and revocation (`/sub/:token`).
- **Share links**: server configs can generate share links (a full YAML
  document or an aggregated `proxies:` fragment), with revocation support
  (`/share/:token`).
- **Local drafts**: unsigned-in work is kept in `localStorage`, fully
  independent of cloud state.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Zustand, Tailwind CSS, Monaco Editor, i18next |
| Backend | Go 1.25, Gin, GORM, PostgreSQL, slog |
| Validation | Zod (frontend), a real `mihomo -t` binary (backend, optional) |

## Local development

### Backend

```bash
cd server
cp .env.example .env       # fill in JWT_SECRET, GitHub OAuth, PostgreSQL DSN
make db-up                 # start a local PostgreSQL (Docker)
make run                   # start the API, :8080 by default
```

### Frontend

```bash
cp .env.example .env.local # optional; the defaults work out of the box
npm install
npm run dev                # Vite dev server, :3000 by default
```

## Build and test

```bash
# Frontend
npm run test     # Vitest
npm run lint     # ESLint
npm run build    # tsc + vite build

# Backend
cd server
make test        # go test (repository tests require POSTGRESQL_DSN)
make vet         # go vet
```

## Deployment

- **Docker Compose**: `docker-compose.yml` orchestrates three services —
  PostgreSQL, the Go API, and the nginx-served frontend.
- **Images**: the backend uses a `distroless/static` multi-stage build, with an
  optional baked-in `mihomo` binary (`--build-arg MIHOMO_VERSION=v1.19.x`) to
  enable real-binary validation.

## API overview

All endpoints authenticate with a Bearer token (JWT). The only public
endpoints are `POST /api/v1/auth/github`, `GET /api/v1/geosite`, and the
subscription / share short links.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/me` | Current signed-in user |
| GET/POST/PUT/DELETE | `/api/v1/configs[/:id]` | Client config CRUD |
| GET/POST/PUT/DELETE | `/api/v1/server-configs[/:id]` | Server config CRUD |
| GET/POST | `/api/v1/configs/:id/subscriptions` | List / bind subscription links |
| POST | `/api/v1/subscriptions/:id/rotate` | Rotate a subscription (new token) |
| DELETE | `/api/v1/subscriptions/:id` | Revoke a subscription |
| GET/POST | `/api/v1/server-configs/:id/shares` | List / create share links |
| DELETE | `/api/v1/server-config-shares/:id` | Revoke a share |
| POST | `/api/v1/import/fetch` | Fetch a third-party subscription server-side (CORS bypass) |
| POST | `/api/v1/mihomo/validate` | Real-binary validation (optional) |
| GET | `/api/v1/mihomo/version` | Version of the baked-in mihomo binary |
| GET | `/api/v1/geosite` | Public geosite catalogue (unauthenticated) |
| GET | `/healthz` | Liveness probe (includes database status) |
| GET | `/sub/:token` | Public subscription endpoint |
| GET | `/share/:token` | Public share endpoint |

## License

MIT, see [LICENSE](LICENSE).
