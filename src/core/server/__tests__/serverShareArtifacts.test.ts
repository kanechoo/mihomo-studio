import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { importServerYaml } from '../importers/serverYaml';
import type { ServerConfigIR } from '../types';
import { computeServerRenderedArtifacts } from '../share/artifacts';

// ============= Save-time share artifacts =============
//
// The Go server serves these strings verbatim through /share/:token, so each
// one must be valid, complete, and semantically identical to the document the
// editor holds. These are the same guarantees the endpoint's visitors rely on.

const SOURCE = `servers:
  - example.com
listeners:
  - name: edge
    type: vless
    port: 8443
    listen: 0.0.0.0
    users:
      - username: alice
        uuid: 9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68
        flow: xtls-rprx-vision
    xhttp-config:
      path: /xp
      mode: stream-one
    reality-config:
      dest: www.example.com:443
      private-key: 4F1tdMacqmYhdMkiVwtAkyC9BxCzP6SbLKQJeHN-fV0
      short-id:
        - 0123abcd
      server-names:
        - www.example.com
`;

function irOf(source: string) {
  const result = importServerYaml(source);
  expect(result.problems.filter((p) => p.severity === 'error')).toEqual([]);
  // `servers` is profile metadata the editor document carries but the importer
  // leaves alone (it reports topLevelIgnored); a saved document always has it.
  return { ...result.config!, servers: ['example.com'] };
}

describe('computeServerRenderedArtifacts', () => {
  it('produces a parseable full-server document that keeps every field', () => {
    const ir = irOf(SOURCE);
    const { rendered_server_yaml } = computeServerRenderedArtifacts(ir);

    // It must BE YAML, not JSON wearing a .yaml name.
    expect(rendered_server_yaml.trim().startsWith('{')).toBe(false);
    const parsed = yaml.load(rendered_server_yaml) as Record<string, any>;
    expect(Object.keys(parsed)).toContain('listeners');

    const listener = parsed.listeners[0];
    // Round-trip of the semantics the editor held: identity, transport,
    // security — types intact. Port stays a string, exactly as the editor
    // preview renders it (mihomo accepts both spellings; the artifact must
    // match the preview byte for byte).
    expect(listener.name).toBe('edge');
    expect(listener.type).toBe('vless');
    expect(listener.port).toBe('8443');
    expect(listener.listen).toBe('0.0.0.0');
    expect(listener.users[0].uuid).toBe('9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68');
    expect(listener.users[0].username).toBe('alice');
    expect(listener['xhttp-config'].path).toBe('/xp');
    expect(listener['reality-config'].dest).toBe('www.example.com:443');
    expect(listener['reality-config']['short-id']).toEqual(['0123abcd']);
    expect(listener['reality-config']['server-names']).toEqual(['www.example.com']);
  });

  it('produces a parseable proxies fragment for the convertible listeners', () => {
    const ir = irOf(SOURCE);
    const { rendered_client_proxies } = computeServerRenderedArtifacts(ir);

    const parsed = yaml.load(rendered_client_proxies) as { proxies: Record<string, any>[] };
    expect(Array.isArray(parsed.proxies)).toBe(true);
    expect(parsed.proxies).toHaveLength(1);
    expect(parsed.proxies[0]).toMatchObject({
      name: 'edge',
      type: 'vless',
      server: 'example.com',
      port: 8443,
      uuid: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68',
      network: 'xhttp',
    });
  });

  it('renders an empty document as explicit empty sections, never nulls', () => {
    const empty: ServerConfigIR = {
      schemaVersion: 1,
      general: { mode: 'rule' },
      dns: { enable: false },
      listeners: [],
      servers: ['example.com'],
    };
    const { rendered_server_yaml, rendered_client_proxies } =
      computeServerRenderedArtifacts(empty);

    // Both artifacts stay parseable with unambiguous shapes.
    const parsedProxies = yaml.load(rendered_client_proxies) as { proxies: unknown[] };
    expect(Array.isArray(parsedProxies.proxies)).toBe(true);
    expect(() => yaml.load(rendered_server_yaml)).not.toThrow();
  });
});
