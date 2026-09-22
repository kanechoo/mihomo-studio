// Syntax primitives shared by both domains' validators. These are pure string
// predicates with no knowledge of listeners, proxies, or problem shapes — the
// server's L1 layer and any client-side field validation wrap them into their
// own reporting formats.

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE =
  /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,7}:|([0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|([0-9A-Fa-f]{1,4}:){1,5}(:[0-9A-Fa-f]{1,4}){1,2}|([0-9A-Fa-f]{1,4}:){1,4}(:[0-9A-Fa-f]{1,4}){1,3}|([0-9A-Fa-f]{1,4}:){1,3}(:[0-9A-Fa-f]{1,4}){1,4}|([0-9A-Fa-f]{1,4}:){1,2}(:[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:((:[0-9A-Fa-f]{1,4}){1,6})|:((:[0-9A-Fa-f]{1,4}){1,7}|:))$/;
const HOSTNAME_LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+={0,2}$/;
const HEX_RE = /^[0-9a-fA-F]+$/;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isValidIpv4(value: string): boolean {
  return IPV4_RE.test(value);
}

export function isValidIpv6(value: string): boolean {
  if (!value.includes(':')) return false;
  const [head, zone] = value.split('%');
  if (zone !== undefined && !/^[A-Za-z0-9]+$/.test(zone)) return false;
  return IPV6_RE.test(head);
}

export function isValidIpAddress(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}

export function isValidCidr(value: string): boolean {
  const slash = value.indexOf('/');
  if (slash === -1) return false;
  const base = value.slice(0, slash);
  const prefixStr = value.slice(slash + 1);
  if (!/^\d+$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  if (isValidIpv4(base)) return prefix <= 32;
  if (isValidIpv6(base)) return prefix <= 128;
  return false;
}

export function isValidHostname(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > 253) return false;
  if (trimmed.endsWith('.')) return false;
  return trimmed.split('.').every((label) => HOSTNAME_LABEL_RE.test(label));
}

export function isValidDomain(value: string): boolean {
  return isValidHostname(value);
}

export function isValidHostPort(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    const close = trimmed.indexOf(']');
    if (close === -1) return false;
    const host = trimmed.slice(1, close);
    const rest = trimmed.slice(close + 1);
    if (!rest.startsWith(':')) return false;
    const port = rest.slice(1);
    return isValidIpv6(host) && /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
  }
  const colon = trimmed.lastIndexOf(':');
  if (colon === -1) return false;
  const host = trimmed.slice(0, colon);
  const port = trimmed.slice(colon + 1);
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) return false;
  return isValidIpv4(host) || isValidHostname(host);
}

export function isValidUrl(value: string, schemes: string[] = ['http', 'https']): boolean {
  try {
    const url = new URL(value);
    return schemes.includes(url.protocol.replace(/:$/, ''));
  } catch {
    return false;
  }
}

export function isBase64(value: string): boolean {
  if (value === '') return false;
  if (!BASE64_RE.test(value)) return BASE64URL_RE.test(value);
  return value.length % 4 !== 1;
}

export function isHex(value: string): boolean {
  return value !== '' && HEX_RE.test(value);
}

export function isValidRegex(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

export function looksLikePath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (trimmed.startsWith('-----BEGIN')) return false;
  if (isBase64(trimmed) && trimmed.length > 40) return false;
  return true;
}

export function isValidListenAddress(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '*' || trimmed === '::' || trimmed === '0.0.0.0') return true;
  if (/^[\d.]+$/.test(trimmed)) return isValidIpv4(trimmed);
  if (trimmed.includes(':')) return isValidIpv6(trimmed);
  return isValidHostname(trimmed);
}

const PEM_RE =
  /^-----BEGIN ([A-Z0-9 ]+)-----\r?\n(?:[A-Za-z0-9+/=\r\n]+\r?\n)+-----END \1-----\r?\n?$/;

export function isValidPem(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || !trimmed.startsWith('-----BEGIN')) return false;
  return PEM_RE.test(trimmed);
}
