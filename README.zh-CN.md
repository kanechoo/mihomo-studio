# Mihomo Studio（Mihomo 配置管理）

[English](README.md) | 简体中文

一个 Mihomo（Clash Meta）配置管理平台：浏览器端的双编辑器（客户端出站配置、服务端入站配置），
配合 Go 后端提供的 OAuth 登录、云端保存与订阅/分享链接服务。

## 项目结构

```
├── src/            # 前端（React + TypeScript + Vite）
│   ├── core/       # 领域核心：IR、schema、解析器、导出器、校验（纯函数，不依赖 UI）
│   │   ├── ir/     # 中间表示（IR）类型与工厂
│   │   ├── server/ # 服务端配置 IR、schema、校验、导入导出
│   │   ├── exporters/   # Mihomo YAML / Sing-Box JSON 导出
│   │   ├── importers/   # URI、订阅导入
│   │   └── parsers/     # 协议 URI 解析与 base64 编解码
│   ├── schemas/    # 表单 schema 定义（字段、条件、校验）
│   ├── components/ # UI 组件（编辑器布局、表单、首页、server 编辑器）
│   ├── store/      # Zustand 状态（文档、云端、分享、认证）
│   ├── api/        # 后端 API 客户端
│   └── locales/    # i18n（中文 / 英文）
├── server/         # 后端（Go + Gin + GORM + PostgreSQL）
│   ├── internal/   # handler、service、repository、middleware、auth、config
│   └── cmd/        # api、migrate、devtoken 入口
└── deploy/         # nginx 配置、前端镜像 Dockerfile
```

## 功能概览

### 客户端配置编辑器（`/client-config-editor`）

面向出站代理的配置设计，功能包括：

- **完整协议覆盖**：主流出站类型（VLESS、Trojan、VMess、Shadowsocks、Hysteria2、TUIC、
  WireGuard、AnyTLS、Snell 等）与规则类型，以及全局、DNS、TUN、proxy-provider 等顶层节。
- **IR 优先 + schema 驱动**：配置以中间表示（IR）存储，表单由 schema 声明式生成，
  支持条件显隐（`showIf`）与锁定字段（`lockIf`）。
- **五级校验**：语法 → 字段 → 跨字段 → 协议语义 → 跨监听器冲突分析；存在 error 时阻止导出。
- **实时预览与双格式导出**：Monaco 实时预览 YAML，支持导出 Mihomo YAML 与 Sing-Box JSON。
- **REALITY 支持**：前端使用 `@noble/curves` 生成 X25519 密钥对。

### 服务端配置编辑器（`/server-config-editor`）

面向入站监听器与全局配置，涵盖主流监听器类型（HTTP/SOCKS/Mixed、Shadowsocks、
VMess/VLESS/Trojan、TUIC、Hysteria2、AnyTLS 等），标签页包含总览、通用、监听器、出站、
规则、DNS、校验，
复用客户端编辑器同款的 schema 与五级校验体系。

### 云端与分享

- **GitHub OAuth 登录**：登录后配置可保存至云端，支持重命名、删除。
- **订阅链接**：每个客户端配置可生成多个设备订阅链接，支持轮换与撤销（`/sub/:token`）。
- **分享链接**：服务端配置可生成分享链接（完整 YAML 或聚合 `proxies:` 片段），支持撤销
  （`/share/:token`）。
- **本地草稿**：未登录时配置保存在 `localStorage`，两者互不干扰。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite、Zustand、Tailwind CSS、Monaco Editor、i18next |
| 后端 | Go 1.25、Gin、GORM、PostgreSQL、slog |
| 校验 | Zod（前端）、真实 `mihomo -t` 二进制（后端，可选） |

## 本地开发

### 后端

```bash
cd server
cp .env.example .env       # 填写 JWT_SECRET、GitHub OAuth、PostgreSQL DSN
make db-up                 # 启动本地 PostgreSQL（Docker）
make run                   # 启动 API，默认 :8080
```

### 前端

```bash
cp .env.example .env.local # 可选，默认值即可运行
npm install
npm run dev                # Vite 开发服务器，默认 :3000
```

## 构建与测试

```bash
# 前端
npm run test     # Vitest
npm run lint     # ESLint
npm run build    # tsc + vite build

# 后端
cd server
make test        # go test（repository 测试需要 POSTGRESQL_DSN）
make vet         # go vet
```

## 部署

- **Docker Compose**：`docker-compose.yml` 编排 PostgreSQL、Go API、nginx 前端三服务。
- **镜像**：后端使用 `distroless/static` 多阶段构建，可选内置 `mihomo` 二进制
  （`--build-arg MIHOMO_VERSION=v1.19.x`）以启用真实校验。

## API 概览

所有接口以 Bearer Token（JWT）鉴权，公开接口仅 `POST /api/v1/auth/github`、`GET /api/v1/geosite`
以及订阅/分享的短链接。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/me` | 当前登录用户信息 |
| GET/POST/PUT/DELETE | `/api/v1/configs[/:id]` | 客户端配置 CRUD |
| GET/POST/PUT/DELETE | `/api/v1/server-configs[/:id]` | 服务端配置 CRUD |
| GET/POST | `/api/v1/configs/:id/subscriptions` | 订阅链接列表 / 绑定 |
| POST | `/api/v1/subscriptions/:id/rotate` | 轮换订阅（换 token） |
| DELETE | `/api/v1/subscriptions/:id` | 撤销订阅 |
| GET/POST | `/api/v1/server-configs/:id/shares` | 分享链接列表 / 创建 |
| DELETE | `/api/v1/server-config-shares/:id` | 撤销分享 |
| POST | `/api/v1/import/fetch` | 代抓第三方订阅（绕过 CORS） |
| POST | `/api/v1/mihomo/validate` | 真实二进制校验（可选） |
| GET | `/api/v1/mihomo/version` | 查询内置 mihomo 版本 |
| GET | `/api/v1/geosite` | 公开规则集目录（免鉴权） |
| GET | `/healthz` | 存活探针（含数据库状态） |
| GET | `/sub/:token` | 公开订阅接入点 |
| GET | `/share/:token` | 公开分享接入点 |

## License

MIT，见 [LICENSE](LICENSE)。