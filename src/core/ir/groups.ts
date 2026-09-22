import type { ProxyGroup } from './types';

// Group membership is by name, not by id: mihomo reads `proxies: [Auto, HK-01]`
// and looks each entry up among the proxies and groups it has. Every invariant
// here is about those names continuing to resolve.
//
// It matters more than it looks. mihomo refuses to start on a group that names
// something missing, or on one that names itself — and it reports the config as
// a whole, not the entry at fault. So a dangling name is not a stale label to
// tidy up later; it is a config the user cannot run and cannot easily debug.

// Removes one name from a group: out of its member list, and out of
// `default-selected` if that is what it pointed at.
//
// Returns the group by reference when the name appears in neither, so a delete
// elsewhere in the config does not make every group look edited to React.
function withoutName(group: ProxyGroup, name: string): ProxyGroup {
  const members = Array.isArray(group.config.proxies) ? group.config.proxies : [];
  const isMember = members.includes(name);
  const isSelected = group.config['default-selected'] === name;
  if (!isMember && !isSelected) return group;

  return {
    ...group,
    config: {
      ...group.config,
      ...(isMember ? { proxies: members.filter((member) => member !== name) } : {}),
      // Emptied rather than deleted: both exporters treat an empty
      // `default-selected` as absent, and mihomo then starts on the first
      // member — which is the behaviour the field's own "first member" option
      // describes.
      ...(isSelected ? { 'default-selected': '' } : {}),
    },
  };
}

// A group listing its own name is its own upstream, which mihomo rejects.
//
// Enforced on the way into the store rather than in the member picker, for the
// same reason MATCH ordering is: the picker is not the only way to produce one.
// Renaming a group to match a proxy it already contains does it too, as does
// importing a YAML someone else wrote.
export function withoutSelfReference(group: ProxyGroup): ProxyGroup {
  return withoutName(group, group.name);
}

// Drops a deleted proxy or group from every group that named it.
//
// The caller decides whether the name is really gone. Names are not unique —
// two subscriptions can each carry an "HK-01" — so deleting one of them leaves
// the name still resolving, and the groups referring to it still correct.
export function withoutReferencesTo(groups: ProxyGroup[], name: string): ProxyGroup[] {
  return groups.map((group) => withoutName(group, name));
}

// Drops a deleted proxy provider out of every group's `use:`.
//
// Cleaned up rather than left to warn about, on the same reasoning as a member
// list: a `use:` entry is nothing but the name, so removing the provider
// removes everything the entry said. A RULE-SET rule is left standing instead
// because it carries a payload and a policy somebody wrote.
//
// Provider names are keys in one map, so unlike proxy names they are unique and
// there is no "still resolves elsewhere" case to check for.
export function withoutProviderUse(groups: ProxyGroup[], name: string): ProxyGroup[] {
  return groups.map((group) => {
    const used = Array.isArray(group.config.use) ? group.config.use : [];
    if (!used.includes(name)) return group;
    return {
      ...group,
      config: { ...group.config, use: used.filter((entry) => entry !== name) },
    };
  });
}
