import type { ServerConfigIR } from '../types';
import type { ServerProblem } from './problems';

// Routing-layer validation: the outbound table and the rules that name it.
//
// Everything here is a whole-config question — whether a name is defined
// somewhere, whether two entries collide — so it runs once per document, in
// the same pass as cross-listener checks.

// mihomo's built-in policies resolve before `proxies:` is read; an outbound
// claiming one of these names is a redefinition and refuses to start. GLOBAL
// joins them because it is built from every proxy afterwards.
export const RESERVED_TARGET_NAMES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'PASS-RULE',
  'COMPATIBLE',
  'GLOBAL',
]);

const TARGET_ONLY_TYPES = new Set(['MATCH']);

function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function validateRouting(config: ServerConfigIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const outbounds = config.outbounds ?? [];

  // Outbound names form the table everything else resolves against, so their
  // own integrity comes first: duplicate or reserved names are exactly the
  // fault a user cannot see from one row alone.
  const byName = new Map<string, number>();
  for (const outbound of outbounds) {
    const name = outbound.name.trim();
    if (!name) {
      problems.push({
        severity: 'error',
        code: 'server.problem.outboundNameRequired',
      });
      continue;
    }
    if (RESERVED_TARGET_NAMES.has(name.toUpperCase())) {
      problems.push({
        severity: 'error',
        code: 'server.problem.outboundReservedName',
        params: { name },
      });
    }
    const previous = byName.get(name);
    if (previous !== undefined) {
      problems.push({
        severity: 'error',
        code: 'server.problem.outboundDuplicateName',
        params: { name },
      });
    }
    byName.set(name, (previous ?? 0) + 1);

    if (outbound.type === 'http' || outbound.type === 'socks5') {
      if (!outbound.server?.trim()) {
        problems.push({
          severity: 'error',
          code: 'server.problem.outboundServerRequired',
          params: { name },
        });
      }
      if (!isValidPort(outbound.port)) {
        problems.push({
          severity: 'error',
          code: 'server.problem.outboundPortInvalid',
          params: { name },
        });
      }
    }
  }

  const definedNames = new Set(outbounds.map((o) => o.name.trim()).filter(Boolean));

  for (const rule of config.rules ?? []) {
    const target = rule.target.trim();
    if (!target) {
      problems.push({ severity: 'error', code: 'server.problem.ruleTargetRequired' });
    } else if (
      !RESERVED_TARGET_NAMES.has(target.toUpperCase()) &&
      !definedNames.has(target)
    ) {
      problems.push({
        severity: 'error',
        code: 'server.problem.ruleTargetUnknown',
        params: { target },
      });
    }

    if (!TARGET_ONLY_TYPES.has(rule.type) && !rule.payload.trim()) {
      problems.push({
        severity: 'error',
        code: 'server.problem.rulePayloadRequired',
        params: { type: rule.type },
      });
    }
  }

  // A listener's `proxy` field bypasses rules entirely and must name a real
  // outbound — mihomo refuses to start otherwise. A warning rather than an
  // error because groups defined outside this editor are still legitimate.
  for (const listener of config.listeners) {
    const via = listener.proxy?.trim();
    if (!via) continue;
    if (RESERVED_TARGET_NAMES.has(via.toUpperCase())) continue;
    if (definedNames.has(via)) continue;
    problems.push({
      severity: 'warning',
      code: 'server.problem.listenerProxyUnknown',
      params: { name: listener.name, proxy: via },
      listenerId: listener.id,
      listenerName: listener.name,
      section: 'common',
      field: 'proxy',
    });
  }

  return problems;
}
