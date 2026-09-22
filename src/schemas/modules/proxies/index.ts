import { vlessProxyFields } from './vless';
import { hysteria2ProxyFields } from './hysteria2';
import { tuicProxyFields } from './tuic';
import { trojanProxyFields } from './trojan';
import { directProxyFields } from './direct';
import { httpProxyFields } from './http';
import { socks5ProxyFields } from './socks5';
import { vmessProxyFields } from './vmess';
import { ssProxyFields } from './ss';
import { snellProxyFields } from './snell';
import { ssrProxyFields } from './ssr';
import { anytlsProxyFields } from './anytls';
import { hysteriaProxyFields } from './hysteria';
import { wireguardProxyFields } from './wireguard';
import { sshProxyFields } from './ssh';
import { mieruProxyFields } from './mieru';
import { sudokuProxyFields } from './sudoku';
import { shadowquicProxyFields } from './shadowquic';
import { trusttunnelProxyFields } from './trusttunnel';
import { gostRelayProxyFields } from './gostRelay';
import { dnsOutProxyFields } from './dnsOut';
import { rematchProxyFields } from './rematch';
import { masqueProxyFields } from './masque';
import { tailscaleProxyFields } from './tailscale';
import { zerotierProxyFields } from './zerotier';
import { openvpnProxyFields } from './openvpn';

// Registry of all protocol schemas
export const protocolSchemas = {
  vless: vlessProxyFields,
  hysteria2: hysteria2ProxyFields,
  tuic: tuicProxyFields,
  trojan: trojanProxyFields,
  direct: directProxyFields,
  http: httpProxyFields,
  socks5: socks5ProxyFields,
  vmess: vmessProxyFields,
  ss: ssProxyFields,
  snell: snellProxyFields,
  ssr: ssrProxyFields,
  anytls: anytlsProxyFields,
  hysteria: hysteriaProxyFields,
  wireguard: wireguardProxyFields,
  ssh: sshProxyFields,
  mieru: mieruProxyFields,
  sudoku: sudokuProxyFields,
  shadowquic: shadowquicProxyFields,
  trusttunnel: trusttunnelProxyFields,
  'gost-relay': gostRelayProxyFields,
  dns: dnsOutProxyFields,
  rematch: rematchProxyFields,
  masque: masqueProxyFields,
  tailscale: tailscaleProxyFields,
  zerotier: zerotierProxyFields,
  openvpn: openvpnProxyFields,
};

export type ProtocolType = keyof typeof protocolSchemas;

// Get schema for a specific protocol
export function getProtocolSchema(protocol: ProtocolType) {
  return protocolSchemas[protocol];
}

// Get all available protocol types
export function getAvailableProtocols() {
  return Object.keys(protocolSchemas) as ProtocolType[];
}
