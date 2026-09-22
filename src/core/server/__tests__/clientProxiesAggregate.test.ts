import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { importServerYaml } from '../importers/serverYaml';
import { deriveRealityPublicKey } from '../../shared/generators/reality';
import { generateClientProxiesShare } from '../share/aggregate';
import type { ListenerIR, ServerConfigIR } from '../types';

// ============= Whole-document share aggregation =============
//
// A server-config share link represents the whole resource, so its client
// payload must carry every convertible listener — not one. These tests build
// documents out of the per-protocol golden fixtures (the same inputs the
// listener-share goldens use) and assert on the aggregated `proxies:` output.

function fixtureDir(protocol: string) {
  return fileURLToPath(new URL(`./testdata/${protocol}`, import.meta.url));
}

function fixtureDocument(protocol: string): ServerConfigIR {
  const serverYaml = readFileSync(fixtureDir(`${protocol}/server.yaml`), 'utf8');
  const result = importServerYaml(serverYaml);
  expect(result.problems.filter((p) => p.severity === 'error')).toEqual([]);
  // The editor derives and stores the REALITY public half whenever the private
  // half is written; shares render through that same write path.
  for (const listener of result.config!.listeners) {
    const reality = listener.tls.reality;
    if (reality?.privateKey && !reality.publicKey) {
      reality.publicKey = deriveRealityPublicKey(reality.privateKey);
    }
  }
  return result.config!;
}

// One document holding a listener from each of three protocols — the brief's
// VLESS + Trojan + Hysteria2 example.
function mergedDocument(): ServerConfigIR {
  const listeners: ListenerIR[] = [
    ...fixtureDocument('vless').listeners,
    ...fixtureDocument('trojan').listeners,
    ...fixtureDocument('hysteria2').listeners,
  ];
  return {
    schemaVersion: 1,
    general: { mode: 'rule' },
    dns: { enable: false },
    listeners,
    servers: ['example.com'],
  };
}

describe('client proxies share aggregation', () => {
  it('aggregates one node per convertible listener across protocols', () => {
    const result = generateClientProxiesShare(mergedDocument());

    expect(result.nodeCount).toBe(3);
    expect(result.skippedCount).toBe(0);

    const parsed = yaml.load(result.yaml) as { proxies: Record<string, unknown>[] };
    expect(Array.isArray(parsed.proxies)).toBe(true);
    expect(parsed.proxies).toHaveLength(3);

    // The listener's own names, in list order.
    expect(parsed.proxies.map((node) => node.name)).toEqual([
      'vless-node',
      'trojan-node',
      'hy2-node',
    ]);

    for (const node of parsed.proxies) {
      // Every node is dialable in principle: identity fields at minimum.
      expect(node.type).toEqual(expect.any(String));
      expect(node.server).toBe('example.com');
      expect(node.port).toEqual(expect.any(Number));
      expect(String(node.port)).not.toBe('');
    }
  });

  it('keeps protocol-specific fields intact through aggregation', () => {
    const result = generateClientProxiesShare(mergedDocument());
    const nodes = (yaml.load(result.yaml) as { proxies: Record<string, any>[] }).proxies;
    const [vless, trojan, hysteria2] = nodes;

    // VLESS: credential, flow and the XHTTP transport block survive; REALITY
    // travels as the client-side reality-opts pair.
    expect(vless.uuid).toEqual(expect.any(String));
    expect(vless.flow).toBe('xtls-rprx-vision');
    expect(vless.network).toBe('xhttp');
    expect(vless['xhttp-opts']).toEqual(expect.any(Object));
    expect(vless['xhttp-opts'].path).toBe('/xp');
    expect(vless['reality-opts']['public-key']).toEqual(expect.any(String));

    // Trojan keeps its password and SNI without any tls: flag.
    expect(trojan.password).toEqual(expect.any(String));
    expect(trojan.sni).toEqual(expect.any(String));

    // Hysteria2 keeps auth plus bandwidth negotiation fields.
    expect(hysteria2.password).toEqual(expect.any(String));
    expect(hysteria2.up).toBeDefined();
  });

  it('emits no server-only keys into the shared fragment', () => {
    const result = generateClientProxiesShare(mergedDocument());
    const nodes = (yaml.load(result.yaml) as { proxies: Record<string, any>[] }).proxies;

    for (const node of nodes) {
      // Inbound-only plumbing: where the server listens, how it labels itself
      // internally, and its certificate material never belong on the client.
      for (const key of ['listen', 'proxy', 'certificate', 'private-key', 'decryption']) {
        expect(node[key]).toBeUndefined();
      }
    }
  });

  it('skips disabled listeners', () => {
    const doc = mergedDocument();
    doc.listeners[1] = { ...doc.listeners[1], enabled: false };

    const result = generateClientProxiesShare(doc);
    expect(result.nodeCount).toBe(2);
    const parsed = yaml.load(result.yaml) as { proxies: Record<string, unknown>[] };
    expect(parsed.proxies.map((node) => node.name)).not.toContain('trojan-node');
  });

  it('skips listeners with no client model instead of failing the share', () => {
    const doc = mergedDocument();
    doc.listeners.push({
      ...doc.listeners[0],
      id: 'unsupported',
      name: 'plain-http',
      // An HTTP proxy inbound has no client outbound counterpart to become.
      type: 'http',
    });

    const result = generateClientProxiesShare(doc);
    expect(result.nodeCount).toBe(3);
    expect(result.skippedCount).toBe(1);
    expect(result.warnings).toContain('server.share.unsupported');

    const parsed = yaml.load(result.yaml) as { proxies: Record<string, unknown>[] };
    expect(parsed.proxies.map((node) => node.name)).not.toContain('plain-http');
  });

  it('returns an explicit empty list when nothing is convertible', () => {
    const empty: ServerConfigIR = {
      schemaVersion: 1,
      general: { mode: 'rule' },
      dns: { enable: false },
      listeners: [],
      servers: ['example.com'],
    };

    const result = generateClientProxiesShare(empty);
    expect(result.nodeCount).toBe(0);
    // Valid YAML with an unambiguous shape — never a bare `proxies:` key with
    // nothing under it.
    expect(result.yaml.trim()).toBe('proxies: []');
    const parsed = yaml.load(result.yaml) as { proxies: unknown[] };
    expect(Array.isArray(parsed.proxies)).toBe(true);
    expect(parsed.proxies).toHaveLength(0);
  });

  it('warns when the document carries no Server address', () => {
    const doc = mergedDocument();
    doc.servers = [];

    const result = generateClientProxiesShare(doc);
    expect(result.warnings).toContain('server.share.missingHost');
  });
});
