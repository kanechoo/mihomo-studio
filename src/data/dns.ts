// Curated DNS servers, transcribed from dns_list.txt in the repo root.
//
// Bundled rather than fetched: this is a hand-picked shortlist of well-known
// resolvers, not a database that drifts between releases. Regenerate from
// dns_list.txt if that file changes.

export interface DnsServer {
  provider: string;
  url: string;
}

// Provider order, and server order within a provider, follow dns_list.txt.
export const DNS_PROVIDERS: readonly string[] = [
  'AliDNS',
  'DNSPod DNS',
  'Cloudflare DNS',
  'Google DNS',
  'TrafficRoute DNS',
  'OpenDNS',
  'Yandex DNS',
  'Comodo DNS',
  'AdGuard DNS',
];

export const DNS_SERVERS: readonly DnsServer[] = [
  // AliDNS
  { provider: 'AliDNS', url: 'udp://223.5.5.5' },
  { provider: 'AliDNS', url: 'udp://223.6.6.6' },
  { provider: 'AliDNS', url: 'tls://223.5.5.5' },
  { provider: 'AliDNS', url: 'tls://223.6.6.6' },
  { provider: 'AliDNS', url: 'tls://dns.alidns.com' },
  { provider: 'AliDNS', url: 'https://223.5.5.5/dns-query' },
  { provider: 'AliDNS', url: 'https://223.6.6.6/dns-query' },
  { provider: 'AliDNS', url: 'https://dns.alidns.com/dns-query' },
  { provider: 'AliDNS', url: 'udp://[2400:3200::1]' },
  // DNSPod DNS
  { provider: 'DNSPod DNS', url: 'tls://dot.pub' },
  { provider: 'DNSPod DNS', url: 'tls://dns.pub' },
  { provider: 'DNSPod DNS', url: 'https://1.12.12.12/dns-query' },
  { provider: 'DNSPod DNS', url: 'https://120.53.53.53/dns-query' },
  { provider: 'DNSPod DNS', url: 'https://doh.pub/dns-query' },
  { provider: 'DNSPod DNS', url: 'udp://[2402:4e00::]' },
  // Cloudflare DNS
  { provider: 'Cloudflare DNS', url: 'udp://1.0.0.1' },
  { provider: 'Cloudflare DNS', url: 'udp://1.1.1.1' },
  { provider: 'Cloudflare DNS', url: 'tls://1.0.0.1' },
  { provider: 'Cloudflare DNS', url: 'tls://1.1.1.1' },
  { provider: 'Cloudflare DNS', url: 'https://1.0.0.1/dns-query' },
  { provider: 'Cloudflare DNS', url: 'https://1.1.1.1/dns-query' },
  { provider: 'Cloudflare DNS', url: 'https://cloudflare-dns.com/dns-query' },
  { provider: 'Cloudflare DNS', url: 'udp://[2606:4700:4700::1111]' },
  { provider: 'Cloudflare DNS', url: 'udp://[2606:4700:4700::1001]' },
  { provider: 'Cloudflare DNS', url: 'tls://[2606:4700:4700::1111]' },
  { provider: 'Cloudflare DNS', url: 'tls://[2606:4700:4700::1001]' },
  // Google DNS
  { provider: 'Google DNS', url: 'udp://8.8.8.8' },
  { provider: 'Google DNS', url: 'udp://8.8.4.4' },
  { provider: 'Google DNS', url: 'tls://8.8.8.8' },
  { provider: 'Google DNS', url: 'tls://8.8.4.4' },
  { provider: 'Google DNS', url: 'https://8.8.8.8/dns-query' },
  { provider: 'Google DNS', url: 'https://8.8.4.4/dns-query' },
  { provider: 'Google DNS', url: 'https://dns.google/dns-query' },
  { provider: 'Google DNS', url: 'h3://8.8.4.4/dns-query' },
  { provider: 'Google DNS', url: 'h3://8.8.8.8/dns-query' },
  { provider: 'Google DNS', url: 'udp://[2001:4860:4860::8888]' },
  { provider: 'Google DNS', url: 'udp://[2001:4860:4860::8844]' },
  { provider: 'Google DNS', url: 'tls://[2001:4860:4860::8888]' },
  { provider: 'Google DNS', url: 'tls://[2001:4860:4860::8844]' },
  // TrafficRoute DNS
  { provider: 'TrafficRoute DNS', url: 'udp://180.184.1.1' },
  { provider: 'TrafficRoute DNS', url: 'udp://180.184.2.2' },
  // OpenDNS
  { provider: 'OpenDNS', url: 'udp://208.67.222.222' },
  { provider: 'OpenDNS', url: 'udp://208.67.220.220' },
  // Yandex DNS
  { provider: 'Yandex DNS', url: 'udp://77.88.8.1' },
  { provider: 'Yandex DNS', url: 'udp://77.88.8.8' },
  { provider: 'Yandex DNS', url: 'udp://dns.yandex.net' },
  { provider: 'Yandex DNS', url: 'udp://2a02:6b8::feed:0ff' },
  { provider: 'Yandex DNS', url: 'udp://2a02:6b8:0:1::feed:0ff' },
  // Comodo DNS
  { provider: 'Comodo DNS', url: 'udp://8.26.56.26' },
  { provider: 'Comodo DNS', url: 'udp://8.20.247.20' },
  // AdGuard DNS
  { provider: 'AdGuard DNS', url: 'udp://94.140.14.14' },
  { provider: 'AdGuard DNS', url: 'udp://94.140.15.15' },
  { provider: 'AdGuard DNS', url: 'quic://dns.adguard.com' },
  { provider: 'AdGuard DNS', url: 'udp://[2a10:50c0::ad1:ff]' },
  { provider: 'AdGuard DNS', url: 'udp://[2a10:50c0::ad2:ff]' },
];

// `223.5.5.5` and `udp://223.5.5.5` name the same resolver — a bare host means
// plain UDP. An imported config may spell it either way, so both collapse to
// one key for comparison. IPv6 brackets are dropped too: dns_list.txt itself is
// inconsistent about them (`udp://[2400:3200::1]` but `udp://2a02:6b8::feed:0ff`).
export function normalizeDnsUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';

  const match = /^([a-z0-9+.-]+):\/\/(.*)$/i.exec(trimmed);
  const scheme = match ? match[1].toLowerCase() : 'udp';
  const rest = match ? match[2] : trimmed;

  const unbracketed = rest.replace(/^\[([^\]]+)\]/, '$1');

  // Only the authority is case-insensitive; a DoH path is not.
  const slash = unbracketed.indexOf('/');
  const authority = slash === -1 ? unbracketed : unbracketed.slice(0, slash);
  const path = slash === -1 ? '' : unbracketed.slice(slash);

  return `${scheme}://${authority.toLowerCase()}${path}`;
}

const BY_KEY = new Map(DNS_SERVERS.map((server) => [normalizeDnsUrl(server.url), server]));

// Resolves however the value is spelled, so an imported `8.8.8.8` still finds
// the Google DNS entry listed as `udp://8.8.8.8`.
export function findDnsServer(value: string): DnsServer | undefined {
  return BY_KEY.get(normalizeDnsUrl(value));
}

export function dnsServersByProvider(provider: string): DnsServer[] {
  return DNS_SERVERS.filter((server) => server.provider === provider);
}
