import { request } from './client';

// What GET /api/v1/geosite returns: the whole geosite tag catalogue, curated
// category bundles already sorted ahead of individual sites by the server.
export interface GeositeListResponse {
  names: string[];
  total: number;
}

// Public reference data — no token required, the server rate-limits it instead.
export function getGeositeList(signal?: AbortSignal): Promise<GeositeListResponse> {
  return request<GeositeListResponse>('/api/v1/geosite', { signal });
}
