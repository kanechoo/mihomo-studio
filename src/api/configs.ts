// The config endpoints. Every one of these is user-scoped on the server: the
// owner comes from the JWT, never from anything sent here, which is why none of
// these functions takes a user id.

import { request } from './client';
import type { ConfigDetail, ConfigInput, ConfigSummary } from './types';

export function listConfigs(signal?: AbortSignal): Promise<ConfigSummary[]> {
  // Wrapped in an object on the wire so a total or a cursor can be added later
  // without changing the shape every client parses. Unwrapped here so callers
  // deal in an array.
  return request<{ configs: ConfigSummary[] }>('/api/v1/configs', { signal }).then(
    (body) => body.configs ?? []
  );
}

export function getConfig(id: number, signal?: AbortSignal): Promise<ConfigDetail> {
  return request<ConfigDetail>(`/api/v1/configs/${id}`, { signal });
}

// createConfig and updateConfig take the same body, and `input` is always
// complete.
//
// PUT is a replace, not a merge — the editor holds the whole document, so an
// omitted description means the user cleared it. The sharp edge is that the same
// rule applies to the rendered artifacts: a save that omits `rendered_singbox`
// drops the stored one, and any subscription serving that format immediately has
// nothing to return. So callers render *both* formats on every save regardless
// of which one the editor is currently previewing.
export function createConfig(input: ConfigInput): Promise<ConfigDetail> {
  return request<ConfigDetail>('/api/v1/configs', { method: 'POST', body: input });
}

export function updateConfig(id: number, input: ConfigInput): Promise<ConfigDetail> {
  return request<ConfigDetail>(`/api/v1/configs/${id}`, { method: 'PUT', body: input });
}

// Soft on the server: the row is kept and the name is freed for reuse. Every
// subscription pointing at it stops serving.
export function deleteConfig(id: number): Promise<void> {
  return request<void>(`/api/v1/configs/${id}`, { method: 'DELETE' });
}
