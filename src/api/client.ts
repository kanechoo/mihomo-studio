// The one place this app talks to the Go server.
//
// Two things are deliberately inverted here. The client does not import the auth
// store: it is handed a token reader and a sign-out callback at startup
// (`configureApi`). The store depends on the API, so the API depending back on
// the store would be a cycle — one that ES modules technically tolerate and that
// breaks in confusing ways the first time module evaluation order changes.

import type { ApiErrorBody } from './types';

// Where the server is. An explicitly empty VITE_API_BASE_URL means same-origin:
// requests go to relative paths ("/api/...") and ride the reverse proxy in
// front of the app (nginx in the cluster image). Only when the variable is
// entirely unset (plain `vite dev` with no .env) does it fall back to the local
// backend default below, matching server/.env.example's PORT.
const rawApiBaseUrl: string | undefined = import.meta.env.VITE_API_BASE_URL;
export const API_BASE_URL: string = (
  rawApiBaseUrl === undefined ? 'http://localhost:8080' : rawApiBaseUrl
).replace(/\/+$/, '');

// Mirrors response.go. The frontend switches on these rather than on the status
// code, because one status covers several distinct causes.
export const ErrorCode = {
  BadRequest: 'bad_request',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  Conflict: 'conflict',
  // The server refused because the caller is going too fast. Only the two
  // unauthenticated routes are limited, and of those the browser only reaches
  // sign-in — so in practice this means somebody is retrying a failed login.
  // It carries a Retry-After header, which is why the message says how long.
  RateLimited: 'rate_limited',
  Internal: 'internal_error',
  Unavailable: 'unavailable',
  // Not from the server: the request never arrived. Its own code so the UI can
  // say "cannot reach the server" instead of showing a raw TypeError, which is
  // what fetch throws for a DNS failure, a refused connection, and a CORS
  // rejection alike.
  Network: 'network_error',
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  get isNetworkError(): boolean {
    return this.code === ErrorCode.Network;
  }

  // True when the server refused the caller's session rather than the request.
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

type TokenReader = () => string | null;

let readToken: TokenReader = () => null;
let handleUnauthorized: () => void = () => {};

// Called once at startup by the auth store.
export function configureApi(options: {
  token: TokenReader;
  onUnauthorized: () => void;
}): void {
  readToken = options.token;
  handleUnauthorized = options.onUnauthorized;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  // Set for the login endpoint, which is the one call that must not carry a
  // token — it is how a caller stops being anonymous.
  anonymous?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = anonymous ? null : readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // An aborted request is the caller's own doing — a component unmounting, a
    // superseded search — and must not be reported as the server being down.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      ErrorCode.Network,
      error instanceof Error ? error.message : String(error)
    );
  }

  if (!response.ok) {
    const apiError = await toApiError(response);
    // A 401 on a request that carried a token means the token is no longer
    // good: expired, or signed with a secret that has since been rotated. The
    // session is dead and the app should stop pretending otherwise.
    //
    // The `token` guard matters: POST /auth/github also answers 401, for a
    // rejected OAuth code, and signing out in response to a *failed sign-in*
    // would clear a session that may still be perfectly valid.
    if (token && apiError.status === 401) handleUnauthorized();
    throw apiError;
  }

  // 204, and any 200 with an empty body. Callers that expect nothing declare
  // Promise<void>; the cast keeps that from needing a special-case signature.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (text === '') return undefined as T;

  return JSON.parse(text) as T;
}

// toApiError reads the server's error envelope, and copes with responses that
// are not it: a reverse proxy's HTML 502, or a gateway timeout, arrive here too
// and must not turn into "Unexpected token < in JSON".
async function toApiError(response: Response): Promise<ApiError> {
  const requestIdHeader = response.headers.get('X-Request-ID') || undefined;

  let text = '';
  try {
    text = await response.text();
  } catch {
    // Body already consumed or the connection dropped mid-read. The status is
    // still worth reporting.
  }

  try {
    const body = JSON.parse(text) as ApiErrorBody;
    if (body?.error?.message) {
      return new ApiError(
        response.status,
        body.error.code || ErrorCode.Internal,
        body.error.message,
        body.error.request_id || requestIdHeader
      );
    }
  } catch {
    // Not the envelope. Fall through.
  }

  return new ApiError(
    response.status,
    ErrorCode.Internal,
    `${response.status} ${response.statusText || 'request failed'}`,
    requestIdHeader
  );
}
