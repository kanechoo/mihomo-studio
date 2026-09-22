// The browser's half of the GitHub OAuth flow.
//
// Only two steps happen here: send the user to GitHub, and hand the code GitHub
// redirects back with to our own server. The code→access-token exchange stays on
// the server because it needs the client secret, and a secret shipped to the
// browser is a secret every visitor has.

import { request } from './client';
import type { Session, User } from './types';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

// Public by design — it travels in the redirect URL, visible in the address bar.
// The *secret* is the half that must not be here.
export const GITHUB_CLIENT_ID: string = import.meta.env.VITE_GITHUB_CLIENT_ID || '';

// Where GitHub sends the browser back. This must match the OAuth app's
// "Authorization callback URL" exactly, so it is derived from the origin the app
// is actually being served from rather than hardcoded.
//
// The default is the site root, which is where a finished sign-in belongs: the
// home page lists the configs the user signed in for. App.tsx redirects there
// if the callback lands anywhere else, so pointing this at a deeper path works
// too — but then whatever serves the built files has to answer that path with
// index.html.
export const OAUTH_REDIRECT_URI: string =
  import.meta.env.VITE_OAUTH_REDIRECT_URI ||
  (typeof window === 'undefined' ? '' : `${window.location.origin}/`);

// Sign-in is optional in this app, so the UI has to be able to ask whether it is
// even available before offering it.
export function isGithubLoginConfigured(): boolean {
  return GITHUB_CLIENT_ID !== '';
}

// Where the CSRF state lives between the redirect out and the redirect back.
// sessionStorage, not localStorage: the value is meaningful only to the tab that
// started the flow, and it should not outlive it.
const STATE_KEY = 'mihomo-oauth-state';

// beginGithubLogin sends the browser to GitHub.
//
// The `state` parameter is not decoration. Without it, anyone can hand a victim
// a link to our callback carrying *their own* authorization code; the victim's
// browser redeems it and silently ends up signed into the attacker's account.
// For this app that means the user's next save writes their proxy credentials
// into a stranger's config library. The value is random, stored before we leave,
// and required to match on return.
export function beginGithubLogin(): void {
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    state,
    // No `scope`: GitHub's /user endpoint returns the public profile for a
    // token with no scopes at all, and that is everything the server stores.
    // Asking for more would be asking the user to grant access we never use.
  });

  window.location.assign(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
}

export type OAuthCallback =
  | { kind: 'none' }
  | { kind: 'code'; code: string }
  // GitHub said no, or the user pressed cancel on the consent screen.
  | { kind: 'denied'; description: string }
  | { kind: 'bad-state' };

// readOAuthCallback inspects the current URL for a GitHub redirect and clears
// what it finds.
//
// The URL is rewritten before anything else happens, for three reasons: an
// authorization code is single-use, so a reload would retry a spent one and show
// a failure the user cannot act on; the code should not sit in the address bar
// to be copied into a chat window; and it should not stay in the browser's
// history.
export function readOAuthCallback(): OAuthCallback {
  if (typeof window === 'undefined') return { kind: 'none' };

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (!code && !error) return { kind: 'none' };

  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  clearQueryString();

  if (error) {
    return { kind: 'denied', description: params.get('error_description') || error };
  }

  // Compared as strings and not, say, merely checked for presence: a callback
  // with no state at all, or one carrying somebody else's, both have to fail.
  if (!expected || !state || state !== expected) {
    return { kind: 'bad-state' };
  }

  return { kind: 'code', code: code as string };
}

// exchangeGithubCode redeems the code for a session.
//
// Marked anonymous: this is how a caller stops being anonymous, so sending a
// stale token with it would be meaningless — and a 401 from a rejected code must
// not be read as "the session you already had has expired".
export function exchangeGithubCode(code: string): Promise<Session> {
  return request<Session>('/api/v1/auth/github', {
    method: 'POST',
    body: { code },
    anonymous: true,
  });
}

// fetchMe doubles as the check that a stored token is still good.
export function fetchMe(): Promise<User> {
  return request<User>('/api/v1/me');
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Strips the query string while leaving the path and any fragment alone.
function clearQueryString(): void {
  const { pathname, hash } = window.location;
  window.history.replaceState({}, '', `${pathname}${hash}`);
}
