// Clash/mihomo YAML subscription support.
//
// Plenty of subscription URLs do not answer with a list of `vless://` URIs at
// all: they answer with a whole Clash configuration, because the thing normally
// fetching them is a Clash client. Before this existed, such a response fell
// through to the URI parsers, which match on a `scheme://` prefix — so every one
// of the seven hundred lines in a typical config came back "No parser found for
// this URI format".
//
// Only the `proxies:` section is read here. The rest of the document — groups,
// rules, DNS — belongs to the editor's YAML import, which replaces the whole
// configuration and asks before it does. Fetching a subscription on the Proxies
// tab should add proxies, not quietly discard the rules you wrote.

import yaml from 'js-yaml';
import type { ProxyNode } from '../ir/types';
import { generateId } from '../ir/factory';
import type { ParseResult } from './types';

// What a Clash document holds that this module deliberately leaves behind, so
// the caller can say so rather than dropping it silently.
export interface IgnoredSections {
  proxyGroups: number;
  rules: number;
  ruleProviders: number;
  proxyProviders: number;
}

export interface ClashProxies {
  nodes: ProxyNode[];
  // One line per entry that could not be read. These are not fatal: a config
  // with one malformed proxy among twenty should import the nineteen.
  skipped: string[];
}

export interface ClashParseResult extends ParseResult {
  skipped: string[];
  ignored: IgnoredSections;
}

const NO_SECTIONS: IgnoredSections = {
  proxyGroups: 0,
  rules: 0,
  ruleProviders: 0,
  proxyProviders: 0,
};

function isMapping(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Parses `content` and returns it only if it is recognisably a Clash config.
//
// The keys are checked rather than just "is it a YAML mapping", because almost
// anything parses as YAML — a single line of plain text included. Without the
// check, a subscription that answered with an error page would be reported as a
// config holding no proxies instead of as unrecognised content.
function toClashDocument(content: string): Record<string, any> | null {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch {
    return null;
  }
  if (!isMapping(parsed)) return null;

  const hasClashSection =
    Array.isArray(parsed.proxies) ||
    Array.isArray(parsed['proxy-groups']) ||
    Array.isArray(parsed.rules) ||
    // A config whose nodes all come from subscriptions has none of the above.
    // It is still recognisably a Clash config, and saying so is what lets the
    // caller report the providers it is about to ignore.
    isMapping(parsed['proxy-providers']);

  return hasClashSection ? parsed : null;
}

export function looksLikeClashConfig(content: string): boolean {
  return toClashDocument(content) !== null;
}

/**
 * Map a Clash `proxies:` list onto IR nodes.
 *
 * Everything beyond name/type/server/port stays in `config` untouched, which is
 * what lets a protocol this app has no form for — `ssr`, `snell`, `wireguard` —
 * survive a round trip: the exporter copies those keys back out verbatim.
 */
export function proxyNodesFromClash(raw: unknown): ClashProxies {
  const nodes: ProxyNode[] = [];
  const skipped: string[] = [];

  if (raw === undefined || raw === null) return { nodes, skipped };
  if (!Array.isArray(raw)) {
    skipped.push('`proxies` is not a list');
    return { nodes, skipped };
  }

  raw.forEach((entry, index) => {
    const position = `proxy #${index + 1}`;

    if (!isMapping(entry)) {
      skipped.push(`${position}: not a mapping`);
      return;
    }

    const { name, type, server, port, ...config } = entry;

    // Rejected rather than defaulted. The previous mapping turned a nameless
    // entry into "Unnamed Proxy" on port 443 — a proxy that looks importable,
    // exports cleanly, and fails only once a client tries to dial it.
    if (typeof name !== 'string' || !name.trim()) {
      skipped.push(`${position}: no name`);
      return;
    }
    if (typeof type !== 'string' || !type.trim()) {
      skipped.push(`${name}: no type`);
      return;
    }

    // `http` is mihomo's HTTP/1.1 obfuscation over plain TCP, and this app does
    // not support it: there are no `http-opts` fields to edit it with, and
    // sing-box has no equivalent transport to export it to. Carried through, it
    // produced a node that looked editable, was not, and left the sing-box
    // export as a plain TCP outbound — wrong, and silently so.
    //
    // Deliberately stricter than the treatment of an unknown `type` below. That
    // is a protocol this app merely has no form for and hands back untouched;
    // this is a value it would actively mishandle.
    if (typeof config.network === 'string' && config.network.trim() === 'http') {
      skipped.push(
        `${name.trim()}: the \`http\` transport is not supported (use \`h2\` for HTTP/2)`
      );
      return;
    }

    // `type` is widened rather than validated against the IR union: mihomo
    // supports more protocols than this editor has forms for, and refusing to
    // import one would lose it on the next export. The list view falls back to
    // showing the raw type for anything it does not recognise.
    const node: ProxyNode = {
      id: generateId(),
      name: name.trim(),
      type: type.trim() as ProxyNode['type'],
      config,
    };

    // Both are optional in the IR — a `direct` outbound has neither.
    if (server !== undefined && server !== null && String(server) !== '') {
      node.server = String(server);
    }
    if (port !== undefined && port !== null && String(port) !== '') {
      const parsed = typeof port === 'number' ? port : parseInt(String(port), 10);
      if (Number.isFinite(parsed)) node.port = parsed;
    }

    nodes.push(node);
  });

  return { nodes, skipped };
}

/**
 * Read the proxies out of a Clash configuration document.
 */
export function parseClashYAML(content: string): ClashParseResult {
  const doc = toClashDocument(content);

  if (!doc) {
    return {
      success: false,
      nodes: [],
      errors: ['Not a Clash configuration'],
      skipped: [],
      ignored: NO_SECTIONS,
    };
  }

  const { nodes, skipped } = proxyNodesFromClash(doc.proxies);

  const ignored: IgnoredSections = {
    proxyGroups: Array.isArray(doc['proxy-groups']) ? doc['proxy-groups'].length : 0,
    rules: Array.isArray(doc.rules) ? doc.rules.length : 0,
    ruleProviders: isMapping(doc['rule-providers']) ? Object.keys(doc['rule-providers']).length : 0,
    // Worth counting even though nothing here reads it, because this is the
    // section that explains an otherwise baffling result: a config whose nodes
    // all live behind `proxy-providers:` has an empty `proxies:`, and would
    // come back as "contains no usable proxies" with nothing to suggest why.
    proxyProviders: isMapping(doc['proxy-providers'])
      ? Object.keys(doc['proxy-providers']).length
      : 0,
  };

  const errors = [...skipped];
  if (nodes.length === 0) {
    errors.unshift('This is a Clash configuration, but it contains no usable proxies');
  }

  return {
    success: nodes.length > 0,
    nodes,
    errors: errors.length > 0 ? errors : undefined,
    skipped,
    ignored,
  };
}
