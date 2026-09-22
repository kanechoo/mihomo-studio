import type { ListenerIR, UserEntry } from '../types';
import { dumpProxiesYaml, endpointOf, type ProxyShareResult } from './common';
import { CONVERTERS } from './converters';

export type { ProxyShareResult } from './common';
export { generateClientProxiesShare, type ClientProxiesShare } from './aggregate';

// What each multi-user protocol needs from an auth entry for a node to exist.
// Single-credential protocols (shadowsocks' one password, snell's psk,
// sudoku's key) are absent on purpose: their shares carry the listener, not a
// person.
const USER_REQUIREMENT: Partial<
  Record<ListenerIR['type'], (user: UserEntry) => boolean>
> = {
  vless: (user) => Boolean(user.uuid),
  vmess: (user) => Boolean(user.uuid),
  trojan: (user) => Boolean(user.password),
  hysteria2: (user) => Boolean(user.password),
  anytls: (user) => Boolean(user.password),
  mieru: (user) => Boolean(user.password),
  tuic: (user) => Boolean(user.username && user.password),
  shadowquic: (user) => Boolean(user.username && user.password),
  trusttunnel: (user) => Boolean(user.username && user.password),
};

// TUIC authenticates per-person only in v5; the v4 inbound carries a token
// list, which makes its share a single identity regardless of entries.
export function isMultiUserController(listener: ListenerIR): boolean {
  if (listener.type === 'tuic') return listener.tuicVersion === 'v5';
  return listener.type in USER_REQUIREMENT;
}

// The identities a multi-user listener's shares should enumerate, in list
// order. Entries missing their required secret are skipped — they cannot
// connect, so they cannot be shared.
export function shareableUsers(listener: ListenerIR): UserEntry[] {
  if (listener.type === 'tuic' && listener.tuicVersion !== 'v5') return [];
  const requirement = USER_REQUIREMENT[listener.type];
  if (!requirement) return [];
  return listener.auth.users.filter(requirement);
}

// One share per Server address, and per identity on multi-user protocols. The
// optional user picks whose credentials the node carries; omitting it keeps
// the historic behaviour of "first usable entry" (and the plain node name).
//
// The payload is a client `proxies:` YAML fragment converted from the
// listener — not a URI link — so transports like XHTTP keep every parameter
// the wire protocol actually needs.
export function generateProxyShare(
  listener: ListenerIR,
  host: string,
  user?: UserEntry
): ProxyShareResult {
  const converter = CONVERTERS[listener.type];
  if (!converter) return { supported: false, reasonCode: 'server.share.unsupported' };

  const { host: address, warnings } = endpointOf(listener, host);
  if (!address) return { supported: true, warnings };

  // Mekya is polled by the client over an HTTP URL the inbound model simply
  // does not contain; there is no honest way to synthesize one.
  if (listener.type === 'vmess' && listener.transport.kind === 'mekya') {
    return { supported: false, reasonCode: 'server.share.unsupportedMekya', warnings };
  }
  // AnyTLS explicitly excludes REALITY upstream — the combination would
  // produce a node no client can dial.
  if (
    listener.type === 'anytls' &&
    (listener.tls.mode === 'reality' || listener.tls.mode === 'tlsmirror')
  ) {
    return { supported: false, reasonCode: 'server.share.anytlsRealityUnsupported', warnings };
  }

  const node = converter(listener, { host: address, warnings }, user);
  return { supported: true, yaml: dumpProxiesYaml([node]), warnings };
}
