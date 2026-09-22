import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fetchGeositeList } from '../data/geosite';

// The geosite database changes far less often than a day, and a slightly stale
// list still renders while the refresh runs behind it.
const TTL_MS = 24 * 60 * 60 * 1000;

export type GeositeStatus = 'idle' | 'loading' | 'ready' | 'error';

interface GeositeStore {
  names: string[];
  fetchedAt: number | null;
  status: GeositeStatus;
  error: string | null;

  // Fetch the list unless a fresh copy is already cached. `force` refetches
  // regardless — that is what the retry button calls.
  load: (force?: boolean) => Promise<void>;
}

// One request for the whole app: several geosite fields can be mounted at the
// same time (the DNS panel plus an open rule modal) and they must not each hit
// the API on mount.
let inFlight: Promise<void> | null = null;

export const useGeositeStore = create<GeositeStore>()(
  persist(
    (set, get) => ({
      names: [],
      fetchedAt: null,
      status: 'idle',
      error: null,

      load: async (force = false) => {
        if (inFlight) return inFlight;

        const { names, fetchedAt } = get();
        const isFresh = fetchedAt !== null && Date.now() - fetchedAt < TTL_MS;
        if (!force && names.length > 0 && isFresh) {
          set({ status: 'ready' });
          return;
        }

        set({ status: 'loading', error: null });

        inFlight = fetchGeositeList()
          .then((next) => {
            set({ names: next, fetchedAt: Date.now(), status: 'ready', error: null });
          })
          .catch((err: unknown) => {
            // Deliberately keep whatever was cached: an unreachable service
            // should degrade to a stale picker, not an empty one.
            set({
              status: 'error',
              error: err instanceof Error ? err.message : String(err),
            });
          })
          .finally(() => {
            inFlight = null;
          });

        return inFlight;
      },
    }),
    {
      name: 'mihomo-geosite-cache',
      // Only the fetched payload is worth keeping; status and error describe
      // this session's request, not the data.
      partialize: (state) => ({ names: state.names, fetchedAt: state.fetchedAt }),
    }
  )
);
