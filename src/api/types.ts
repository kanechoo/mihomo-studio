// TypeScript mirrors of the JSON the Go server returns.
//
// These are hand-written rather than generated, so the rule is: every field here
// exists because a `json:"..."` tag in server/internal/model or
// server/internal/service says it does. Fields the server marks `omitempty` are
// optional here; fields it marks `json:"-"` are absent entirely — notably the
// two rendered artifacts, which are large and only ever leave the server through
// /sub/:token.

import type { MihomoIR } from '../core/ir';
import type { ServerConfigIR } from '../core/server/types';

export interface User {
  id: number;
  github_id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  token: string;
  expires_at: string;
  user: User;
}

// What GET /api/v1/configs returns: no IR, no artifacts. A config with several
// hundred proxies is a large document that the list view never displays.
export interface ConfigSummary {
  id: number;
  name: string;
  description?: string;
  ir_version: string;
  // Null until the config has been saved with at least one rendered artifact.
  // The subscription panel keys off this: a config that has never been exported
  // has nothing for /sub/:token to serve.
  rendered_at?: string;
  created_at: string;
  updated_at: string;
}

// What GET /api/v1/configs/:id returns: the same fields plus the IR itself.
export interface ConfigDetail extends ConfigSummary {
  user_id: number;
  ir: MihomoIR;
}

// The body POST and PUT both take. `ir` is required; the rest are optional to
// the server, but see the note in api/configs.ts about why this client always
// sends both rendered artifacts.
export interface ConfigInput {
  name: string;
  description: string;
  ir: MihomoIR;
  ir_version: string;
  rendered_mihomo: string;
  rendered_singbox: string;
}

// ============= Server configs =============
//
// Mirrors model.ServerConfig / ServerConfigSummary in
// server/internal/model/server_config.go. Like a client config, a saved server
// config carries rendered YAML artifacts produced in the browser and stored
// verbatim — they are what /share/:token serves.

export interface ServerConfigSummary {
  id: number;
  name: string;
  description?: string;
  ir_version: string;
  // Null until the config has been saved with at least one rendered artifact.
  // The share panel keys off this, exactly as the subscription panel does.
  rendered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ServerConfigDetail extends ServerConfigSummary {
  user_id: number;
  ir: ServerConfigIR;
}

export interface ServerConfigInput {
  name: string;
  description: string;
  ir: ServerConfigIR;
  ir_version: string;
  // Rendered by computeServerRenderedArtifacts (src/core/server/share/) at
  // save time. They must travel with every write: a save without them would
  // leave share links serving a stale document.
  rendered_server_yaml: string;
  rendered_client_proxies: string;
}

export type SubscriptionFormat = 'mihomo' | 'singbox';

// service.SubscriptionView: the row plus the URL the server assembled from
// PUBLIC_BASE_URL. The URL is never built in the browser — window.location is
// right in development and wrong the moment the API moves to its own hostname,
// and that failure lands on the user's phone rather than on this screen.
export interface Subscription {
  id: number;
  config_id: number;
  user_id: number;
  token: string;
  format: SubscriptionFormat;
  label?: string;
  revoked_at?: string;
  last_access_at?: string;
  access_count: number;
  last_user_agent?: string;
  created_at: string;
  updated_at: string;
  url: string;
}

export interface SubscriptionInput {
  format: SubscriptionFormat;
  label: string;
}

// ============= Server config shares =============
//
// Mirrors model.ServerConfigShare / service.ServerConfigShareView in
// server/internal/model/server_config_share.go. A share is a reference to the
// live resource — the token resolves to whatever the referenced server config
// contains at visit time, never a snapshot.

export type ServerConfigShareType =
  // The config's own mihomo document (listeners, outbounds, dns, rules).
  | 'full_server_yaml'
  // Every convertible listener aggregated into one client `proxies:` fragment.
  | 'server_to_client_proxies';

export interface ServerConfigShare {
  id: number;
  server_config_id: number;
  user_id: number;
  token: string;
  share_type: ServerConfigShareType;
  revoked_at?: string;
  created_at: string;
  updated_at: string;
  url: string;
}

// response.ErrorBody. The frontend switches on `code` rather than on the status,
// because one status covers several causes — see the note in response.go.
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id?: string;
  };
}
