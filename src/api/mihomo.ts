// Real-binary validation against the Go backend's mihomo runtime.
//
// The endpoint is optional infrastructure: a deployment without a mihomo
// binary answers 503 `unavailable`, and this module turns that into a typed
// result the UI can degrade on — showing local-only validation instead of an
// error that would suggest something is broken.

import { API_BASE_URL } from './client';

export interface MihomoDiagnostic {
  line?: number;
  section?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidateResult {
  valid: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  diagnostics: MihomoDiagnostic[];
}

export type ValidateOutcome =
  | { kind: 'ok'; result: ValidateResult }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'error'; message: string };

function authHeaders(): HeadersInit {
  // Same persisted key the auth store uses — read directly rather than
  // importing the store, for the same no-cycle reason client.ts documents.
  let token: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('mihomo-auth-storage');
      if (raw) {
        token = (JSON.parse(raw) as { state?: { token?: string } }).state?.token ?? null;
      }
    } catch {
      token = null;
    }
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Duration shown on the validate badge, in seconds with one decimal
// (e.g. 1250ms -> "1.3s"). Math.round halves up, matching 四舍五入, and
// toFixed keeps the trailing zero so the badge width stays stable.
export function formatDurationSeconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toFixed(1);
}

export async function validateWithMihomo(config: string): Promise<ValidateOutcome> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/mihomo/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ config }),
    });
  } catch {
    return {
      kind: 'unavailable',
      reason: 'network',
    };
  }

  if (response.ok) {
    const result = (await response.json()) as ValidateResult;
    // The Go backend serializes empty slices as `null` on older builds;
    // restore the array invariant at this single choke point so every
    // consumer can safely call .slice/.length on diagnostics.
    result.diagnostics ??= [];
    result.stdout ??= '';
    result.stderr ??= '';
    return { kind: 'ok', result };
  }

  let code: string | undefined;
  let message = `${response.status}`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code;
    message = body.error?.message ?? message;
  } catch {
    // non-JSON failure body; fall through with status text
  }

  if (code === 'unavailable') {
    return { kind: 'unavailable', reason: message };
  }
  if (code === 'unauthorized') {
    return { kind: 'error', message: 'sign-in required' };
  }
  if (code === 'rate_limited') {
    return { kind: 'error', message: message || 'rate limited' };
  }
  return { kind: 'error', message };
}

export async function fetchMihomoVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/mihomo/version`, {
      headers: authHeaders(),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}
