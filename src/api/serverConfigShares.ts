// The authenticated server-config share endpoints.
//
// Same layout as subscriptions: create and list hang off the config they
// serve, revoke addresses the share directly. The public member of this
// family — GET /share/:token, raw YAML, no session — is deliberately absent
// here: it is consumed by whoever opens a share URL, never by this app.

import { request } from './client';
import type { ServerConfigShare, ServerConfigShareType } from './types';

// Includes revoked shares, for the same reason subscriptions do: a revoked row
// staying visible is what answers "did I already turn that link off".
export function listServerConfigShares(
  serverConfigId: number,
  signal?: AbortSignal
): Promise<ServerConfigShare[]> {
  return request<{ shares: ServerConfigShare[] }>(
    `/api/v1/server-configs/${serverConfigId}/shares`,
    { signal }
  ).then((body) => body.shares ?? []);
}

export function createServerConfigShare(
  serverConfigId: number,
  share_type: ServerConfigShareType
): Promise<ServerConfigShare> {
  return request<ServerConfigShare>(`/api/v1/server-configs/${serverConfigId}/shares`, {
    method: 'POST',
    body: { share_type },
  });
}

// Idempotent on the server: revoking twice is a 204, not an error.
export function revokeServerConfigShare(id: number): Promise<void> {
  return request<void>(`/api/v1/server-config-shares/${id}`, { method: 'DELETE' });
}
