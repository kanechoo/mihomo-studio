import type { Rule } from './types';

// mihomo evaluates rules top-down and MATCH matches everything, so every rule
// below a MATCH is unreachable. Rather than let the list show an order that the
// proxy will not honour, MATCH is pinned to the end and the UI stops it being
// dragged out of place.
export function isMatchRule(rule: Rule): boolean {
  return rule.type === 'MATCH';
}

// Stable partition: the relative order inside each group is untouched, so
// pinning MATCH never disturbs the ordering chosen for everything else. A list
// that is already correct comes back by reference, which keeps an unrelated
// rule edit from looking like a reorder to React.
export function withMatchLast(rules: Rule[]): Rule[] {
  const firstMatch = rules.findIndex(isMatchRule);
  if (firstMatch === -1 || rules.slice(firstMatch).every(isMatchRule)) {
    return rules;
  }

  // More than one MATCH is already dead config — mihomo never reaches the
  // second. They are kept rather than silently dropped, since deleting a rule
  // the user wrote is not this function's call to make.
  return [...rules.filter((r) => !isMatchRule(r)), ...rules.filter(isMatchRule)];
}
