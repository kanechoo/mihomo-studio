import yaml from 'js-yaml';
import type { ListenerIR, UserEntry } from '../types';

// The share payload is a mihomo client document fragment: a `proxies:` list
// holding exactly the nodes the listener can serve — one per Server address,
// one per identity on multi-user protocols. Nothing else from a client config
// (ports, dns, groups, rules) belongs here.
export interface ProxyShareResult {
  supported: boolean;
  /** A `proxies:` YAML fragment ready to paste into a client config. */
  yaml?: string;
  warnings?: string[];
  reasonCode?: string;
}

export type ProxyShareGenerator = (
  listener: ListenerIR,
  host: string,
  user?: UserEntry
) => ProxyShareResult;

// What a node calls the identity it carries: the username where the protocol
// has them, otherwise enough of the UUID to tell two clients apart. Empty for
// callers that did not pick a specific user.
export function userLabel(user?: UserEntry): string {
  if (!user) return '';
  const name = user.username?.trim();
  if (name) return name;
  if (user.uuid) return user.uuid.slice(0, 8);
  return '';
}

// The host a share points at is no longer a property of the listener: it comes
// from the document's Server list (the addresses of the machine that runs this
// config), and one listener produces one share per entry. `host` is therefore
// passed in by the caller; an empty string yields the missingHost warning so
// callers can render the gap honestly.
export function endpointOf(
  listener: ListenerIR,
  host: string
): { host: string; port: number; warnings: string[] } {
  const warnings: string[] = [];
  const trimmed = host.trim();
  if (trimmed === '') {
    warnings.push('server.share.missingHost');
    return { host: '', port: portNumberOf(listener), warnings };
  }
  return { host: trimmed, port: portNumberOf(listener), warnings };
}

// Port expressions (`8000-8010`, `443,8443`) advertise several ports; a client
// node dials one, so the first wins. Hysteria2 additionally carries the whole
// expression as its hopping `ports` value.
export function portNumberOf(listener: ListenerIR): number {
  const first = listener.port.split(/[,/]/)[0]?.trim() ?? '';
  const start = first.includes('-') ? first.split('-')[0] : first;
  const port = Number.parseInt(start, 10);
  return Number.isFinite(port) ? port : 0;
}

// Multi-user listeners expand to several nodes; without a label suffix they
// would all land on the same name and collide inside `proxies:`.
export function nodeName(listener: ListenerIR, user?: UserEntry): string {
  const label = userLabel(user);
  return label ? `${listener.name} ${label}` : listener.name;
}

export function dumpProxiesYaml(nodes: Record<string, unknown>[]): string {
  return yaml.dump({ proxies: nodes }, { lineWidth: -1, noRefs: true });
}
