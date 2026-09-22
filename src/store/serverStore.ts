import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultServerConfig,
  createListener,
  createServerGeneral,
  createServerOutbound,
  createServerRule,
  ensureRealitySection,
  pickFreeListenerPort,
  syncDerivedRealityKey,
} from '../core/server/factory';
import type {
  ListenerIR,
  ListenerKind,
  ServerConfigIR,
  ServerOutboundKind,
  ServerOutboundIR,
  ServerRuleIR,
  TuicVersion,
} from '../core/server/types';
import { deleteNestedValue, isClearedValue, setNestedValue } from '../core/ir/factory';

interface ServerState {
  config: ServerConfigIR;
  resetServer: () => void;
  importServerConfig: (config: ServerConfigIR) => void;
  /** Replaces the Overview Server list (addresses share links point at). */
  setServers: (servers: string[]) => void;
  addListener: (kind: ListenerKind, version?: TuicVersion) => string;
  duplicateListener: (id: string) => string | null;
  removeListener: (id: string) => void;
  reorderListeners: (ids: string[]) => void;
  toggleEnabled: (id: string) => void;
  updateListenerField: (id: string, path: string, value: unknown) => void;
  replaceListener: (id: string, next: ListenerIR) => void;
  updateGeneralField: (path: string, value: unknown) => void;
  updateDnsField: (path: string, value: unknown) => void;
  addOutbound: (kind: ServerOutboundKind) => string;
  removeOutbound: (id: string) => void;
  updateOutboundField: (id: string, key: keyof ServerOutboundIR, value: unknown) => void;
  addRule: () => string;
  removeRule: (id: string) => void;
  updateRuleField: (id: string, key: keyof ServerRuleIR, value: unknown) => void;
  /** Insert fully-built rules right after `id`, keeping match order intact. */
  insertRulesAfter: (id: string, rules: ServerRuleIR[]) => void;
  reorderRules: (ids: string[]) => void;
}

function uniqueName(base: string, existing: ListenerIR[]): string {
  let candidate = `${base}-copy`;
  let n = 2;
  const names = new Set(existing.map((l) => l.name));
  while (names.has(candidate)) {
    candidate = `${base}-copy-${n}`;
    n += 1;
  }
  return candidate;
}

export const useServerStore = create<ServerState>()(
  persist(
    (set, get) => ({
      config: createDefaultServerConfig(),

      resetServer: () => set({ config: createDefaultServerConfig() }),

      importServerConfig: (config) =>
        set({
          config: {
            ...config,
            listeners: [...config.listeners],
          },
        }),

      setServers: (servers) =>
        set((state) => ({ config: { ...state.config, servers } })),

      addListener: (kind, version) => {
        const listener = createListener(kind, version);
        // Every new listener gets a random port that no existing listener
        // claims, so creating a second proxy of the same protocol never lands
        // on the shared default and never collides. Protocols without a port
        // (tun) keep theirs empty.
        if (listener.port !== '') {
          listener.port = pickFreeListenerPort(get().config.listeners);
        }
        set((state) => ({
          config: { ...state.config, listeners: [...state.config.listeners, listener] },
        }));
        return listener.id;
      },

      duplicateListener: (id) => {
        const source = get().config.listeners.find((listener) => listener.id === id);
        if (!source) return null;
        const copy: ListenerIR = {
          ...source,
          auth: { ...source.auth, users: source.auth.users.map((u) => ({ ...u })) },
          tls: { ...source.tls },
          transport: { ...source.transport },
          protocol: { ...source.protocol },
          security: { ...source.security },
          extensions: { ...source.extensions },
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: uniqueName(source.name, get().config.listeners),
        };
        set((state) => ({
          config: { ...state.config, listeners: [...state.config.listeners, copy] },
        }));
        return copy.id;
      },

      removeListener: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            listeners: state.config.listeners.filter((listener) => listener.id !== id),
          },
        })),

      reorderListeners: (ids) =>
        set((state) => {
          const byId = new Map(state.config.listeners.map((listener) => [listener.id, listener]));
          const ordered = ids
            .map((id) => byId.get(id))
            .filter((listener): listener is ListenerIR => listener !== undefined);
          const dropped = state.config.listeners.filter(
            (listener) => !ids.includes(listener.id)
          );
          return { config: { ...state.config, listeners: [...ordered, ...dropped] } };
        }),

      toggleEnabled: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            listeners: state.config.listeners.map((listener) =>
              listener.id === id ? { ...listener, enabled: !listener.enabled } : listener
            ),
          },
        })),

      updateListenerField: (id, path, value) =>
        set((state) => ({
          config: {
            ...state.config,
            listeners: state.config.listeners.map((listener) => {
              if (listener.id !== id) return listener;
              const copy = { ...listener };
              // Same scaffolding rule as the buffered editor: a nested write
              // into Reality must never be what creates the section.
              if ((path === 'tls.mode' && value === 'reality') || path.startsWith('tls.reality.')) {
                copy.tls = ensureRealitySection(copy.tls);
              }
              if (isClearedValue(value)) deleteNestedValue(copy, path);
              else setNestedValue(copy, path, value);
              // Same derivation rule as the buffered editor: a new private
              // key refreshes the stored public half.
              syncDerivedRealityKey(copy.tls, path, value);
              return copy;
            }),
          },
        })),

      replaceListener: (id, next) =>
        set((state) => ({
          config: {
            ...state.config,
            listeners: state.config.listeners.map((listener) =>
              listener.id === id ? next : listener
            ),
          },
        })),

      updateDnsField: (path, value) =>
        set((state) => {
          const dns = { ...state.config.dns };
          if (isClearedValue(value)) deleteNestedValue(dns as Record<string, unknown>, path);
          else setNestedValue(dns as unknown as Record<string, unknown>, path, value);
          return { config: { ...state.config, dns } };
        }),

      updateGeneralField: (path, value) =>
        set((state) => {
          const general = { ...state.config.general };
          if (isClearedValue(value)) deleteNestedValue(general as Record<string, unknown>, path);
          else setNestedValue(general as Record<string, unknown>, path, value);
          return { config: { ...state.config, general } };
        }),

      addOutbound: (kind) => {
        const outbound = createServerOutbound(kind);
        set((state) => ({
          config: {
            ...state.config,
            outbounds: [...(state.config.outbounds ?? []), outbound],
          },
        }));
        return outbound.id;
      },

      removeOutbound: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            outbounds: (state.config.outbounds ?? []).filter((o) => o.id !== id),
          },
        })),

      updateOutboundField: (id, key, value) =>
        set((state) => ({
          config: {
            ...state.config,
            outbounds: (state.config.outbounds ?? []).map((o) =>
              o.id === id ? { ...o, [key]: value } : o
            ),
          },
        })),

      addRule: () => {
        const rule = createServerRule();
        set((state) => ({
          config: {
            ...state.config,
            rules: [...(state.config.rules ?? []), rule],
          },
        }));
        return rule.id;
      },

      removeRule: (id) =>
        set((state) => ({
          config: {
            ...state.config,
            rules: (state.config.rules ?? []).filter((r) => r.id !== id),
          },
        })),

      updateRuleField: (id, key, value) =>
        set((state) => ({
          config: {
            ...state.config,
            rules: (state.config.rules ?? []).map((r) =>
              r.id === id ? { ...r, [key]: value } : r
            ),
          },
        })),

      insertRulesAfter: (id, rules) =>
        set((state) => {
          const list = state.config.rules ?? [];
          const index = list.findIndex((r) => r.id === id);
          const next =
            index === -1
              ? [...list, ...rules]
              : [...list.slice(0, index + 1), ...rules, ...list.slice(index + 1)];
          return { config: { ...state.config, rules: next } };
        }),

      // Rule order is match order in mihomo — first hit wins — so reordering
      // is a semantic edit here, unlike the outbound list.
      reorderRules: (ids) =>
        set((state) => {
          const byId = new Map((state.config.rules ?? []).map((r) => [r.id, r]));
          const ordered = ids
            .map((id) => byId.get(id))
            .filter((r): r is ServerRuleIR => r !== undefined);
          return { config: { ...state.config, rules: ordered } };
        }),
    }),
    {
      name: 'mihomo-server-draft',
      version: 3,
      migrate: migrateServerDraft,
    }
  )
);

// v1 (camelCase) → v2 (kebab-case, the shared client DnsConfig spelling).
const LEGACY_DNS_KEY_MAP: Record<string, string> = {
  enhancedMode: 'enhanced-mode',
  fakeIpRange: 'fake-ip-range',
  fakeIpFilter: 'fake-ip-filter',
  defaultNameserver: 'default-nameserver',
};

// Exported for tests: rewrites a v1 persisted draft so the DNS tab keeps
// rendering after the IR switched to the shared kebab-case model, and (v2 → v3)
// seeds the general section a draft saved before it existed was lacking.
export function migrateServerDraft(
  persisted: unknown,
  version: number
): Partial<ServerState> {
  if (!persisted || typeof persisted !== 'object') {
    return persisted as Partial<ServerState>;
  }
  const state = persisted as {
    config?: {
      dns?: Record<string, unknown>;
      general?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  if (version < 2 && state.config?.dns) {
    const legacyDns = state.config.dns;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(legacyDns)) {
      const mapped = LEGACY_DNS_KEY_MAP[key] ?? key;
      if (!(mapped in next)) next[mapped] = value;
    }
    state.config = { ...(state.config ?? {}), dns: next };
  }

  if (version < 3 && state.config && !state.config.general) {
    state.config = { ...state.config, general: createServerGeneral() };
  }

  return state as Partial<ServerState>;
}
