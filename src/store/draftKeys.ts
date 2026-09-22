// One document, one pair of storage keys.
//
// The editor is several tabs on one origin, and `localStorage` is not: with a
// single key for "the document", the tab you are typing in overwrites the one
// you left open on another config, and only the last write survives a reload.
// So every document gets its own pair of keys — one for the config itself, one
// for what the cloud store knows about it — and a tab writes only to the pair
// its address bar names.
//
// Nothing here imports a store. Both stores need these keys to configure their
// persistence, so this file has to be a leaf; `drafts.ts` is where the two meet.

const PREFIX = 'mihomo-draft-';
const META_SUFFIX = '-meta';

// This tab's own name for itself, kept in sessionStorage.
const TAB_KEY = 'mihomo-tab';

// Where the document lived before drafts were per config: one key for the whole
// browser, holding whatever the last tab to write had open.
const LEGACY_IR_KEY = 'mihomo-ir-storage';
const LEGACY_META_KEY = 'mihomo-cloud-storage';

// How long an unsaved new document outlives the tab that was writing it.
//
// A tab that is closed without saving leaves its draft behind, and nothing ever
// reopens that slot — the next tab mints its own. Without a sweep they would
// accumulate for as long as the browser keeps the origin's storage.
export const ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A document's identity in storage: a config's id, or one tab's own unsaved
// document.
export type DraftSlot = string;

export interface SlotRecord {
  slot: DraftSlot;
  // Whether the slot holds a document at all.
  present: boolean;
  // Whether that document is worth restoring in preference to the server's
  // copy. False for a draft that was only ever a cache of what was fetched.
  unsaved: boolean;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Storage disabled for this origin — private windows, and some enterprise
    // policies. The app still works; it just forgets on reload.
    return null;
  }
}

// This tab's id, minted on first use and kept in sessionStorage — which is per
// tab, and survives that tab's own reloads.
//
// This is what makes two "new config" tabs two documents. Without it they share
// one slot, and the second one to be edited is the only one that survives.
//
// A tab duplicated by the browser inherits sessionStorage and therefore the
// draft, which is the right answer for "duplicate this tab" anyway.
let cachedTabId: string | null = null;

function tabId(): string {
  if (cachedTabId !== null) return cachedTabId;

  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(TAB_KEY);
  } catch {
    stored = null;
  }

  cachedTabId = stored ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  if (stored === null) {
    try {
      window.sessionStorage.setItem(TAB_KEY, cachedTabId);
    } catch {
      // Without sessionStorage this tab gets a fresh id on every reload, so a
      // reload loses the unsaved new document. Nothing else breaks.
    }
  }
  return cachedTabId;
}

export function newDocumentSlot(): DraftSlot {
  return `new-${tabId()}`;
}

export function slotFor(configId: number | null): DraftSlot {
  return configId === null ? newDocumentSlot() : String(configId);
}

export function irKeyFor(slot: DraftSlot): string {
  return `${PREFIX}${slot}`;
}

export function metaKeyFor(slot: DraftSlot): string {
  return `${PREFIX}${slot}${META_SUFFIX}`;
}

function isConfigSlot(slot: DraftSlot): boolean {
  return /^[1-9][0-9]*$/.test(slot);
}

// The `state` half of a zustand persist record, or null when there is nothing
// readable there. A record written by a version we cannot parse is treated as
// absent rather than thrown: a draft is a convenience, and refusing to open the
// editor over one would be the worse failure.
function persistedState(key: string): Record<string, any> | null {
  const store = storage();
  if (!store) return null;

  const raw = store.getItem(key);
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.state === 'object' ? parsed.state : null;
  } catch {
    return null;
  }
}

// What is waiting in a document's slot.
//
// The two kinds differ in what "unsaved" means. A config's draft competes with
// a copy on the server, so only edits the server has not seen are worth
// restoring. A new document competes with nothing: if it is there at all, it is
// the only copy that exists.
export function inspectSlot(configId: number | null): SlotRecord {
  const slot = slotFor(configId);
  const store = storage();
  const present = store !== null && store.getItem(irKeyFor(slot)) !== null;

  if (!present) return { slot, present: false, unsaved: false };
  if (configId === null) return { slot, present: true, unsaved: true };

  const meta = persistedState(metaKeyFor(slot));
  // The id is checked as well as the flag: a record naming a different config
  // is one this slot has no business restoring, whatever it says about itself.
  return { slot, present: true, unsaved: meta?.dirty === true && meta.currentId === configId };
}

export function dropSlot(slot: DraftSlot): void {
  const store = storage();
  if (!store) return;
  store.removeItem(irKeyFor(slot));
  store.removeItem(metaKeyFor(slot));
}

function storedSlots(): DraftSlot[] {
  const store = storage();
  if (!store) return [];

  const slots = new Set<DraftSlot>();
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key === null || !key.startsWith(PREFIX)) continue;
    const name = key.slice(PREFIX.length);
    slots.add(name.endsWith(META_SUFFIX) ? name.slice(0, -META_SUFFIX.length) : name);
  }
  return [...slots];
}

// Drops the drafts that are no longer protecting anything.
//
// Two rules, one per kind. A config's draft earns its place only while it holds
// edits the server has not seen — anything else is a stale copy of a document
// one request away. A new document's draft is kept until the tab writing it has
// been gone long enough to call it abandoned.
//
// This tab's own new-document slot is never swept, whatever its date says.
// Another live tab's can be, and the cost of getting that wrong is small: that
// tab still holds its document in memory and writes the whole thing back on the
// next keystroke.
export function pruneDrafts(now: number): void {
  const mine = newDocumentSlot();

  for (const slot of storedSlots()) {
    if (slot === mine) continue;

    if (isConfigSlot(slot)) {
      const meta = persistedState(metaKeyFor(slot));
      if (meta?.dirty !== true) dropSlot(slot);
      continue;
    }

    // Undated records are swept too. Everything this app writes carries a
    // timestamp, so an entry without one was either left by the version before
    // this or corrupted, and neither is worth keeping indefinitely.
    const touchedAt = persistedState(metaKeyFor(slot))?.touchedAt;
    if (typeof touchedAt !== 'number' || now - touchedAt > ORPHAN_TTL_MS) dropSlot(slot);
  }
}

// Every draft belonging to a saved config, forgotten.
//
// For signing out: those documents are one account's, and the next person at
// this browser must not find them. A new document's draft is nobody's but the
// tab's, and stays.
export function clearConfigDrafts(): void {
  for (const slot of storedSlots()) {
    if (isConfigSlot(slot)) dropSlot(slot);
  }
}

// Moves the single pre-slot document into the slot it belongs to, once.
//
// Somebody upgrading has a document in the old keys, and for a signed-out user
// it is the only copy there is. `currentId` in the old cloud record says which
// config it was — or that it was never saved, in which case it becomes this
// tab's new document.
export function adoptLegacyDraft(): void {
  const store = storage();
  if (!store) return;

  const ir = store.getItem(LEGACY_IR_KEY);
  if (ir === null) {
    store.removeItem(LEGACY_META_KEY);
    return;
  }

  const legacyMeta = store.getItem(LEGACY_META_KEY);
  const currentId = persistedState(LEGACY_META_KEY)?.currentId;
  const slot = slotFor(typeof currentId === 'number' ? currentId : null);

  // A slot that already has something in it was written by this version, which
  // knows more about what belongs there than the key being retired does.
  if (store.getItem(irKeyFor(slot)) === null) {
    store.setItem(irKeyFor(slot), ir);
    if (legacyMeta !== null) store.setItem(metaKeyFor(slot), legacyMeta);
  }

  store.removeItem(LEGACY_IR_KEY);
  store.removeItem(LEGACY_META_KEY);
}
