// Which document a tab is holding, and where it keeps it.
//
// The address bar names a document; this is what turns that name into a place
// in storage and loads what is there. Both persisted stores are pointed at the
// same slot together, because they describe one document between them: the
// config in `irStore`, and what is known about it — its name, whether it has
// been saved — in `cloudStore`.
//
// This file imports the stores, which is why the key arithmetic lives in
// `draftKeys.ts` instead. The stores need the keys; they must not need this.

import { useAuthStore } from './authStore';
import { useCloudStore } from './cloudStore';
import { useIRStore } from './irStore';
import {
  adoptLegacyDraft,
  clearConfigDrafts,
  dropSlot,
  inspectSlot,
  irKeyFor,
  metaKeyFor,
  newDocumentSlot,
  pruneDrafts,
  slotFor,
} from './draftKeys';
import type { DraftSlot } from './draftKeys';

// What a tab found in the slot it just took.
export type SlotOutcome =
  // Unsaved work was waiting there, and it is the open document now. Nothing
  // was fetched: the copy on the server is the older one.
  | 'restored'
  // Nothing worth keeping. The stores hold a fresh document, and a tab on a
  // saved config still has to go and get it.
  | 'empty';

// Which slot this tab is currently writing to.
let heldSlot: DraftSlot | null = null;

function pointAt(slot: DraftSlot): void {
  useIRStore.persist.setOptions({ name: irKeyFor(slot) });
  useCloudStore.persist.setOptions({ name: metaKeyFor(slot) });
  heldSlot = slot;
}

// Takes the slot belonging to a config — or, for null, to this tab's own
// unsaved document — and loads whatever is worth loading from it.
//
// The stores are left holding either that draft or an empty document, never the
// last document this tab had open. That matters on the new-config route above
// all: arriving there with somebody's saved config still in memory is how a
// first save forks work that was already saved somewhere else.
export function takeSlot(configId: number | null): SlotOutcome {
  const record = inspectSlot(configId);
  pointAt(record.slot);

  if (!record.unsaved) {
    // Writes from here land in the slot just taken, which is why the reset
    // comes after pointing at it and never before: it would otherwise empty
    // the drawer this tab is walking away from.
    useIRStore.getState().resetIR();
    useCloudStore.getState().clearDocument();
    return 'empty';
  }

  // The document first, what is known about it second. Rehydrating the config
  // trips the edit subscription in `cloudStore`, and the stored record — not
  // that subscription — is the authority on whether this document has unsaved
  // changes.
  void useIRStore.persist.rehydrate();
  void useCloudStore.persist.rehydrate();
  useCloudStore.getState().touch();
  return 'restored';
}

// Moves the open document into a slot it has just earned.
//
// The first save turns this tab's new document into config 17. What is in
// memory is already exactly what belongs in slot 17, so nothing is read and
// nothing is reset — reading would find an empty slot and resetting would throw
// away the document that was just saved.
//
// The slot being left described a document that no longer exists anywhere else,
// so it goes with it.
export function adoptSlot(configId: number): void {
  const leaving = heldSlot;
  pointAt(slotFor(configId));

  // Only this tab's own unsaved slot is ever dropped. Another config's slot can
  // hold unsaved work, and a tab moving between configs must not take it.
  if (leaving !== null && leaving === newDocumentSlot()) dropSlot(leaving);

  useCloudStore.getState().touch();
}

// Once, at startup, before anything renders.
export function initDrafts(): void {
  adoptLegacyDraft();
  pruneDrafts(Date.now());
}

// Signing out leaves the document on screen — it is the user's, and it is what
// they are looking at — but it stops being a saved config's: the next person at
// this browser must not find someone else's work in a slot, and this tab must
// not keep writing into one.
useAuthStore.subscribe((state, previous) => {
  if (!previous.token || state.token) return;
  pointAt(newDocumentSlot());
  clearConfigDrafts();
});
