import { request } from './client';
import type {
  ServerConfigDetail,
  ServerConfigInput,
  ServerConfigSummary,
} from './types';

// The server-config CRUD surface. One-to-one with the five routes registered
// in router.go under /api/v1/server-configs; see handler/server_config.go for
// the error mapping (404 covers "not yours" as well as "gone").

export async function listServerConfigs(
  signal?: AbortSignal
): Promise<ServerConfigSummary[]> {
  const body = await request<{ server_configs: ServerConfigSummary[] }>(
    '/api/v1/server-configs',
    { signal }
  );
  return body.server_configs;
}

export function getServerConfig(id: number): Promise<ServerConfigDetail> {
  return request<ServerConfigDetail>(`/api/v1/server-configs/${id}`);
}

// POST and PUT take the same body — PUT is a full replace, matching how both
// editors send the document they hold.
export function createServerConfig(input: ServerConfigInput): Promise<ServerConfigDetail> {
  return request<ServerConfigDetail>('/api/v1/server-configs', {
    method: 'POST',
    body: input,
  });
}

export function updateServerConfig(
  id: number,
  input: ServerConfigInput
): Promise<ServerConfigDetail> {
  return request<ServerConfigDetail>(`/api/v1/server-configs/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function deleteServerConfig(id: number): Promise<void> {
  return request<void>(`/api/v1/server-configs/${id}`, { method: 'DELETE' });
}
