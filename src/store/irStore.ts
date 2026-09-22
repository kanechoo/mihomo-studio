import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MihomoIR,
  GeneralConfig,
  ProxyNode,
  DnsConfig,
  ProxyGroup,
  ProxyProvider,
  Rule,
} from '../core/ir';
import {
  createDefaultIR,
  deleteNestedValue,
  isClearedValue,
  setNestedValue,
  withMatchLast,
  withoutSelfReference,
  withoutReferencesTo,
  withoutProviderUse,
  isReservedName,
  nameResolvesIn,
  renameOutbound,
} from '../core/ir';
import { irKeyFor, newDocumentSlot } from './draftKeys';

// What a rename write reports back. A collision is refused rather than applied:
// carrying it through would merge two outbounds into one, since every reference
// to the old name would silently start meaning the other. `reserved` is the
// same refusal against a name mihomo has already taken — DIRECT, REJECT and the
// rest — which is worth telling apart because there is nothing in the config to
// go and look at.
export type RenameResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'duplicate' | 'reserved' };

interface IRStore {
  ir: MihomoIR;

  // General actions
  updateGeneral: (config: Partial<GeneralConfig>) => void;
  updateGeneralField: (fieldKey: string, value: any) => void;

  // DNS actions
  updateDns: (config: Partial<DnsConfig>) => void;
  updateDnsField: (fieldKey: string, value: any) => void;
  // Phase-7 sections: one generic updater per object-shaped top-level key,
  // plus a hosts writer that takes the whole record.
  updateSectionField: (section: 'ntp' | 'profile' | 'experimental' | 'geodata' | 'accessControl' | 'sniffer', fieldKey: string, value: any) => void;
  updateHosts: (hosts: Record<string, any>) => void;

  // Proxy actions
  addProxy: (proxy: ProxyNode) => void;
  addProxies: (proxies: ProxyNode[]) => void;
  updateProxy: (id: string, updates: Partial<ProxyNode>) => void;
  updateProxyField: (id: string, fieldKey: string, value: any) => void;
  removeProxy: (id: string) => void;
  reorderProxies: (newOrder: ProxyNode[]) => void;

  // Renaming is its own action rather than a field write, because it is not a
  // local edit: every group, rule and rule provider that named the old value
  // has to move with it, and a name already in use has to be refused.
  renameProxy: (id: string, name: string) => RenameResult;
  renameProxyGroup: (id: string, name: string) => RenameResult;

  // Proxy Group actions
  addProxyGroup: (group: ProxyGroup) => void;
  updateProxyGroup: (id: string, updates: Partial<ProxyGroup>) => void;
  updateProxyGroupField: (id: string, fieldKey: string, value: any) => void;
  removeProxyGroup: (id: string) => void;
  reorderProxyGroups: (newOrder: ProxyGroup[]) => void;

  // Rule actions
  addRule: (rule: Rule) => void;
  addRules: (rules: Rule[]) => void;
  insertRulesAfter: (id: string, rules: Rule[]) => void;
  updateRule: (id: string, updates: Partial<Rule>) => void;
  updateRuleField: (id: string, fieldKey: string, value: any) => void;
  removeRule: (id: string) => void;
  reorderRules: (newOrder: Rule[]) => void;

  // Proxy Provider actions
  //
  // Adding and editing go through one write, the way rule providers do: a
  // provider is a value in a map keyed by name, so "save this one" and "put
  // them in this order" are the same operation. Deleting is not, because it has
  // to reach into the groups that pulled the provider in.
  updateProxyProviders: (providers: Record<string, ProxyProvider>) => void;
  removeProxyProvider: (name: string) => void;

  // Rule Provider actions
  updateRuleProviders: (providers: Record<string, any>) => void;

  // Utility actions
  resetIR: () => void;
  importIR: (ir: MihomoIR) => void;
}

export const useIRStore = create<IRStore>()(
  persist(
    (set, get) => ({
      ir: createDefaultIR(),

      // Update general configuration (merge)
      updateGeneral: (config) =>
        set((state) => ({
          ir: {
            ...state.ir,
            general: { ...state.ir.general, ...config },
          },
        })),

      // Update a specific general field (supports nested paths)
      updateGeneralField: (fieldKey, value) =>
        set((state) => {
          const newGeneral = { ...state.ir.general };
          if (isClearedValue(value)) deleteNestedValue(newGeneral, fieldKey);
          else setNestedValue(newGeneral, fieldKey, value);
          return {
            ir: {
              ...state.ir,
              general: newGeneral,
            },
          };
        }),

      // DNS actions
      updateDns: (config) =>
        set((state) => ({
          ir: {
            ...state.ir,
            dns: { ...state.ir.dns, ...config },
          },
        })),

      updateDnsField: (fieldKey, value) =>
        set((state) => {
          const newDns = { ...state.ir.dns };
          if (isClearedValue(value)) deleteNestedValue(newDns, fieldKey);
          else setNestedValue(newDns, fieldKey, value);
          return {
            ir: {
              ...state.ir,
              dns: newDns,
            },
          };
        }),

      updateSectionField: (section, fieldKey, value) =>
        set((state) => {
          const next = { ...((state.ir as any)[section] ?? {}) };
          if (isClearedValue(value)) deleteNestedValue(next, fieldKey);
          else setNestedValue(next, fieldKey, value);
          return { ir: { ...state.ir, [section]: next } } as any;
        }),

      updateHosts: (hosts) =>
        set((state) => ({
          ir: {
            ...state.ir,
            hosts,
          },
        })),

      // Add a new proxy
      addProxy: (proxy) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxies: [...state.ir.proxies, proxy],
          },
        })),

      // Add several at once. An import is one action from the user's point of
      // view, and it should be one from the store's too: appending one at a time
      // writes state — and re-renders the list — once per node.
      addProxies: (proxies) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxies: [...state.ir.proxies, ...proxies],
          },
        })),

      // Update an existing proxy
      updateProxy: (id, updates) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxies: state.ir.proxies.map((p) =>
              // A name arriving through here is dropped rather than applied.
              // Renaming has to carry every reference with it and has to be
              // able to refuse a collision, neither of which a void field
              // write can do — so `renameProxy` is the only way in, and
              // ignoring the key beats merging two outbounds silently.
              p.id === id ? { ...p, ...updates, name: p.name } : p
            ),
          },
        })),

      // Update a specific proxy field (supports nested paths in config)
      updateProxyField: (id, fieldKey, value) => {
        // Renames go the long way round wherever they come from, so a caller
        // that has not been taught about `renameProxy` cannot quietly leave
        // half the config pointing at a name that no longer exists.
        if (fieldKey === 'name') {
          get().renameProxy(id, String(value));
          return;
        }

        set((state) => ({
          ir: {
            ...state.ir,
            proxies: state.ir.proxies.map((p) => {
              if (p.id !== id) return p;

              // Handle top-level fields (server, port, type)
              if (['server', 'port', 'type'].includes(fieldKey)) {
                return { ...p, [fieldKey]: value };
              }

              // Handle nested config fields (e.g., 'config.uuid' or 'config.reality-opts.public-key')
              const newProxy = { ...p, config: { ...p.config } };
              if (fieldKey.startsWith('config.')) {
                const configPath = fieldKey.substring(7); // Remove 'config.' prefix
                if (isClearedValue(value)) deleteNestedValue(newProxy.config, configPath);
                else setNestedValue(newProxy.config, configPath, value);
              }
              return newProxy;
            }),
          },
        }));
      },

      // Rename a proxy, carrying every reference to it along.
      //
      // Proxies and groups share one namespace — a rule policy or a group
      // member names either — so the collision test spans both.
      renameProxy: (id, name) => {
        const next = name.trim();
        const ir = get().ir;
        const proxy = ir.proxies.find((p) => p.id === id);
        if (!proxy || next === '') return { ok: false, reason: 'empty' };
        if (next === proxy.name) return { ok: true };
        if (isReservedName(next)) return { ok: false, reason: 'reserved' };
        if (nameResolvesIn(ir.proxies, ir.proxyGroups, next)) {
          return { ok: false, reason: 'duplicate' };
        }

        // With the old name shared by something else, references cannot be
        // attributed to one entry or the other — and renaming one of a pair of
        // duplicates is exactly how that gets fixed. The references stay with
        // whatever kept the name.
        const others = ir.proxies.filter((p) => p.id !== id);
        const shared = nameResolvesIn(others, ir.proxyGroups, proxy.name);
        const cascaded = shared ? ir : { ...ir, ...renameOutbound(ir, proxy.name, next) };

        set(() => ({
          ir: {
            ...cascaded,
            proxies: cascaded.proxies.map((p) => (p.id === id ? { ...p, name: next } : p)),
          },
        }));
        return { ok: true };
      },

      renameProxyGroup: (id, name) => {
        const next = name.trim();
        const ir = get().ir;
        const group = ir.proxyGroups.find((g) => g.id === id);
        if (!group || next === '') return { ok: false, reason: 'empty' };
        if (next === group.name) return { ok: true };
        if (isReservedName(next)) return { ok: false, reason: 'reserved' };
        if (nameResolvesIn(ir.proxies, ir.proxyGroups, next)) {
          return { ok: false, reason: 'duplicate' };
        }

        const others = ir.proxyGroups.filter((g) => g.id !== id);
        const shared = nameResolvesIn(ir.proxies, others, group.name);
        const cascaded = shared ? ir : { ...ir, ...renameOutbound(ir, group.name, next) };

        set(() => ({
          ir: {
            ...cascaded,
            // Applied after the cascade so the new name survives it.
            // withoutSelfReference because the new name can be one this group
            // already lists as a member — a dangling one, since a member that
            // resolved would have been a collision.
            proxyGroups: cascaded.proxyGroups.map((g) =>
              g.id === id ? withoutSelfReference({ ...g, name: next }) : g
            ),
          },
        }));
        return { ok: true };
      },

      // Remove a proxy, and with it every group's claim to have it as a member.
      //
      // A group naming a proxy that no longer exists is not a stale label:
      // mihomo refuses to start on the config, naming the file rather than the
      // entry. Cleaning up here rather than at export time is what lets the
      // group list show what will actually run.
      removeProxy: (id) =>
        set((state) => {
          const removed = state.ir.proxies.find((p) => p.id === id);
          const proxies = state.ir.proxies.filter((p) => p.id !== id);
          // Names are not unique — importing two subscriptions can leave two
          // nodes called "HK-01" — so deleting one of them leaves the name
          // still resolving, and the groups naming it still correct.
          const nameStillResolves =
            removed !== undefined &&
            nameResolvesIn(proxies, state.ir.proxyGroups, removed.name);

          return {
            ir: {
              ...state.ir,
              proxies,
              proxyGroups:
                removed && !nameStillResolves
                  ? withoutReferencesTo(state.ir.proxyGroups, removed.name)
                  : state.ir.proxyGroups,
            },
          };
        }),

      // Reorder proxies (for drag-and-drop)
      reorderProxies: (newOrder) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxies: newOrder,
          },
        })),

      // Proxy Group actions
      //
      // Every write that can introduce a self-reference runs through
      // withoutSelfReference, on the same reasoning as withMatchLast above: the
      // member picker is not the only way to produce one. Renaming a group to
      // match a proxy it already lists does it too, and so does importing
      // someone else's YAML.
      addProxyGroup: (group) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxyGroups: [...state.ir.proxyGroups, withoutSelfReference(group)],
          },
        })),

      updateProxyGroup: (id, updates) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxyGroups: state.ir.proxyGroups.map((g) =>
              // `name` is pinned for the same reason it is on updateProxy:
              // renaming is a graph rewrite that can be refused, and this
              // write is neither. Callers editing a group rename it through
              // renameProxyGroup first and only then save the rest.
              g.id === id ? withoutSelfReference({ ...g, ...updates, name: g.name }) : g
            ),
          },
        })),

      updateProxyGroupField: (id, fieldKey, value) => {
        if (fieldKey === 'name') {
          get().renameProxyGroup(id, String(value));
          return;
        }

        set((state) => ({
          ir: {
            ...state.ir,
            proxyGroups: state.ir.proxyGroups.map((g) => {
              if (g.id !== id) return g;
              return withoutSelfReference({ ...g, [fieldKey]: value });
            }),
          },
        }));
      },

      // Groups can be members of other groups, so deleting one leaves the same
      // dangling name a deleted proxy would.
      removeProxyGroup: (id) =>
        set((state) => {
          const removed = state.ir.proxyGroups.find((g) => g.id === id);
          const proxyGroups = state.ir.proxyGroups.filter((g) => g.id !== id);
          const nameStillResolves =
            removed !== undefined &&
            nameResolvesIn(state.ir.proxies, proxyGroups, removed.name);

          return {
            ir: {
              ...state.ir,
              proxyGroups:
                removed && !nameStillResolves
                  ? withoutReferencesTo(proxyGroups, removed.name)
                  : proxyGroups,
            },
          };
        }),

      reorderProxyGroups: (newOrder) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxyGroups: newOrder,
          },
        })),

      // Rule actions
      //
      // Every write that can move a rule runs through withMatchLast, so the
      // MATCH-goes-last invariant holds no matter which path produced the
      // change — adding, dragging, retyping a rule to MATCH, or importing a
      // YAML that had it in the middle. Enforcing it here rather than in the
      // list component is what keeps the export honest too.
      addRule: (rule) =>
        set((state) => ({
          ir: {
            ...state.ir,
            rules: withMatchLast([...state.ir.rules, rule]),
          },
        })),

      addRules: (rules) =>
        set((state) => ({
          ir: {
            ...state.ir,
            rules: withMatchLast([...state.ir.rules, ...rules]),
          },
        })),

      // Place rules directly after an existing one. Rules are matched in order,
      // so appending would silently move the new entries past rules that were
      // meant to come after them.
      insertRulesAfter: (id, rules) =>
        set((state) => {
          const index = state.ir.rules.findIndex((r) => r.id === id);
          const next = [...state.ir.rules];
          // Unknown anchor: append rather than drop the rules on the floor.
          next.splice(index === -1 ? next.length : index + 1, 0, ...rules);
          return { ir: { ...state.ir, rules: withMatchLast(next) } };
        }),

      updateRule: (id, updates) =>
        set((state) => ({
          ir: {
            ...state.ir,
            rules: withMatchLast(
              state.ir.rules.map((r) => (r.id === id ? { ...r, ...updates } : r))
            ),
          },
        })),

      updateRuleField: (id, fieldKey, value) =>
        set((state) => ({
          ir: {
            ...state.ir,
            rules: withMatchLast(
              state.ir.rules.map((r) => {
                if (r.id !== id) return r;
                return { ...r, [fieldKey]: value };
              })
            ),
          },
        })),

      removeRule: (id) =>
        set((state) => ({
          ir: {
            ...state.ir,
            rules: state.ir.rules.filter((r) => r.id !== id),
          },
        })),

      reorderRules: (newOrder) =>
        set((state) => ({
          ir: {
            ...state.ir,
            rules: withMatchLast(newOrder),
          },
        })),

      // Update rule providers
      updateRuleProviders: (providers) =>
        set((state) => ({
          ir: {
            ...state.ir,
            ruleProviders: providers,
          },
        })),

      updateProxyProviders: (providers) =>
        set((state) => ({
          ir: {
            ...state.ir,
            proxyProviders: providers,
          },
        })),

      // Delete a proxy provider, and with it every group's claim to use it.
      //
      // A group left naming a deleted provider is a config mihomo refuses to
      // start, and the `use:` entry held nothing but the name — so there is
      // nothing to preserve by leaving it behind. Unlike proxies, provider
      // names are map keys and therefore unique, so the name is gone the moment
      // the key is.
      removeProxyProvider: (name) =>
        set((state) => {
          const proxyProviders = { ...state.ir.proxyProviders };
          if (!(name in proxyProviders)) return state;
          delete proxyProviders[name];

          return {
            ir: {
              ...state.ir,
              proxyProviders,
              proxyGroups: withoutProviderUse(state.ir.proxyGroups, name),
            },
          };
        }),

      // Reset to default IR
      resetIR: () =>
        set(() => ({
          ir: createDefaultIR(),
        })),

      // Import a complete IR (for loading configs)
      importIR: (ir) =>
        set(() => ({
          ir: {
            ...ir,
            // A config saved before proxy providers existed has no such key,
            // and every reader here would rather have an empty map than guard
            // against undefined.
            proxyProviders: ir.proxyProviders || {},
            rules: withMatchLast(ir.rules),
            proxyGroups: ir.proxyGroups.map(withoutSelfReference),
          },
        })),
    }),
    {
      name: irKeyFor(newDocumentSlot()),
      version: 4,
      // The document belongs to whichever config this tab's address bar names,
      // and nothing knows that at import time. `drafts.ts` points the store at
      // the right slot and hydrates it from there; hydrating first would mean
      // reading one document only to replace it with another.
      //
      // The name above is not a default so much as a safe place to land: until
      // a slot is chosen, anything written goes to this tab's own new document
      // rather than into some config's drawer.
      skipHydration: true,
      // v1 stored rules in whatever order they were added, so an existing
      // config can still have MATCH sitting mid-list. Normalising on rehydrate
      // means the invariant holds for saved work too, not only for new writes.
      migrate: (persisted: any, version) => {
        if (version < 2 && Array.isArray(persisted?.ir?.rules)) {
          persisted.ir.rules = withMatchLast(persisted.ir.rules);
        }
        // Up to v2 the member picker offered a group its own name, so a draft
        // saved before this can hold a self-reference nothing ever warned
        // about — the config simply refuses to start.
        if (version < 3 && Array.isArray(persisted?.ir?.proxyGroups)) {
          persisted.ir.proxyGroups = persisted.ir.proxyGroups.map(withoutSelfReference);
        }
        // v4 added proxy providers. Filling the key in rather than letting
        // readers cope with undefined: this is the shape every other part of
        // the app is written against, and a draft saved yesterday should not
        // behave differently from one created today.
        if (version < 4 && persisted?.ir && !persisted.ir.proxyProviders) {
          persisted.ir.proxyProviders = {};
        }
        return persisted;
      },
    }
  )
);
