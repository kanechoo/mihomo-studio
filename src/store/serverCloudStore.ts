import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createServerConfig,
  deleteServerConfig,
  getServerConfig,
  updateServerConfig,
} from '../api';
import type { ServerConfigInput, ServerConfigSummary } from '../api';
import type { ServerProblem } from '../core/server/validation/problems';
import { validateServerConfig } from '../core/server/validation';
import type { ServerConfigIR } from '../core/server/types';
import { computeServerRenderedArtifacts } from '../core/server/share/artifacts';
import { useServerStore } from './serverStore';
import { useAuthStore } from './authStore';
import { errorTextFor } from './errorText';
import type { ErrorText } from './errorText';

// The server editor's cloud-link store — the counterpart of cloudStore, kept
// deliberately smaller. One document per tab (the server editor has no draft
// slots yet) and no list cache (the homepage fetches its own).

export interface ServerSaveBlock {
  problems: ServerProblem[];
}

interface ServerCloudStore {
  // Which saved config this tab's document came from. Null = local-only.
  currentId: number | null;
  currentName: string;
  currentDescription: string;
  syncedAt: number | null;
  dirty: boolean;

  saving: boolean;
  saveError: ErrorText | null;

  open: (id: number) => Promise<boolean>;
  saveAs: (name: string, description?: string) => Promise<number | null>;
  save: () => Promise<boolean>;
  setDetails: (name: string, description: string) => void;
  remove: (id: number) => Promise<boolean>;
  clearDocument: () => void;
  clearErrors: () => void;
  reset: () => void;
}

function buildInput(name: string, description: string): ServerConfigInput {
  const ir: ServerConfigIR = useServerStore.getState().config;
  return {
    name,
    description,
    ir,
    ir_version: '1.0.0',
    // Rendered in the browser by the same exporter/converters the preview
    // uses, stored server-side, and served verbatim through /share/:token —
    // the client editor's rendered_mihomo/rendered_singbox arrangement. A
    // save that skipped them would leave every share link serving a stale
    // document, so they travel with every write, not only on export.
    ...computeServerRenderedArtifacts(ir),
  };
}

// A saved config should be one mihomo can at least start on. Errors block the
// save exactly as the client editor's blockingProblems does; warnings travel.
function blockingProblems(): ServerProblem[] {
  return validateServerConfig(useServerStore.getState().config).filter(
    (p) => p.severity === 'error'
  );
}

export const useServerCloudStore = create<ServerCloudStore>()(
  persist(
    (set, get) => ({
      currentId: null,
      currentName: '',
      currentDescription: '',
      syncedAt: null,
      dirty: false,

      saving: false,
      saveError: null,

      open: async (id) => {
        try {
          const detail = await getServerConfig(id);
          useServerStore.getState().importServerConfig(detail.ir);
          // After the import write, which trips the dirty subscription below.
          set({
            currentId: detail.id,
            currentName: detail.name,
            currentDescription: detail.description ?? '',
            syncedAt: Date.now(),
            dirty: false,
          });
          return true;
        } catch (error: unknown) {
          set({ saveError: errorTextFor(error, 'server.cloud.error.open') });
          return false;
        }
      },

      saveAs: async (name, description) => {
        if (blockingProblems().length > 0) {
          set({ saveError: { key: 'server.cloud.error.invalid' } });
          return null;
        }
        set({ saving: true, saveError: null });
        try {
          const detail = await createServerConfig(buildInput(name, description ?? ''));
          set({
            currentId: detail.id,
            currentName: detail.name,
            currentDescription: detail.description ?? '',
            syncedAt: Date.now(),
            dirty: false,
          });
          return detail.id;
        } catch (error: unknown) {
          set({ saveError: errorTextFor(error, 'server.cloud.error.save') });
          return null;
        } finally {
          set({ saving: false });
        }
      },

      save: async () => {
        const { currentId } = get();
        if (currentId === null) {
          set({ saveError: { key: 'cloud.error.noTarget' } });
          return false;
        }
        if (blockingProblems().length > 0) {
          set({ saveError: { key: 'server.cloud.error.invalid' } });
          return false;
        }
        set({ saving: true, saveError: null });
        try {
          const input = buildInput(get().currentName, get().currentDescription);
          const detail = await updateServerConfig(currentId, input);
          set({
            currentName: detail.name,
            currentDescription: detail.description ?? '',
            syncedAt: Date.now(),
            dirty: false,
          });
          return true;
        } catch (error: unknown) {
          set({ saveError: errorTextFor(error, 'server.cloud.error.save') });
          return false;
        } finally {
          set({ saving: false });
        }
      },

      // Local-only until the next save reaches the server, mirroring the client
      // rename flow: the dialog defers, Save publishes.
      setDetails: (name, description) =>
        set((state) => ({
          currentName: name,
          currentDescription: description,
          dirty: state.currentId !== null ? true : state.dirty,
        })),

      remove: async (id) => {
        try {
          await deleteServerConfig(id);
          set((state) =>
            state.currentId === id
              ? { currentId: null, syncedAt: null }
              : {}
          );
          return true;
        } catch (error: unknown) {
          set({ saveError: errorTextFor(error, 'server.cloud.error.delete') });
          return false;
        }
      },

      clearDocument: () =>
        set({
          currentId: null,
          currentName: '',
          currentDescription: '',
          syncedAt: null,
          dirty: false,
        }),

      clearErrors: () => set({ saveError: null }),

      reset: () =>
        set({
          currentId: null,
          currentName: '',
          currentDescription: '',
          syncedAt: null,
          dirty: false,
          saving: false,
          saveError: null,
        }),
    }),
    {
      name: 'mihomo-server-cloud-meta',
      version: 1,
      // Identity metadata only; the document itself lives in the serverStore
      // draft under its own key.
      partialize: (state) => ({
        currentId: state.currentId,
        currentName: state.currentName,
        currentDescription: state.currentDescription,
        syncedAt: state.syncedAt,
        dirty: state.dirty,
      }),
    }
  )
);

// Any edit marks the linked document unsaved. A subscription, not a callback in
// every action, so a new action cannot forget it.
useServerStore.subscribe(() => {
  const { currentId, dirty } = useServerCloudStore.getState();
  if (currentId !== null && !dirty) useServerCloudStore.setState({ dirty: true });
});

// Signing out unlinks the session's documents for the same reason as on
// cloudStore: `currentId` must never point the next user's saves at a row they
// do not own.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) useServerCloudStore.getState().reset();
});

export type { ServerConfigSummary };
