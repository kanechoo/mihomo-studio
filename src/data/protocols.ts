// Protocol Display Name Registry — the single source of truth for how a
// protocol's internal key is written in the UI.
//
// mihomo's own docs and community usage give every protocol a canonical
// spelling ("VMess", not "VMESS"; "ShadowsocksR", not "SSR"). Those spellings
// are brand names, so they are recorded here by hand and must never be derived
// from the internal key with case transforms or abbreviations: `vmess` would
// uppercase to "VMESS" and `ssr` to "SSR", both wrong.
//
// Consumers: proxy card badges, the add-node protocol picker, the subscription
// import preview, and the (locked) type field inside the edit modal.

export const PROTOCOL_DISPLAY_NAMES: Record<string, string> = {
  vmess: 'VMess',
  ss: 'Shadowsocks',
  ssr: 'ShadowsocksR',
  trojan: 'Trojan',
  vless: 'VLESS',
  hysteria2: 'Hysteria2',
  hysteria: 'Hysteria',
  tuic: 'TUIC v5',
  wireguard: 'WireGuard',
  ssh: 'SSH',
  snell: 'Snell',
  http: 'HTTP',
  socks5: 'SOCKS5',
  anytls: 'AnyTLS',
  direct: 'Direct',
  dns: 'DNS',
  mieru: 'Mieru',
  sudoku: 'Sudoku',
  shadowquic: 'ShadowQUIC',
  trusttunnel: 'TrustTunnel',
  'gost-relay': 'GOST Relay',
  masque: 'MASQUE',
  tailscale: 'Tailscale',
  zerotier: 'ZeroTier',
  openvpn: 'OpenVPN',
  rematch: 'Rematch',
};

// Falls back to the raw key only for types the registry does not know yet (a
// freshly imported exotic type) — an unknown key is still better shown than
// hidden, but it should be visible in review as a missing registry entry.
export function getProtocolDisplayName(type: string): string {
  return PROTOCOL_DISPLAY_NAMES[type] ?? type;
}
