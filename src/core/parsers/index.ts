// Parser registry and utilities
import type { IParser, ParseResult } from './types';
import { VlessURIParser } from './vless';
import { Hysteria2URIParser } from './hysteria2';
import { TuicURIParser } from './tuic';
import { TrojanURIParser } from './trojan';
import { looksLikeClashConfig, parseClashYAML } from './clash';

// Registry of all available parsers
const parsers: IParser[] = [
  new VlessURIParser(),
  new Hysteria2URIParser(),
  new TuicURIParser(),
  new TrojanURIParser(),
];

// How many *distinct* failures are worth reading. The rest are counted.
const MAX_DISTINCT_ERRORS = 5;

// Anything with a scheme. Used only to tell "these are URIs, some of which are
// unsupported" from "this is not a list of URIs at all", which want different
// messages.
const URI_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

const NOT_A_SUBSCRIPTION =
  'Content is not a recognised subscription: expected proxy URIs, a base64-encoded ' +
  'list of them, or a Clash/mihomo YAML configuration';

const CLASH_CONFIG_HINT =
  'This is a Clash/mihomo configuration rather than a list of proxy URIs. ' +
  'Import it from Import Subscription, or from the editor pane if you want the whole file';

/**
 * Parse a single URI and return the result
 */
export async function parseURI(uri: string): Promise<ParseResult> {
  const trimmedUri = uri.trim();

  // Find a parser that can handle this URI
  const parser = parsers.find((p) => p.canParse(trimmedUri));

  if (!parser) {
    return {
      success: false,
      nodes: [],
      errors: ['No parser found for this URI format'],
    };
  }

  return parser.parse(trimmedUri);
}

/**
 * Collapse a per-line error list into something a human can read.
 *
 * One error per input line is the right thing to *produce* — the caller may want
 * to know which line — but not the right thing to show: feeding a 700-line
 * document to the URI parsers yields 700 copies of one sentence, which is what
 * the modal used to join with commas and render as a wall of text.
 */
function summarizeErrors(errors: string[]): string[] {
  const counts = new Map<string, number>();
  errors.forEach((message) => counts.set(message, (counts.get(message) ?? 0) + 1));

  const collapsed = Array.from(counts.entries()).map(([message, count]) =>
    count > 1 ? `${message} (×${count})` : message
  );

  if (collapsed.length <= MAX_DISTINCT_ERRORS) return collapsed;

  const shown = collapsed.slice(0, MAX_DISTINCT_ERRORS);
  shown.push(`…and ${collapsed.length - MAX_DISTINCT_ERRORS} more`);
  return shown;
}

/**
 * Parse multiple URIs (one per line) and return combined results
 */
export async function parseBatchURIs(content: string): Promise<ParseResult> {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')); // Filter empty lines and comments

  if (lines.length === 0) {
    return {
      success: false,
      nodes: [],
      errors: ['No valid URIs found'],
    };
  }

  const results = await Promise.all(lines.map((line) => parseURI(line)));

  const allNodes = results.flatMap((r) => r.nodes);
  const allErrors = results
    .filter((r) => !r.success)
    .flatMap((r) => r.errors || []);

  // Nothing parsed and nothing even looked like a URI: the input is some other
  // kind of document, and saying which formats are accepted is more use than
  // repeating a per-line complaint about every one of its lines.
  if (allNodes.length === 0 && !lines.some((line) => URI_LIKE.test(line))) {
    return {
      success: false,
      nodes: [],
      errors: [looksLikeClashConfig(content) ? CLASH_CONFIG_HINT : NOT_A_SUBSCRIPTION],
    };
  }

  return {
    success: allNodes.length > 0,
    nodes: allNodes,
    errors: allErrors.length > 0 ? summarizeErrors(allErrors) : undefined,
  };
}

// Base64 with both alphabets, optionally padded. Whitespace is stripped before
// this runs, so a multi-line blob still matches.
const BASE64_ONLY = /^[A-Za-z0-9+/\-_]+={0,2}$/;

/**
 * Decode a base64 subscription body, or return the input unchanged.
 *
 * `atob` alone was not enough on three counts. It rejects the URL-safe alphabet
 * that several providers use; it is particular about padding; and it returns one
 * character per byte, so a UTF-8 node name — anything with Chinese characters or
 * a flag emoji, which is most of them — arrived mangled. The bytes are handed to
 * TextDecoder instead, in fatal mode so that a blob which merely *looks* like
 * base64 and decodes to binary is left alone rather than replaced with garbage.
 */
export function decodeBase64Subscription(content: string): string {
  const compact = content.replace(/\s+/g, '');
  if (!compact || !BASE64_ONLY.test(compact)) return content;

  let normalized = compact.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const remainder = normalized.length % 4;
  if (remainder === 1) return content; // no valid base64 has this length
  if (remainder > 0) normalized += '='.repeat(4 - remainder);

  try {
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return content;
  }
}

/**
 * Parse subscription content: a Clash configuration, a list of proxy URIs, or
 * either of those wrapped in base64.
 */
export async function parseSubscription(content: string): Promise<ParseResult> {
  try {
    // Decoding first rather than last, so that the classification below sees the
    // real document either way — base64-wrapped Clash configs exist.
    const text = decodeBase64Subscription(content.trim());

    if (looksLikeClashConfig(text)) return parseClashYAML(text);

    return parseBatchURIs(text);
  } catch (error) {
    return {
      success: false,
      nodes: [],
      errors: [error instanceof Error ? error.message : 'Failed to parse subscription'],
    };
  }
}

// Export parsers for individual use if needed
export { VlessURIParser, Hysteria2URIParser, TuicURIParser, TrojanURIParser };
export { looksLikeClashConfig, parseClashYAML, proxyNodesFromClash } from './clash';
export type { ClashParseResult, ClashProxies, IgnoredSections } from './clash';
export type { IParser, ParseResult } from './types';
