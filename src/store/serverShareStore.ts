import { create } from 'zustand';
import {
  createServerConfigShare,
  listServerConfigShares,
  revokeServerConfigShare,
} from '../api';
import type { ServerConfigShare, ServerConfigShareType } from '../api';
import { useAuthStore } from './authStore';
import { errorTextFor } from './errorText';
import type { ErrorText } from './errorText';

export type ServerShareStatus = 'idle' | 'loading' | 'ready' | 'error';

// Shares for one server config at a time — the subscription store's shape,
// for the same reasons: one panel open over one config, and nothing persisted,
// because every row carries a live bearer token.
interface ServerShareStore {
  serverConfigId: number | null;
  items: ServerConfigShare[];
  status: ServerShareStatus;
  error: ErrorText | null;

  busyId: number | null;
  creating: boolean;

  load: (serverConfigId: number) => Promise<void>;
  create: (shareType: ServerConfigShareType) => Promise<boolean>;
  revoke: (id: number) => Promise<boolean>;
  close: () => void;
}

export const useServerShareStore = create<ServerShareStore>((set, get) => ({
  serverConfigId: null,
  items: [],
  status: 'idle',
  error: null,
  busyId: null,
  creating: false,

  load: async (serverConfigId) => {
    // Switching configs clears the previous rows first: showing one config's
    // URLs under another config's name, even for a request's duration, is the
    // kind of thing someone copies.
    const switching = get().serverConfigId !== serverConfigId;
    set({
      serverConfigId,
      status: 'loading',
      error: null,
      ...(switching ? { items: [] } : null),
    });

    try {
      const items = await listServerConfigShares(serverConfigId);
      // Discard a response for a config the user has already navigated away
      // from — two loads in flight would otherwise resolve in arrival order.
      if (get().serverConfigId !== serverConfigId) return;
      set({ items, status: 'ready', error: null });
    } catch (error) {
      if (get().serverConfigId !== serverConfigId) return;
      set({ status: 'error', error: errorTextFor(error, 'cloud.error.serverShares') });
    }
  },

  create: async (shareType) => {
    const serverConfigId = get().serverConfigId;
    if (serverConfigId === null) return false;

    set({ creating: true, error: null });
    try {
      const created = await createServerConfigShare(serverConfigId, shareType);
      // Prepended to match the server's created_at DESC ordering.
      set((state) => ({ items: [created, ...state.items], creating: false }));
      return true;
    } catch (error) {
      set({ creating: false, error: errorTextFor(error, 'cloud.error.createServerShare') });
      return false;
    }
  },

  revoke: async (id) => {
    set({ busyId: id, error: null });
    try {
      await revokeServerConfigShare(id);
    } catch (error) {
      set({ busyId: null, error: errorTextFor(error, 'cloud.error.revokeServerShare') });
      return false;
    }

    // The server answers 204 with no body, so the row is marked revoked locally.
    // The list keeps it — see the subscription store for why that matters.
    const revokedAt = new Date().toISOString();
    set((state) => ({
      items: state.items.map((s) => (s.id === id ? { ...s, revoked_at: revokedAt } : s)),
      busyId: null,
    }));
    return true;
  },

  close: () =>
    set({
      serverConfigId: null,
      items: [],
      status: 'idle',
      error: null,
      busyId: null,
      creating: false,
    }),
}));

export function isServerShareActive(share: ServerConfigShare): boolean {
  return !share.revoked_at;
}

// Same reasoning as the cloud store: these rows are one user's credentials.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) useServerShareStore.getState().close();
});
