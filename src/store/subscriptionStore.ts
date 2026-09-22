import { create } from 'zustand';
import {
  bindSubscription,
  listSubscriptions,
  revokeSubscription,
  rotateSubscription,
} from '../api';
import type { Subscription, SubscriptionFormat } from '../api';
import { useAuthStore } from './authStore';
import { errorTextFor } from './errorText';
import type { ErrorText } from './errorText';

export type SubscriptionStatus = 'idle' | 'loading' | 'ready' | 'error';

// Subscriptions for one config at a time — which is how they are looked at, one
// panel open over one config.
//
// Nothing here is persisted, deliberately. Every row carries a live bearer
// token: writing them to localStorage would put a full set of working
// subscription URLs somewhere any script on this origin can read them, in
// exchange for saving a request that takes milliseconds.
interface SubscriptionStore {
  configId: number | null;
  items: Subscription[];
  status: SubscriptionStatus;
  error: ErrorText | null;

  // The row with an action in flight, so one spinner appears on the button that
  // was pressed rather than across the whole list.
  busyId: number | null;
  binding: boolean;

  load: (configId: number) => Promise<void>;
  bind: (format: SubscriptionFormat, label: string) => Promise<boolean>;
  rotate: (id: number) => Promise<boolean>;
  revoke: (id: number) => Promise<boolean>;
  close: () => void;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  configId: null,
  items: [],
  status: 'idle',
  error: null,
  busyId: null,
  binding: false,

  load: async (configId) => {
    // Switching configs clears the previous rows first: showing one config's
    // URLs under another config's name, even for the moment a request takes, is
    // the kind of thing someone copies.
    const switching = get().configId !== configId;
    set({
      configId,
      status: 'loading',
      error: null,
      ...(switching ? { items: [] } : null),
    });

    try {
      const items = await listSubscriptions(configId);
      // Discard a response for a config the user has already navigated away
      // from — two loads in flight would otherwise resolve in arrival order.
      if (get().configId !== configId) return;
      set({ items, status: 'ready', error: null });
    } catch (error) {
      if (get().configId !== configId) return;
      set({ status: 'error', error: errorTextFor(error, 'cloud.error.subscriptions') });
    }
  },

  bind: async (format, label) => {
    const configId = get().configId;
    if (configId === null) return false;

    set({ binding: true, error: null });
    try {
      const created = await bindSubscription(configId, { format, label });
      // Prepended rather than appended: the server orders this list by
      // created_at descending, and a new row appearing at the bottom would jump
      // to the top on the next load.
      set((state) => ({ items: [created, ...state.items], binding: false }));
      return true;
    } catch (error) {
      set({ binding: false, error: errorTextFor(error, 'cloud.error.bind') });
      return false;
    }
  },

  rotate: async (id) => {
    set({ busyId: id, error: null });
    try {
      const rotated = await rotateSubscription(id);
      set((state) => ({
        items: state.items.map((s) => (s.id === id ? rotated : s)),
        busyId: null,
      }));
      return true;
    } catch (error) {
      set({ busyId: null, error: errorTextFor(error, 'cloud.error.rotate') });
      return false;
    }
  },

  revoke: async (id) => {
    set({ busyId: id, error: null });
    try {
      await revokeSubscription(id);
    } catch (error) {
      set({ busyId: null, error: errorTextFor(error, 'cloud.error.revoke') });
      return false;
    }

    // The server answers 204 with no body, so the row is marked revoked locally
    // rather than re-fetched. The list keeps it: a revoked subscription staying
    // visible is what answers "I turned that one off last week", and a row that
    // vanished would leave the user wondering whether the URL is really dead.
    const revokedAt = new Date().toISOString();
    set((state) => ({
      items: state.items.map((s) => (s.id === id ? { ...s, revoked_at: revokedAt } : s)),
      busyId: null,
    }));
    return true;
  },

  close: () =>
    set({ configId: null, items: [], status: 'idle', error: null, busyId: null, binding: false }),
}));

export function isActive(subscription: Subscription): boolean {
  return !subscription.revoked_at;
}

// Same reasoning as the cloud store: these rows are one user's credentials.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) useSubscriptionStore.getState().close();
});
