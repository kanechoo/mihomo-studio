import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createConfig,
  deleteConfig,
  getConfig,
  listConfigs,
  updateConfig,
} from '../api';
import type { ConfigInput, ConfigSummary } from '../api';
import { renderAllFormats } from '../core/exporters';
import { validateIR } from '../core/ir';
import { metaKeyFor, newDocumentSlot } from './draftKeys';
import { useIRStore } from './irStore';
import { useAuthStore } from './authStore';
import { errorTextFor } from './errorText';
import type { ErrorText } from './errorText';

export type ListStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CloudStore {
  configs: ConfigSummary[];
  listStatus: ListStatus;
  listError: ErrorText | null;

  // Which saved config the editor's document came from, if any. Null means the
  // document is local-only — which is the normal state for someone who has
  // never signed in, and this app stays fully usable that way.
  currentId: number | null;
  currentName: string;
  currentDescription: string;
  // Set on open and on save. Together with `dirty` this is what lets the header
  // say "saved" rather than making the user guess.
  syncedAt: number | null;
  dirty: boolean;
  // When a tab last opened or saved this document. Only the draft sweep reads
  // it: an unsaved new document whose tab is long gone is told apart from one
  // somebody is still working on by nothing else.
  touchedAt: number | null;

  saving: boolean;
  saveError: ErrorText | null;

  refresh: () => Promise<void>;
  open: (id: number) => Promise<boolean>;
  // Saves the document as a new cloud config and hands back its id, or null if
  // nothing was saved.
  //
  // The id rather than a bare success flag, because what the caller does next is
  // point this tab at /editor/{id} — and reading `currentId` back out of the
  // store to find it is a different question, one that anything running between
  // the save and the read is free to have answered differently.
  saveAs: (name: string, description?: string) => Promise<number | null>;
  save: () => Promise<boolean>;
  // Renames the open config and rewrites its description. Local: the change
  // reaches the server with the next save.
  setDetails: (name: string, description: string) => void;
  remove: (id: number) => Promise<boolean>;
  // Empties everything that describes the open document — the link to a saved
  // config, the name, the description, the save state. What a tab does when it
  // takes a fresh document. The config list is left alone: it belongs to the
  // account, not to the document.
  clearDocument: () => void;
  // Stamps the document as being worked on right now. Called when a tab takes a
  // slot, which is what keeps that slot out of the draft sweep.
  touch: () => void;
  clearErrors: () => void;
  reset: () => void;
}

// One list request at a time. Several components ask for the list on mount — the
// config modal and the account menu's badge — and they must not each issue one.
let listInFlight: Promise<void> | null = null;

export const useCloudStore = create<CloudStore>()(
  persist(
    (set, get) => ({
      configs: [],
      listStatus: 'idle',
      listError: null,

      currentId: null,
      currentName: '',
      currentDescription: '',
      syncedAt: null,
      dirty: false,
      touchedAt: null,

      saving: false,
      saveError: null,

      refresh: async () => {
        if (listInFlight) return listInFlight;

        set({ listStatus: 'loading', listError: null });
        listInFlight = listConfigs()
          .then((configs) => {
            set({ configs, listStatus: 'ready', listError: null });
          })
          .catch((error: unknown) => {
            // The previous list is deliberately kept: a momentary API restart
            // should degrade to a stale list, not an empty one that reads as
            // "you have no configs".
            set({ listStatus: 'error', listError: errorTextFor(error, 'cloud.error.list') });
          })
          .finally(() => {
            listInFlight = null;
          });

        return listInFlight;
      },

      // open replaces the editor's document. The caller is responsible for
      // asking first when `dirty` is set — this store will not second-guess a
      // decision the user has already made in a dialog.
      open: async (id) => {
        set({ listError: null });
        try {
          const detail = await getConfig(id);
          useIRStore.getState().importIR(detail.ir);
          // After importIR, because that write trips the dirty subscription at
          // the bottom of this file.
          set({
            currentId: detail.id,
            currentName: detail.name,
            currentDescription: detail.description ?? '',
            syncedAt: Date.now(),
            dirty: false,
            touchedAt: Date.now(),
          });
          return true;
        } catch (error) {
          set({ listError: errorTextFor(error, 'cloud.error.open') });
          return false;
        }
      },

      saveAs: async (name, description = '') => {
        const invalid = blockingProblems();
        if (invalid) {
          set({ saveError: invalid });
          return null;
        }

        const input = buildInput(name, description);
        if (!input) {
          set({ saveError: { key: 'cloud.error.render' } });
          return null;
        }

        set({ saving: true, saveError: null });
        try {
          const saved = await createConfig(input);
          set({
            currentId: saved.id,
            currentName: saved.name,
            currentDescription: saved.description ?? '',
            syncedAt: Date.now(),
            dirty: false,
            touchedAt: Date.now(),
            saving: false,
          });
          void get().refresh();
          return saved.id;
        } catch (error) {
          set({ saving: false, saveError: errorTextFor(error, 'cloud.error.save') });
          return null;
        }
      },

      save: async () => {
        const { currentId, currentName, currentDescription } = get();
        if (currentId === null) {
          // Nothing to update. The UI routes this to the "save as" dialog rather
          // than calling here, so reaching this line means a button was wired
          // wrong — say so instead of silently creating a second copy.
          set({ saveError: { key: 'cloud.error.noTarget' } });
          return false;
        }

        const invalid = blockingProblems();
        if (invalid) {
          set({ saveError: invalid });
          return false;
        }

        const input = buildInput(currentName, currentDescription);
        if (!input) {
          set({ saveError: { key: 'cloud.error.render' } });
          return false;
        }
        set({ saving: true, saveError: null });
        try {
          const saved = await updateConfig(currentId, input);
          set({
            currentName: saved.name,
            currentDescription: saved.description ?? '',
            syncedAt: Date.now(),
            dirty: false,
            touchedAt: Date.now(),
            saving: false,
          });
          void get().refresh();
          return true;
        } catch (error) {
          set({ saving: false, saveError: errorTextFor(error, 'cloud.error.save') });
          return false;
        }
      },

      // setDetails changes the config's name and description without sending
      // anything.
      //
      // PUT replaces the whole config, so pushing a new name on its own would
      // mean either a second endpoint or saving whatever half-finished edits
      // happen to be open. Marking the document unsaved instead keeps one press
      // of Save meaning one write, carrying the new name and the document
      // together.
      setDetails: (name, description) => {
        const { currentId, currentName, currentDescription } = get();
        // Nothing to rename: an unsaved document is named by the dialog that
        // first saves it, which already asks.
        if (currentId === null) return;

        const nextName = name.trim();
        const nextDescription = description.trim();
        if (nextName === '') return;
        // Opening the dialog and closing it again is not an edit, and must not
        // leave the header claiming there is something to save.
        if (nextName === currentName && nextDescription === currentDescription) return;

        set({ currentName: nextName, currentDescription: nextDescription, dirty: true });
      },

      remove: async (id) => {
        try {
          await deleteConfig(id);
        } catch (error) {
          set({ listError: errorTextFor(error, 'cloud.error.delete') });
          return false;
        }

        set((state) => ({
          configs: state.configs.filter((c) => c.id !== id),
          // The editor keeps the document — the user may well want to save it
          // again under a new name — but it is no longer linked to anything, so
          // the next save must create rather than update.
          ...(state.currentId === id
            ? { currentId: null, syncedAt: null, dirty: false }
            : null),
        }));
        return true;
      },

      clearDocument: () =>
        set({
          currentId: null,
          currentName: '',
          currentDescription: '',
          syncedAt: null,
          dirty: false,
          touchedAt: Date.now(),
        }),

      touch: () => set({ touchedAt: Date.now() }),

      clearErrors: () => set({ listError: null, saveError: null }),

      reset: () =>
        set({
          configs: [],
          listStatus: 'idle',
          listError: null,
          currentId: null,
          currentName: '',
          currentDescription: '',
          syncedAt: null,
          dirty: false,
          touchedAt: null,
          saving: false,
          saveError: null,
        }),
    }),
    {
      name: metaKeyFor(newDocumentSlot()),
      version: 1,
      // What the editor knows about the open document travels with the document
      // itself, in that document's own draft slot. Without it, a tab reloading
      // onto its unsaved work would have the config's contents and no idea what
      // it was called, which config it updates, or that it was unsaved at all.
      //
      // Hydrated on demand for the same reason the document is: which slot this
      // tab reads is a question only its address bar can answer. See
      // `drafts.ts`.
      skipHydration: true,
      // The list is not persisted: it belongs to the server, it is one request
      // away, and a stale copy shown to a user who has since deleted something
      // is worse than a spinner.
      partialize: (state) => ({
        currentId: state.currentId,
        currentName: state.currentName,
        currentDescription: state.currentDescription,
        syncedAt: state.syncedAt,
        dirty: state.dirty,
        touchedAt: state.touchedAt,
      }),
    }
  )
);

// buildInput renders both artifacts and assembles the save body.
//
// Returns null when the exporters throw. That should not happen — they run on
// every keystroke to fill the preview pane — but "the config could not be
// rendered" is a far better failure than posting an empty string, which the
// server would accept and which would leave every subscription on this config
// serving nothing.
// What a save has to clear before it is allowed to leave the editor.
//
// A saved config is not a draft. It is handed to `/sub/{token}`, fetched by a
// client that will either run it or fail to, with nobody watching and no editor
// open to explain why. The editor already knows which references do not
// resolve — publishing anyway would be choosing to find out later, somewhere
// less convenient.
//
// Null when there is nothing wrong, so the caller reads as a guard.
function blockingProblems(): ErrorText | null {
  const problems = validateIR(useIRStore.getState().ir);
  if (problems.length === 0) return null;
  return { key: 'cloud.error.invalid', problems };
}

function buildInput(name: string, description: string): ConfigInput | null {
  const ir = useIRStore.getState().ir;
  try {
    const rendered = renderAllFormats(ir);
    return {
      name,
      description,
      ir,
      ir_version: ir.version || '1.0.0',
      rendered_mihomo: rendered.mihomo,
      rendered_singbox: rendered.singbox,
    };
  } catch {
    return null;
  }
}

// Any edit to the document marks it unsaved. Subscribing here rather than
// threading a callback through every irStore action means a new action cannot
// forget to do it.
useIRStore.subscribe(() => {
  const { currentId, dirty } = useCloudStore.getState();
  if (currentId !== null && !dirty) useCloudStore.setState({ dirty: true });
});

// Signing out clears everything that belonged to the session. The list is
// another user's data; `currentId` would point the next user's saves at a row
// they do not own, which the server would reject with a 404 they could not
// explain.
useAuthStore.subscribe((state, previous) => {
  if (previous.token && !state.token) useCloudStore.getState().reset();
});
