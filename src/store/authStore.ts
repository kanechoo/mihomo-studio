import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  beginGithubLogin,
  configureApi,
  exchangeGithubCode,
  fetchMe,
  isGithubLoginConfigured,
  readOAuthCallback,
  ApiError,
  ErrorCode,
} from '../api';
import type { User } from '../api';

export const AUTH_STORAGE_KEY = 'mihomo-auth-storage';

export type AuthStatus =
  // No session, and not trying to get one.
  | 'anonymous'
  // A stored token is being checked against /me.
  | 'restoring'
  // An OAuth code is being redeemed. This is the only state the whole app waits
  // on, because it happens on a page load with ?code= in the URL.
  | 'exchanging'
  | 'authenticated';

interface AuthStore {
  token: string | null;
  expiresAt: string | null;
  user: User | null;
  status: AuthStatus;
  error: string | null;

  // Runs once at startup: redeems an OAuth callback if the URL carries one,
  // otherwise revalidates whatever token was persisted.
  bootstrap: () => Promise<void>;
  signIn: () => void;
  signOut: () => void;
  clearError: () => void;
}

// Guards against a second bootstrap. React 18's StrictMode mounts every effect
// twice in development, and an authorization code is single-use — the second
// attempt would redeem a spent code and report a failure over a session that had
// just succeeded.
let bootstrapped: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      user: null,
      status: 'anonymous',
      error: null,

      bootstrap: async () => {
        if (bootstrapped) return bootstrapped;
        bootstrapped = runBootstrap(set, get);
        return bootstrapped;
      },

      signIn: () => {
        if (!isGithubLoginConfigured()) {
          set({ error: 'auth.error.notConfigured' });
          return;
        }
        set({ error: null });
        beginGithubLogin();
      },

      // Tokens are stateless on the server — there is no revocation list — so
      // signing out is exactly this: the client discarding its copy. Anything
      // else would be theatre.
      signOut: () => {
        set({ token: null, expiresAt: null, user: null, status: 'anonymous', error: null });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      version: 1,
      // The token is a bearer credential sitting in localStorage, which means
      // any script that runs on this origin can read it. That is the cost of the
      // server being Bearer-authenticated rather than cookie-authenticated; the
      // alternative — an httpOnly cookie — would need the server to set one and
      // would bring CSRF back in exchange. The mitigations that matter are the
      // ones already in place: a bounded JWT_TTL, and no third-party scripts.
      //
      // `user` is stored alongside so a reload paints the avatar immediately
      // instead of flashing a signed-out header while /me is in flight. It is
      // display-only, and /me overwrites it a moment later.
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
        user: state.user,
      }),
    }
  )
);

type SetState = (partial: Partial<AuthStore>) => void;
type GetState = () => AuthStore;

async function runBootstrap(set: SetState, get: GetState): Promise<void> {
  const callback = readOAuthCallback();

  if (callback.kind === 'denied') {
    set({ status: 'anonymous', error: 'auth.error.denied' });
    return;
  }
  if (callback.kind === 'bad-state') {
    // Either a stale tab finishing a flow this one never started, or a crafted
    // callback carrying somebody else's code. Both are refusals.
    set({ status: 'anonymous', error: 'auth.error.state' });
    return;
  }

  if (callback.kind === 'code') {
    set({ status: 'exchanging', error: null });
    try {
      const session = await exchangeGithubCode(callback.code);
      set({
        token: session.token,
        expiresAt: session.expires_at,
        user: session.user,
        status: 'authenticated',
        error: null,
      });
    } catch (error) {
      set({
        token: null,
        expiresAt: null,
        user: null,
        status: 'anonymous',
        error: messageFor(error, 'auth.error.exchange'),
      });
    }
    return;
  }

  const { token, expiresAt } = get();
  if (!token) {
    set({ status: 'anonymous' });
    return;
  }

  // Checked here rather than left for the server: an expired token produces a
  // 401 that would clear the session anyway, and this way a user who has been
  // away for a week sees a signed-out app instead of one that signs itself out
  // half a second after it loads.
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    set({ token: null, expiresAt: null, user: null, status: 'anonymous' });
    return;
  }

  set({ status: 'restoring' });
  try {
    // /me reads the row rather than trusting the token's contents, so a renamed
    // account or a changed avatar shows up here rather than at the next login.
    const user = await fetchMe();
    set({ user, status: 'authenticated', error: null });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) {
      // Already cleared by the 401 hook below; this only settles the status.
      set({ status: 'anonymous' });
      return;
    }
    // The server is unreachable, or broken. Keeping the token is the right call:
    // it may well still be valid, and discarding it would sign the user out over
    // a restart of the API.
    set({ status: 'anonymous', error: messageFor(error, 'auth.error.unreachable') });
  }
}

// Error messages are i18n keys, not sentences: this store is rendered in two
// languages and the component is what knows which. ApiError messages come from
// the server, which writes in English only, so they are passed through as a
// detail rather than used as the message itself.
function messageFor(error: unknown, fallbackKey: string): string {
  if (error instanceof ApiError && error.isNetworkError) return 'auth.error.unreachable';
  // The sign-in endpoint is rate limited, being one of the two the server
  // answers without a session. Without this branch a refusal would read as
  // "GitHub did not accept that sign-in" — which sends the user to check their
  // OAuth app for a problem that is neither theirs nor GitHub's, and that
  // clears itself in a few seconds.
  if (error instanceof ApiError && error.code === ErrorCode.RateLimited) {
    return 'auth.error.tooFast';
  }
  return fallbackKey;
}

// Wiring the API client to this store, in the one direction that avoids a cycle:
// the client is handed functions, and never imports anything from here.
configureApi({
  token: () => useAuthStore.getState().token,
  // A 401 on a request that carried a token means the token is dead. Dropping it
  // immediately is what keeps the app from showing a signed-in header over an
  // API that refuses every call.
  onUnauthorized: () => {
    const { token, signOut } = useAuthStore.getState();
    if (token) signOut();
  },
});
