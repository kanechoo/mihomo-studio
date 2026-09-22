// Whole-document share aggregation: every convertible listener on a server
// config turned into client `proxies:` entries and emitted as one fragment.
//
// This is the collection layer the single-listener share never needed —
// generateProxyShare converts one listener for one address and identity; a
// link that represents the whole config has to walk them all. The converters
// themselves are exactly the ones the listener modal uses (CONVERTERS), so a
// protocol converts identically no matter which surface shares it.
import type { ServerConfigIR } from '../types';
import { CONVERTERS } from './converters';
import { dumpProxiesYaml, endpointOf } from './common';

export interface ClientProxiesShare {
  /** A `proxies:` YAML fragment covering every convertible listener. */
  yaml: string;
  /** i18n codes for everything the reader should know about; deduplicated. */
  warnings: string[];
  nodeCount: number;
  skippedCount: number;
}

// One node per enabled listener, carrying its first usable credential under
// the listener's own name — "the config's proxies" in the plainest reading.
// Per-identity fragments stay available through the per-listener share modal,
// where naming every row is part of that UI's job.
export function generateClientProxiesShare(config: ServerConfigIR): ClientProxiesShare {
  // One link, one address: the document's first Server entry. The listener
  // modal remains the place to hand out per-address rows.
  const host = config.servers?.[0]?.trim() ?? '';

  const warnings: string[] = [];
  const seen = new Set<string>();
  const warn = (code: string) => {
    if (!seen.has(code)) {
      seen.add(code);
      warnings.push(code);
    }
  };

  if (host === '') warn('server.share.missingHost');

  const nodes: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const listener of config.listeners) {
    if (!listener.enabled) continue;

    const converter = CONVERTERS[listener.type];
    if (!converter) {
      skipped++;
      warn('server.share.unsupported');
      continue;
    }
    // Mekya is polled by the client over an HTTP URL the inbound model simply
    // does not contain; there is no honest way to synthesize one.
    if (listener.type === 'vmess' && listener.transport.kind === 'mekya') {
      skipped++;
      warn('server.share.unsupportedMekya');
      continue;
    }
    // AnyTLS explicitly excludes REALITY upstream — the combination would
    // produce a node no client can dial.
    if (
      listener.type === 'anytls' &&
      (listener.tls.mode === 'reality' || listener.tls.mode === 'tlsmirror')
    ) {
      skipped++;
      warn('server.share.anytlsRealityUnsupported');
      continue;
    }

    const { host: address, warnings: hostWarnings } = endpointOf(listener, host);
    for (const code of hostWarnings) warn(code);
    if (!address) {
      skipped++;
      continue;
    }

    nodes.push(converter(listener, { host: address, warnings }, undefined));
  }

  return { yaml: dumpProxiesYaml(nodes), warnings, nodeCount: nodes.length, skippedCount: skipped };
}
