import type { ServerConfigIR, ListenerIR } from '../types';
import type { ServerProblem } from './problems';
import { isValidIpv4, isValidIpv6 } from './syntax';
import { parsePortExpression, type PortRange } from '../portExpression';

const RESERVED_NAMES = new Set([
  'DIRECT',
  'REJECT',
  'REJECT-DROP',
  'PASS',
  'COMPATIBLE',
  'GLOBAL',
]);

const QUIC_ONLY = new Set(['tuic', 'hysteria2', 'hysteria2-realm', 'shadowquic']);

type Family = 'v4' | 'v6' | 'hostname';

function listenFamily(listen: string): {
  family: Family;
  wildcard: boolean;
  address: string;
} {
  const trimmed = listen.trim();
  if (trimmed === '0.0.0.0' || trimmed === '*') return { family: 'v4', wildcard: true, address: trimmed };
  if (trimmed === '::') return { family: 'v6', wildcard: true, address: trimmed };
  if (isValidIpv4(trimmed)) return { family: 'v4', wildcard: false, address: trimmed };
  if (isValidIpv6(trimmed)) return { family: 'v6', wildcard: false, address: trimmed };
  return { family: 'hostname', wildcard: false, address: trimmed };
}

function familiesIntersect(
  a: { family: Family; wildcard: boolean; address?: string },
  b: { family: Family; wildcard: boolean; address?: string }
): boolean {
  if (a.family === 'hostname' || b.family === 'hostname') return true;
  if (a.family !== b.family) return false;
  return a.wildcard || b.wildcard || a.address === b.address;
}

function transportFamily(listener: ListenerIR): { tcp: boolean; udp: boolean } {
  if (QUIC_ONLY.has(listener.type)) return { tcp: false, udp: true };

  if (listener.type === 'tunnel') {
    const network = Array.isArray(listener.protocol.network)
      ? (listener.protocol.network as string[])
      : ['tcp'];
    return { tcp: network.includes('tcp'), udp: network.includes('udp') };
  }

  const udp =
    listener.protocol.udp === true ||
    listener.type === 'trusttunnel' ||
    listener.type === 'tproxy';
  return { tcp: true, udp };
}

function rangesOverlap(a: PortRange[], b: PortRange[]): boolean {
  for (const ra of a) {
    for (const rb of b) {
      if (ra.lo <= rb.hi && rb.lo <= ra.hi) return true;
    }
  }
  return false;
}

export function listenersConflict(a: ListenerIR, b: ListenerIR): boolean {
  const fa = listenFamily(a.listen);
  const fb = listenFamily(b.listen);
  if (!familiesIntersect(fa, fb)) return false;

  const pa = parsePortExpression(a.port);
  const pb = parsePortExpression(b.port);
  if (pa.errors.length > 0 || pb.errors.length > 0) return false;
  if (!rangesOverlap(pa.ranges, pb.ranges)) return false;

  const ta = transportFamily(a);
  const tb = transportFamily(b);
  return (ta.tcp && tb.tcp) || (ta.udp && tb.udp);
}

export function validateCrossListeners(config: ServerConfigIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const active = config.listeners.filter((listener) => listener.enabled);

  const byName = new Map<string, ListenerIR>();
  for (const listener of active) {
    const existing = byName.get(listener.name);
    if (existing) {
      problems.push({
        severity: 'error',
        code: 'server.problem.duplicateName',
        params: { name: listener.name },
        listenerId: listener.id,
        listenerName: listener.name,
      });
    } else {
      byName.set(listener.name, listener);
    }

    if (RESERVED_NAMES.has(listener.name.toUpperCase())) {
      problems.push({
        severity: 'error',
        code: 'server.problem.reservedName',
        params: { name: listener.name },
        listenerId: listener.id,
        listenerName: listener.name,
      });
    }
  }

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (listenersConflict(a, b)) {
        problems.push({
          severity: 'error',
          code: 'server.problem.bindConflict',
          params: { nameA: a.name, nameB: b.name, listenA: a.listen, listenB: b.listen },
          listenerId: a.id,
          listenerName: a.name,
          section: 'common',
        });
      }
    }
  }

  return problems;
}
