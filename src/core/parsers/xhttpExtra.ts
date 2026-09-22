// Translating a share link's `extra=` blob into mihomo's `xhttp-opts`.
//
// Both describe the same transport, in different spellings. Xray writes its
// XHTTP settings as a camelCase JSON object and hangs it off the link; mihomo
// reads kebab-case keys sitting directly in `xhttp-opts` and has no `extra` key
// at all. So carrying the blob across untouched produces a node whose padding,
// session and xmux settings mihomo silently ignores — it is looking for
// `x-padding-key` and the node says `xPaddingKey`.
//
// Nothing is dropped on the way. A key this file has never heard of is still
// spelled the way mihomo spells things and kept: an unknown setting that came
// from a working link is far more likely to be one mihomo gained after this was
// written than one nobody wants.

// Most names differ from mihomo's only in case. These differ in more.
const KEY_RENAMES: Record<string, string> = {
  // mihomo's name for what Xray calls xmux.
  xmux: 'reuse-settings',
  // Splitting on case boundaries finds none inside `GRPC`, so the mechanical
  // answer here is `no-grpcheader`.
  noGRPCHeader: 'no-grpc-header',
};

// A map of HTTP header names, not a block of settings. Header names are the
// user's own text and are copied exactly as they were written.
const OPAQUE_KEYS = new Set(['headers']);

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `xPaddingObfsMode` → `x-padding-obfs-mode`, and a key already written in
// mihomo's own style passes through unchanged.
function toKebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function renameKey(key: string): string {
  return KEY_RENAMES[key] ?? toKebab(key);
}

function convertKeys(source: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  Object.entries(source).forEach(([key, value]) => {
    // The one part of the object that is not a rename away from mihomo's shape.
    if (key === 'downloadSettings' || key === 'download-settings') {
      const settings = convertDownload(value);
      if (settings) result['download-settings'] = settings;
      return;
    }

    const name = renameKey(key);
    result[name] =
      isPlainObject(value) && !OPAQUE_KEYS.has(name) ? convertKeys(value) : value;
  });

  return result;
}

// TLS and REALITY settings, which Xray keeps in a block per security type and
// mihomo mostly keeps flat.
//
// `fingerprint` is the trap. In Xray it is the uTLS fingerprint — the "look
// like Chrome" setting — while mihomo has a field of exactly that name meaning
// something else entirely: a pinned certificate hash. The one meant here is
// `client-fingerprint`, and getting it wrong would not fail loudly.
//
// `serverName` and `fingerprint` are the node's own, whichever block Xray wrote
// them in; only what is left over from a REALITY block is REALITY's.
function convertSecurity(raw: unknown, kind: 'tls' | 'reality'): Record<string, any> {
  if (!isPlainObject(raw)) return {};

  const result: Record<string, any> = {};
  const realityOpts: Record<string, any> = {};

  Object.entries(raw).forEach(([key, value]) => {
    switch (key) {
      case 'serverName':
        result.servername = value;
        break;
      case 'fingerprint':
        result['client-fingerprint'] = value;
        break;
      case 'allowInsecure':
        result['skip-cert-verify'] = value;
        break;
      default:
        if (kind === 'reality') realityOpts[toKebab(key)] = value;
        else result[toKebab(key)] = value;
    }
  });

  if (Object.keys(realityOpts).length > 0) result['reality-opts'] = realityOpts;
  return result;
}

// The split-download half, where the two configs disagree about more than
// spelling.
//
// mihomo's `download-settings` is one object holding both an XHTTP block and a
// proxy: `path` and `reuse-settings` next to `server`, `port` and `tls`. Xray
// says the same thing as a stream-settings object — an `address`, a `security`
// word, and one settings block per security type — so this cannot be translated
// by renaming keys alone.
function convertDownload(raw: unknown): Record<string, any> | null {
  if (!isPlainObject(raw)) return null;

  const {
    address,
    network,
    security,
    tlsSettings,
    realitySettings,
    xhttpSettings,
    ...rest
  } = raw;

  // `network` is deliberately unused: it names the transport, and mihomo has no
  // field for it because `download-settings` is an XHTTP block by construction.
  void network;

  const result: Record<string, any> = convertKeys(rest);

  if (address !== undefined) result.server = address;
  // A word in Xray, a boolean in mihomo, and `none` is the only spelling of it
  // that means no TLS.
  if (security !== undefined) {
    result.tls = typeof security === 'string' && security !== '' && security !== 'none';
  }
  // The transport half, which mihomo keeps at this level rather than in a block.
  if (isPlainObject(xhttpSettings)) Object.assign(result, convertKeys(xhttpSettings));
  Object.assign(result, convertSecurity(tlsSettings, 'tls'));
  Object.assign(result, convertSecurity(realitySettings, 'reality'));

  return Object.keys(result).length > 0 ? result : null;
}

// The `extra=` parameter of a VLESS XHTTP link, as mihomo `xhttp-opts` fields.
//
// Anything that is not a JSON object is ignored rather than reported. The rest
// of the link still describes a perfectly good node, and failing the whole
// import over an advanced option is the worse trade — especially as a
// successful import has nowhere to show a warning.
export function xhttpOptsFromExtra(raw: string | null): Record<string, any> {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!isPlainObject(parsed)) return {};
  return convertKeys(parsed);
}
