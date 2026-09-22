import type { ProxyGroup, ProxyNode, ProxyProvider, Rule, RuleProvider } from './types';

// Everything mihomo resolves by name, handled in one place.
//
// The config is a small graph held together by strings: a rule names a policy,
// a RULE-SET rule names a provider, a provider names the proxy it downloads
// through, a group names its members and the proxy providers it pulls in. None
// of those are ids, so nothing breaks loudly when the far end goes away —
// mihomo just refuses to start, and reports the file rather than the line.
//
// Three jobs live here, in order below: asking what points at a name, rewriting
// every reference when a name changes, and checking that the whole graph still
// resolves before a config is allowed out of the editor.
//
// Deleting is the exception, and lives in the store: where a reference carries
// nothing but the name — a group's member list — the store drops it, because
// removing the name removes the whole entry and loses nothing.
//
// The queries take the collections they actually read rather than the whole IR,
// so a component can subscribe to those alone instead of re-rendering on every
// edit anywhere in the config.

// Outbounds that resolve without the config defining anything. mihomo puts
// them in its proxy table before it reads a line of `proxies:`, which is why
// they can be named anywhere a proxy can — as a rule's policy, and equally as a
// member of a group. A `select` offering DIRECT beside its nodes is the
// ordinary way to write "or send this out unproxied".
// Outbounds that resolve without the config defining anything, in the order
// mihomo's own documentation lists them.
export const BUILT_IN_OUTBOUNDS = [
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'PASS-RULE',
  'COMPATIBLE',
];

// Resolves too, but deliberately not offered: mihomo builds GLOBAL itself out
// of every proxy in the config, so it is a name a hand-written config may well
// use and this app should not call broken.
const IMPLICIT_OUTBOUNDS = ['GLOBAL'];

// A name that is already spoken for before the config is read, and so cannot be
// given to a proxy or a group.
//
// mihomo has the built-ins in its table by the time it parses `proxies:`, so a
// node called DIRECT is not a redefinition of DIRECT — it is a second entry
// under a taken name, and mihomo says so and stops. GLOBAL is taken as well,
// just later: it is built out of every proxy once the file is read, so a group
// of that name is either an error or quietly replaced, and neither is what
// anyone wanted.
export function isReservedName(name: string): boolean {
  return BUILT_IN_OUTBOUNDS.includes(name) || IMPLICIT_OUTBOUNDS.includes(name);
}

// A name the config itself defines: a proxy node, or a group.
//
// This is the question behind duplicate names and deletions — whether there is
// still an entry answering to the name — and not the question of whether a
// reference to it works, which is `outboundResolves` and takes in the built-ins
// too. Confusing the two is how a group listing REJECT came to be reported as a
// group listing something deleted.
export function nameResolvesIn(
  proxies: ProxyNode[],
  groups: ProxyGroup[],
  name: string
): boolean {
  return proxies.some((p) => p.name === name) || groups.some((g) => g.name === name);
}

// Whether a reference to this name finds anything: a group's member, a rule's
// policy. mihomo draws no distinction between those two — both are looked up in
// the one table of outbounds — so neither does this.
export function outboundResolves(
  proxies: ProxyNode[],
  groups: ProxyGroup[],
  name: string
): boolean {
  if (isReservedName(name)) return true;
  return nameResolvesIn(proxies, groups, name);
}

export function policyResolves(
  proxies: ProxyNode[],
  groups: ProxyGroup[],
  policy: string
): boolean {
  // An empty policy is a rule that is not finished yet, which is a different
  // complaint and one the form already makes. It stops here rather than in
  // `outboundResolves`: a member list has no half-written state — an entry is
  // added by name or not at all — so a blank one there is a broken config.
  if (!policy) return true;
  return outboundResolves(proxies, groups, policy);
}

export function providerExists(
  providers: Record<string, RuleProvider>,
  name: string
): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(providers || {}, name);
}

// The same question for a proxy provider. Separate from `providerExists`
// because the two are separate namespaces in mihomo — one config can have a
// rule provider and a proxy provider both called `cn`, and neither shadows the
// other.
export function proxyProviderExists(
  providers: Record<string, ProxyProvider>,
  name: string
): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(providers || {}, name);
}

// The groups a proxy provider's deletion would empty out, or leave dangling.
export function groupsUsingProvider(
  groups: ProxyGroup[],
  providerName: string
): ProxyGroup[] {
  return groups.filter((group) =>
    Array.isArray(group.config.use) ? group.config.use.includes(providerName) : false
  );
}

// A RULE-SET rule matches against a provider named in its payload, so a payload
// with no provider behind it is a rule that cannot run.
export function ruleSetResolves(
  providers: Record<string, RuleProvider>,
  rule: Rule
): boolean {
  if (rule.type !== 'RULE-SET') return true;
  if (!rule.payload) return true;
  return providerExists(providers, rule.payload);
}

// The rules a rule provider's deletion would leave dangling.
export function dependentsOfProvider(rules: Rule[], providerName: string): Rule[] {
  return rules.filter((r) => r.type === 'RULE-SET' && r.payload === providerName);
}

// What a proxy's or group's deletion would leave dangling.
//
// Group membership is deliberately absent: the store removes those references
// as part of the same delete, so warning about them would be describing damage
// that is not going to happen.
//
// Both kinds of provider are counted, and counted apart. They are unrelated
// sections of the config that happen to share a `proxy:` key, and "3 providers"
// would send someone looking in one of them for something sitting in the other.
export function dependentsOfOutbound(
  rules: Rule[],
  providers: Record<string, RuleProvider>,
  name: string,
  proxyProviders: Record<string, ProxyProvider> = {}
): { rules: Rule[]; providers: string[]; proxyProviders: string[] } {
  return {
    rules: rules.filter((r) => r.policy === name),
    providers: downloadingThrough(providers, name),
    proxyProviders: downloadingThrough(proxyProviders, name),
  };
}

// The providers of either kind that fetch through a given outbound.
function downloadingThrough(
  providers: Record<string, { proxy?: string }>,
  name: string
): string[] {
  return Object.entries(providers || {})
    .filter(([, provider]) => provider.proxy === name)
    .map(([providerName]) => providerName);
}

// ============= Renaming =============

// The part of the config that can name an outbound.
export interface ReferringSlice {
  proxyGroups: ProxyGroup[];
  rules: Rule[];
  ruleProviders: Record<string, RuleProvider>;
  proxyProviders: Record<string, ProxyProvider>;
}

// Carries a rename through every reference to the old name.
//
// Renaming without this is the same defect as deleting without cleanup, only
// quieter: the node is still there, still working, and every group and rule
// that named it now points at nothing. Since the references are names and not
// ids, following the rename is the only way they can survive it.
//
// The caller is responsible for refusing a rename onto a name already in use.
// Applied anyway it would not fail — it would merge: every reference to `from`
// would silently start meaning whatever already answered to `to`, with no
// record of which was which.
//
// Collections come back by reference when nothing in them named the old value,
// so a rename with no references to fix is not an edit to everything.
export function renameOutbound(
  slice: ReferringSlice,
  from: string,
  to: string
): ReferringSlice {
  if (from === to || !from || !to) return slice;

  let groupsChanged = false;
  const proxyGroups = slice.proxyGroups.map((group) => {
    const members = Array.isArray(group.config.proxies) ? group.config.proxies : [];
    const isMember = members.includes(from);
    const isSelected = group.config['default-selected'] === from;
    if (!isMember && !isSelected) return group;

    groupsChanged = true;
    return {
      ...group,
      config: {
        ...group.config,
        ...(isMember
          ? { proxies: members.map((member) => (member === from ? to : member)) }
          : {}),
        ...(isSelected ? { 'default-selected': to } : {}),
      },
    };
  });

  let rulesChanged = false;
  const rules = slice.rules.map((rule) => {
    if (rule.policy !== from) return rule;
    rulesChanged = true;
    return { ...rule, policy: to };
  });

  let providersChanged = false;
  const ruleProviders: Record<string, RuleProvider> = {};
  Object.entries(slice.ruleProviders || {}).forEach(([name, provider]) => {
    if (provider.proxy === from) {
      providersChanged = true;
      ruleProviders[name] = { ...provider, proxy: to };
    } else {
      ruleProviders[name] = provider;
    }
  });

  // A proxy provider names an outbound the same way, and for the same reason:
  // it is the thing the subscription is fetched through. Left behind, the
  // provider keeps working right up until the update, then quietly stops.
  let proxyProvidersChanged = false;
  const proxyProviders: Record<string, ProxyProvider> = {};
  Object.entries(slice.proxyProviders || {}).forEach(([name, provider]) => {
    if (provider.proxy === from) {
      proxyProvidersChanged = true;
      proxyProviders[name] = { ...provider, proxy: to };
    } else {
      proxyProviders[name] = provider;
    }
  });

  return {
    proxyGroups: groupsChanged ? proxyGroups : slice.proxyGroups,
    rules: rulesChanged ? rules : slice.rules,
    ruleProviders: providersChanged ? ruleProviders : slice.ruleProviders,
    proxyProviders: proxyProvidersChanged ? proxyProviders : slice.proxyProviders,
  };
}

// ============= Validation =============

// One thing wrong with the config, as an i18n key and its interpolations.
//
// A key rather than a sentence because this is produced in a store, which has
// no `t`. The component that shows it translates.
export interface ConfigProblem {
  key: string;
  params?: Record<string, string>;
}

// Everything that would stop mihomo starting, or start it in a state nobody
// asked for.
//
// This is what stands between a half-finished edit and a subscription URL. A
// saved config is not a draft: it is fetched by a client that will either run
// it or fail to, with no editor open to explain why. So the editor refuses to
// publish one it can already tell is broken.
//
// Deliberately not listed: a `default-selected` that names a non-member.
// mihomo documents falling back to the first member, so the config runs — the
// form marks it, but it is not a reason to block a save.
export function validateIR(ir: {
  proxies: ProxyNode[];
  proxyGroups: ProxyGroup[];
  rules: Rule[];
  ruleProviders: Record<string, RuleProvider>;
  proxyProviders?: Record<string, ProxyProvider>;
}): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const { proxies, proxyGroups, rules, ruleProviders } = ir;
  const proxyProviders = ir.proxyProviders || {};

  // Duplicate names. mihomo refuses a config with two outbounds answering to
  // the same name, and it is the one problem the editor cannot flag in place:
  // both entries look perfectly correct on their own. A reserved name is the
  // same fault with the other half off-screen — the entry it collides with is
  // one mihomo supplied rather than one in the file.
  const seen = new Set<string>();
  const reported = new Set<string>();
  [...proxies, ...proxyGroups].forEach(({ name }) => {
    if (!name || reported.has(name)) return;
    if (isReservedName(name)) {
      reported.add(name);
      problems.push({ key: 'validation.reservedName', params: { name } });
      return;
    }
    if (seen.has(name)) {
      reported.add(name);
      problems.push({ key: 'validation.duplicateName', params: { name } });
    }
    seen.add(name);
  });

  proxyGroups.forEach((group) => {
    const members = Array.isArray(group.config.proxies) ? group.config.proxies : [];
    const used = Array.isArray(group.config.use) ? group.config.use : [];
    // A group with nothing to choose between is rejected by mihomo outright.
    // Pulling in a provider counts: a subscription-backed group is normally
    // nothing but `use:`, and its members are not known until mihomo fetches
    // them.
    if (members.length === 0 && used.length === 0) {
      problems.push({ key: 'validation.emptyGroup', params: { group: group.name } });
      return;
    }
    members.forEach((member) => {
      if (!outboundResolves(proxies, proxyGroups, member)) {
        problems.push({
          key: 'validation.groupMember',
          params: { group: group.name, name: member },
        });
      }
    });
    used.forEach((providerName) => {
      if (!proxyProviderExists(proxyProviders, providerName)) {
        problems.push({
          key: 'validation.groupProvider',
          params: { group: group.name, name: providerName },
        });
      }
    });
  });

  rules.forEach((rule) => {
    if (!policyResolves(proxies, proxyGroups, rule.policy)) {
      problems.push({
        key: 'validation.rulePolicy',
        params: { policy: rule.policy, rule: rule.payload || rule.type },
      });
    }
    if (!ruleSetResolves(ruleProviders, rule)) {
      problems.push({ key: 'validation.ruleProvider', params: { name: rule.payload } });
    }
  });

  Object.entries(ruleProviders || {}).forEach(([providerName, provider]) => {
    const via = provider.proxy;
    if (via && via !== 'DIRECT' && !nameResolvesIn(proxies, proxyGroups, via)) {
      problems.push({
        key: 'validation.providerProxy',
        params: { provider: providerName, name: via },
      });
    }
  });

  // Same check on the other kind of provider. DIRECT is the one built-in worth
  // allowing here: a subscription fetched through REJECT is not a subscription.
  Object.entries(proxyProviders).forEach(([providerName, provider]) => {
    const via = provider.proxy;
    if (via && via !== 'DIRECT' && !nameResolvesIn(proxies, proxyGroups, via)) {
      problems.push({
        key: 'validation.proxyProviderProxy',
        params: { provider: providerName, name: via },
      });
    }
  });

  return problems;
}
