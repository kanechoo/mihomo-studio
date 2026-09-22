import { describe, it, expect } from 'vitest';
import { getListenerSchema, availableListenerSchemas } from '../../../schemas/listeners';
import { ServerYamlExporter } from '../exporters/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import { validateSemantic } from '../validation/semantic';
import { validateCommonSyntax } from '../validation/syntax';

const exporter = new ServerYamlExporter();

describe('simple protocol registry entries', () => {
  it('registers all six simple listeners with capability metadata', () => {
    for (const kind of ['http', 'socks', 'mixed', 'redir', 'tproxy', 'tunnel'] as const) {
      const schema = getListenerSchema(kind);
      expect(schema).toBeDefined();
      expect(schema!.docUrl).toMatch(new RegExp(`/${kind === 'redir' ? 'redirect' : kind}/$`));
      expect(schema!.lastVerifiedAt).toBe('2026-08-25');
      expect(schema!.shareUri).toBe('unsupported');
    }

    expect(getListenerSchema('socks')!.capability.udp).toBe(true);
    expect(getListenerSchema('mixed')!.supportsUdpField).toBe(true);
    expect(getListenerSchema('http')!.capability.tls).toBe(true);
    expect(getListenerSchema('redir')!.capability.udp).toBe(false);
    expect(availableListenerSchemas().length).toBeGreaterThanOrEqual(6);
  });

  it('binds the port field as a port-expression and marks tunnel target required', () => {
    const tunnel = getListenerSchema('tunnel')!;
    const portField = tunnel.fields.find((f) => f.key === 'port');
    const target = tunnel.fields.find((f) => f.key === 'protocol.target');
    expect(portField?.type).toBe('port-expression');
    expect(target?.required).toBe(true);
    expect(tunnel.fields.some((f) => f.key === 'auth.users')).toBe(false);

    const socks = getListenerSchema('socks')!;
    expect(socks.fields.some((f) => f.key === 'auth.users')).toBe(true);
    expect(socks.fields.some((f) => f.key === 'protocol.udp')).toBe(true);
  });
});

describe('simple protocol export shapes', () => {
  it('exports redir as the minimal common-fields-only listener', () => {
    const redir = createListener('redir');
    redir.name = 'redir-in';
    redir.port = '7893';
    redir.auth.mode = 'none';
    const yaml = exporter.export({ ...createDefaultServerConfig(), listeners: [redir] });
    expect(yaml).toBe(
      [
        'mixed-port: 7890',
        'mode: rule',
        'allow-lan: false',
        'log-level: info',
        'ipv6: false',
        'listeners:',
        '  - name: redir-in',
        '    type: redir',
        "    port: '7893'",
        '    listen: 0.0.0.0',
        '',
      ].join('\n')
    );
  });

  it('exports tproxy with udp flag and tunnel with network+target', () => {
    const tproxy = createListener('tproxy');
    tproxy.name = 'tproxy-in';
    tproxy.port = '7894';
    const tunnel = createListener('tunnel');
    tunnel.name = 'tunnel-in';
    tunnel.port = '10816';
    tunnel.protocol.target = 'target.com';

    const config = createDefaultServerConfig();
    config.listeners = [tproxy, tunnel];
    const yaml = exporter.export(config);

    expect(yaml).toContain('- name: tproxy-in');
    expect(yaml).toContain('udp: true');
    expect(yaml).toContain('network:');
    expect(yaml).toContain('- tcp');
    expect(yaml).toContain('- udp');
    expect(yaml).toContain('target: target.com');
  });

  it('emits users: [] semantics for an explicit empty list (auth skip)', () => {
    const http = createListener('http');
    http.name = 'open-http';
    http.port = '7890';
    http.auth = { mode: 'list', token: [], users: [] };
    // authToYaml treats an explicit empty list as nothing to emit; mihomo then
    // falls back to global auth, so the UI must surface that — validated below
    const node = exporter.export({ ...createDefaultServerConfig(), listeners: [http] });
    expect(node).not.toContain('users:');
  });
});

describe('simple protocol semantic rules (L4)', () => {
  it('warns on public plaintext bind without auth for app-proxy listeners', () => {
    const http = createListener('http');
    http.tls.mode = 'none';
    const problems = validateSemantic(http);
    expect(problems.map((p) => p.code)).toEqual(
      expect.arrayContaining(['server.problem.plaintextPublicNoAuth'])
    );
  });

  it('reports global-auth fallback as info for inherit mode', () => {
    const mixed = createListener('mixed');
    const codes = validateSemantic(mixed).map((p) => p.code);
    expect(codes).toContain('server.problem.globalAuthFallback');
  });

  it('downgrades to bind-only warning once auth is explicitly configured', () => {
    const socks = createListener('socks');
    socks.tls.mode = 'none';
    socks.auth = { mode: 'list', token: [], users: [{ username: 'u', password: 'p' }] };
    const codes = validateSemantic(socks).map((p) => p.code);
    expect(codes).toContain('server.problem.plaintextPublicBind');
    expect(codes).not.toContain('server.problem.plaintextPublicNoAuth');
    expect(codes).not.toContain('server.problem.globalAuthFallback');
  });

  it('keeps only the informational fallback note on loopback binds', () => {
    const http = createListener('http');
    http.listen = '127.0.0.1';
    const problems = validateSemantic(http);
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe('info');
    expect(problems[0].code).toBe('server.problem.globalAuthFallback');
  });

  it('requires tunnel target and a valid non-empty network list', () => {
    const tunnel = createListener('tunnel');
    tunnel.protocol.network = [];
    const problems = validateSemantic(tunnel);
    expect(problems.map((p) => p.code)).toContain('server.problem.targetRequired');
    expect(problems.map((p) => p.code)).toContain('server.problem.networkRequired');

    tunnel.protocol.target = 'target.com';
    tunnel.protocol.network = ['tcp', 'ssh'];
    expect(validateSemantic(tunnel).map((p) => p.code)).toContain(
      'server.problem.networkInvalid'
    );

    tunnel.protocol.network = ['tcp'];
    expect(validateSemantic(tunnel)).toHaveLength(0);
  });

  it('keeps transparent protocols free of app-proxy warnings', () => {
    const tproxy = createListener('tproxy');
    expect(validateSemantic(tproxy)).toHaveLength(0);
    const redir = createListener('redir');
    expect(validateSemantic(redir)).toHaveLength(0);
  });

  it('flags common-header syntax problems through the L1 pass', () => {
    const bad = createListener('http');
    bad.name = '';
    bad.listen = '999.1.1.1';
    bad.port = '70000';
    const problems = validateCommonSyntax(bad);
    expect(problems.map((p) => p.code)).toEqual([
      'server.problem.nameRequired',
      'server.problem.listenInvalid',
      'server.problem.portBounds',
    ]);
  });
});
