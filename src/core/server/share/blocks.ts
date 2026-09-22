// Shared ListenerIR → client proxy conversion pieces.
//
// The server listener and the client proxy are two different mihomo
// configuration models: every field that crosses this boundary is either
// renamed, restructured, derived from another value, or deliberately left
// behind. Nothing here copies a block wholesale — each helper spells out the
// exact keys it hands over so a new upstream field can never sneak through
// unreviewed.
import type { ListenerIR, SecurityBlocks, TlsSection, TransportSection } from '../types';
import { deriveRealityPublicKey } from '../../shared/generators/reality';

export interface ConvertContext {
  host: string;
  warnings: string[];
}

export const Warnings = {
  realityPublicKey: 'server.share.realityPublicKeyManual',
  echConfig: 'server.share.echConfigManual',
  restlsVersionHint: 'server.share.restlsVersionHint',
  sudokuKey: 'server.share.sudokuKeyNote',
  credentials: 'server.share.ssContainsCredentials',
} as const;

// The SNI a client should send. REALITY stores its camouflage domains on the
// listener; plain-TLS listeners keep none, and mihomo falls back to the
// `server` address when sni/servername is absent — which is exactly right for
// a certificate issued to that address.
export function sniOf(tls: TlsSection): string | undefined {
  return tls.reality?.serverNames[0] || undefined;
}

// The public half of the server's REALITY keypair. The document stores it as
// profile metadata whenever the private key is written; when only a hand-typed
// private key exists, derive it the same way mihomo does. Without either there
// is no honest value to share — warn instead of guessing.
//
// mihomo decodes the client-side public key with Go's base64.RawStdEncoding,
// so a padded spelling is rejected as invalid; every emitted key is trimmed.
export function realityPublicKeys(
  tls: TlsSection,
  warnings: string[]
): { publicKey?: string; shortId?: string } {
  const reality = tls.reality;
  if (!reality) return {};
  const stored = reality.publicKey;
  const derived = stored ? undefined : deriveRealityPublicKey(reality.privateKey);
  if (!stored && !derived) warnings.push(Warnings.realityPublicKey);
  const publicKey = (stored ?? derived)?.replace(/=+$/, '');
  return {
    publicKey: publicKey || undefined,
    shortId: reality.shortIds[0] || undefined,
  };
}

// Server-side TLS state becomes a handful of client keys. Which exact key
// names hold the SNI differs per protocol (`servername` on vless/vmess, `sni`
// elsewhere), so the caller passes the spelling; trojan needs no `tls:` flag
// at all because the protocol is always TLS.
export function tlsKeys(
  listener: ListenerIR,
  ctx: ConvertContext,
  opts: { sniKey: 'servername' | 'sni'; explicitTlsFlag: boolean }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const tls = listener.tls;
  const sni = sniOf(tls);

  if (tls.mode === 'tls' || tls.mode === 'reality' || tls.mode === 'tlsmirror') {
    if (opts.explicitTlsFlag) out.tls = true;
    if (sni) out[opts.sniKey] = sni;

    if (tls.mode === 'reality') {
      // REALITY dials with uTLS: mihomo refuses the node without a
      // client-fingerprint. The server holds no such setting (it is purely
      // client behaviour), so shares carry the same default the client form
      // uses — chrome — instead of emitting a node that can never dial.
      out['client-fingerprint'] = 'chrome';
      const { publicKey, shortId } = realityPublicKeys(tls, ctx.warnings);
      const realityOpts: Record<string, unknown> = {};
      if (publicKey) realityOpts['public-key'] = publicKey;
      if (shortId) realityOpts['short-id'] = shortId;
      if (Object.keys(realityOpts).length > 0) out['reality-opts'] = realityOpts;
    }

    if (tls.mode === 'tlsmirror') {
      // Only the payload halves with a client meaning cross over; `dest` and
      // `proxy` describe how the *server* fetches its carrier connection.
      const mirror = tls.tlsmirror ?? {};
      const tlsmirrorOpts: Record<string, unknown> = {};
      if (mirror['primary-key']) tlsmirrorOpts['primary-key'] = mirror['primary-key'];
      if (mirror['explicit-nonce-ciphersuites'] !== undefined) {
        tlsmirrorOpts['explicit-nonce-ciphersuites'] = mirror['explicit-nonce-ciphersuites'];
      }
      if (mirror['defer-instance-derived-write-time'] !== undefined) {
        tlsmirrorOpts['defer-instance-derived-write-time'] =
          mirror['defer-instance-derived-write-time'];
      }
      if (mirror['transport-layer-padding'] !== undefined) {
        tlsmirrorOpts['transport-layer-padding'] = mirror['transport-layer-padding'];
      }
      if (mirror['sequence-watermarking-enabled'] !== undefined) {
        tlsmirrorOpts['sequence-watermarking-enabled'] = mirror['sequence-watermarking-enabled'];
      }
      if (Object.keys(tlsmirrorOpts).length > 0) out['tlsmirror-opts'] = tlsmirrorOpts;
    }
  }

  if (tls.echKey) {
    // The listener holds the full ECH key pair file; the client wants just the
    // base64 config half. Splitting that apart reliably is not something the
    // editor can promise, so point the user at it instead of emitting a guess.
    ctx.warnings.push(Warnings.echConfig);
  }

  return out;
}

// The security wrappers ride on top of TLS. On vless/vmess/trojan/anytls they
// appear as dedicated `-opts` blocks; every one of them implies TLS on the
// client even when the listener's own mode is `none`.
function wrapperPassword(security: SecurityBlocks): string | undefined {
  return (
    security.shadowTls?.password ||
    security.shadowTls?.users?.find((user) => user.password !== '')?.password ||
    undefined
  );
}

export function securityKeys(listener: ListenerIR, ctx: ConvertContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const security = listener.security;

  if (security.shadowTls?.enable) {
    const password = wrapperPassword(security);
    const shadowTlsOpts: Record<string, unknown> = {};
    if (security.shadowTls.version) shadowTlsOpts.version = security.shadowTls.version;
    if (password) shadowTlsOpts.password = password;
    if (Object.keys(shadowTlsOpts).length > 0) {
      out.tls = true;
      out['shadow-tls-opts'] = shadowTlsOpts;
    }
  }

  if (security.resTls?.enable) {
    const restlsOpts: Record<string, unknown> = {};
    if (security.resTls.password) restlsOpts.password = security.resTls.password;
    if (security.resTls.restlsScript) restlsOpts['restls-script'] = security.resTls.restlsScript;
    if (Object.keys(restlsOpts).length > 0) {
      // The client picks a TLS version hint the server model simply does not
      // carry; without it some deployments fail, so say so rather than guess.
      ctx.warnings.push(Warnings.restlsVersionHint);
      out.tls = true;
      out['restls-opts'] = restlsOpts;
    }
  }

  if (security.jls?.enable) {
    const jlsUser = security.jls.users[0];
    const jlsOpts: Record<string, unknown> = {};
    if (jlsUser?.username) jlsOpts.username = jlsUser.username;
    if (jlsUser?.password) jlsOpts.password = jlsUser.password;
    if (Object.keys(jlsOpts).length > 0) {
      out.tls = true;
      out['jls-opts'] = jlsOpts;
    }
  }

  return out;
}

// sing-mux: the server's mux-option block is the same feature the client
// spells `smux`. Applies to the TCP transports only; protocols whose client
// model has no smux surface never call this.
export function smuxFromMuxOption(listener: ListenerIR): Record<string, unknown> | undefined {
  const mux = listener.security.muxOption;
  if (!mux) return undefined;
  const smux: Record<string, unknown> = { enabled: true };
  if (mux.padding !== undefined) smux.padding = mux.padding;
  if (mux.brutal?.enabled) {
    smux['brutal-opts'] = {
      enabled: true,
      ...(mux.brutal.up !== undefined ? { up: mux.brutal.up } : {}),
      ...(mux.brutal.down !== undefined ? { down: mux.brutal.down } : {}),
    };
  }
  return smux;
}

// Client transport blocks. `network` itself is omitted for plain TCP: mihomo
// treats an absent network as tcp, and writing it would just be one more
// place for the file to drift from the docs.
export function transportKeys(
  transport: TransportSection,
  ctx: ConvertContext
): Record<string, unknown> | undefined {
  switch (transport.kind) {
    case 'ws': {
      const wsOpts: Record<string, unknown> = {};
      if (transport.wsPath) wsOpts.path = transport.wsPath;
      return Object.keys(wsOpts).length > 0
        ? { network: 'ws', 'ws-opts': wsOpts }
        : { network: 'ws' };
    }
    case 'grpc':
      return transport.grpcServiceName
        ? {
            network: 'grpc',
            'grpc-opts': { 'grpc-service-name': transport.grpcServiceName },
          }
        : { network: 'grpc' };
    case 'xhttp':
      return xhttpKeys(transport);
    case 'mkcp':
      return mkcpKeys(transport);
    default:
      void ctx;
      return undefined;
  }
}

// Every documented server `xhttp-config` key and where it lands in the
// client's `xhttp-opts`. The three server-only keys exist so the coverage
// audit can name them; they must never appear in the output.
const XHTTP_DIRECT_KEYS = [
  ['path', 'path'],
  ['host', 'host'],
  ['mode', 'mode'],
  ['xPaddingBytes', 'x-padding-bytes'],
  ['xPaddingObfsMode', 'x-padding-obfs-mode'],
  ['xPaddingKey', 'x-padding-key'],
  ['xPaddingHeader', 'x-padding-header'],
  ['xPaddingPlacement', 'x-padding-placement'],
  ['xPaddingMethod', 'x-padding-method'],
  ['uplinkHttpMethod', 'uplink-http-method'],
  ['sessionPlacement', 'session-placement'],
  ['sessionKey', 'session-key'],
  ['sessionTable', 'session-table'],
  ['sessionLength', 'session-length'],
  ['seqPlacement', 'seq-placement'],
  ['seqKey', 'seq-key'],
  ['uplinkDataPlacement', 'uplink-data-placement'],
  ['uplinkDataKey', 'uplink-data-key'],
  ['uplinkChunkSize', 'uplink-chunk-size'],
  ['scMaxEachPostBytes', 'sc-max-each-post-bytes'],
] as const;

export const XHTTP_SERVER_ONLY_KEYS = [
  'no-sse-header',
  'sc-max-buffered-posts',
  'sc-stream-up-server-secs',
];

function xhttpKeys(transport: TransportSection): Record<string, unknown> {
  const xhttp = transport.xhttp;
  if (!xhttp) return { network: 'xhttp' };
  const opts: Record<string, unknown> = {};
  for (const [irKey, yamlKey] of XHTTP_DIRECT_KEYS) {
    const value = xhttp[irKey];
    if (value !== undefined && value !== '') opts[yamlKey] = value;
  }
  return Object.keys(opts).length > 0 ? { network: 'xhttp', 'xhttp-opts': opts } : { network: 'xhttp' };
}

// mKCP: the server's `mkcp-config` block renames into `mkcp-opts`; `enable`
// is the switch that got us here and has no client meaning. VMess-only.
const MKCP_DIRECT_KEYS = [
  ['mtu', 'mtu'],
  ['tti', 'tti'],
  ['uplinkCapacity', 'uplink-capacity'],
  ['downlinkCapacity', 'downlink-capacity'],
  ['congestion', 'congestion'],
  ['writeBuffer', 'write-buffer'],
  ['readBuffer', 'read-buffer'],
  ['seed', 'seed'],
  ['header', 'header'],
] as const;

function mkcpKeys(transport: TransportSection): Record<string, unknown> | undefined {
  const mkcp = transport.mkcpConfig;
  if (!mkcp?.enable) return undefined;
  const opts: Record<string, unknown> = {};
  for (const [irKey, yamlKey] of MKCP_DIRECT_KEYS) {
    const value = mkcp[irKey];
    if (value !== undefined && value !== '') opts[yamlKey] = value;
  }
  return Object.keys(opts).length > 0 ? { network: 'mkcp', 'mkcp-opts': opts } : { network: 'mkcp' };
}
