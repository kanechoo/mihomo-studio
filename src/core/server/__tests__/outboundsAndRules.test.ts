import { describe, it, expect } from 'vitest';
import { ServerYamlExporter } from '../exporters/serverYaml';
import { importServerYaml } from '../importers/serverYaml';
import {
  createDefaultServerConfig,
  createListener,
  createServerOutbound,
  createServerRule,
} from '../factory';
import { validateServerConfig } from '../validation';

const exporter = new ServerYamlExporter();

// Requirement §16: the full chain UI → IR → YAML → (mihomo -t) must exist for
// outbounds and rules; these tests pin the YAML half of that chain.
describe('server outbounds & rules — yaml export', () => {
  it('emits proxies/rules in the documented example shape', () => {
    const config = createDefaultServerConfig();
    const direct = createServerOutbound('direct');
    direct.name = 'my-direct';
    const http = createServerOutbound('http');
    http.name = 'up-http';
    http.server = '10.0.0.2';
    http.port = 8080;
    const socks = createServerOutbound('socks5');
    socks.name = 'up-socks';
    socks.server = '10.0.0.3';
    socks.port = 1080;
    socks.udp = true;

    config.outbounds = [direct, http, socks];
    const suffix = createServerRule();
    suffix.type = 'DOMAIN-SUFFIX';
    suffix.payload = 'example.com';
    suffix.target = 'DIRECT';
    const reject = createServerRule();
    reject.type = 'DOMAIN';
    reject.payload = 'ads.example.com';
    reject.target = 'REJECT';
    const cidr = createServerRule();
    cidr.type = 'IP-CIDR';
    cidr.payload = '1.2.3.0/24';
    cidr.target = 'DIRECT';
    cidr.noResolve = true;
    const match = createServerRule();
    match.type = 'MATCH';
    match.payload = '';
    match.target = 'DIRECT';
    config.rules = [suffix, reject, cidr, match];

    const yaml = exporter.export(config);
    expect(yaml).toContain('proxies:');
    expect(yaml).toContain('- name: my-direct');
    expect(yaml).toContain('type: direct');
    expect(yaml).toContain('server: 10.0.0.2');
    expect(yaml).toContain('udp: true');
    // Rules render as one-line strings.
    expect(yaml).toContain('DOMAIN-SUFFIX,example.com,DIRECT');
    expect(yaml).toContain('DOMAIN,ads.example.com,REJECT');
    expect(yaml).toContain('IP-CIDR,1.2.3.0/24,DIRECT,no-resolve');
    expect(yaml).toContain('MATCH,DIRECT');
    // A MATCH rule must not grow a payload from an empty string.
    expect(yaml).not.toContain('MATCH,,');
  });

  it('omits empty proxies/rules sections entirely', () => {
    const yaml = exporter.export(createDefaultServerConfig());
    expect(yaml).not.toContain('proxies:');
    expect(yaml).not.toContain('rules:');
  });
});

describe('server outbounds & rules — import', () => {
  it('round-trips the requirement §16 example verbatim', () => {
    const source = [
      'listeners:',
      "  - name: mixed-in",
      '    type: mixed',
      "    port: '7890'",
      'proxies:',
      '  - name: my-direct',
      '    type: direct',
      'dns:',
      '  enable: false',
      'rules:',
      '  - DOMAIN-SUFFIX,example.com,direct',
      '  - DOMAIN,example.com,reject',
      '  - IP-CIDR,1.2.3.0/24,direct,no-resolve',
      '  - MATCH,direct',
    ].join('\n');

    const imported = importServerYaml(source);
    expect(imported.config!.outbounds).toHaveLength(1);
    expect(imported.config!.outbounds![0]).toMatchObject({
      type: 'direct',
      name: 'my-direct',
      enabled: true,
    });
    expect(imported.config!.rules).toHaveLength(4);
    expect(imported.config!.rules![2]).toMatchObject({
      type: 'IP-CIDR',
      payload: '1.2.3.0/24',
      target: 'direct',
      noResolve: true,
    });

    const exported = exporter.export(imported.config!);
    expect(exported).toContain('- name: my-direct');
    expect(exported).toContain('IP-CIDR,1.2.3.0/24,direct,no-resolve');
    expect(exported).not.toContain('noListeners');
  });

  it('keeps AND/OR payloads with commas intact through a round-trip', () => {
    const source = [
      'rules:',
      '  - AND,((DOMAIN,baidu.com),(NETWORK,UDP)),DIRECT',
    ].join('\n');
    const imported = importServerYaml(source);
    expect(imported.config!.rules![0]).toMatchObject({
      type: 'AND',
      payload: '((DOMAIN,baidu.com),(NETWORK,UDP))',
      target: 'DIRECT',
    });
    expect(exporter.export(imported.config!)).toContain(
      'AND,((DOMAIN,baidu.com),(NETWORK,UDP)),DIRECT'
    );
  });

  it('reports unsupported proxy kinds instead of half-importing them', () => {
    const source = [
      'proxies:',
      '  - name: future-thing',
      '    type: wireguard',
      '    server: wg.example.com',
    ].join('\n');
    const result = importServerYaml(source);
    expect(result.config!.outbounds).toHaveLength(0);
    expect(
      result.problems.some((p) => p.code === 'server.import.outboundIgnored')
    ).toBe(true);
  });
});

describe('routing validation', () => {
  function configWith(
    rules: ReturnType<typeof createServerRule>[],
    outbounds: ReturnType<typeof createServerOutbound>[] = [],
    listeners: ReturnType<typeof import('../factory').createListener>[] = []
  ) {
    const config = createDefaultServerConfig();
    config.rules = rules;
    config.outbounds = outbounds;
    config.listeners = listeners;
    return config;
  }

  it('accepts targets that resolve to built-ins or defined outbounds', () => {
    const upstream = createServerOutbound('socks5');
    upstream.name = 'up';
    upstream.server = 'a.b';
    upstream.port = 1080;
    const rule = createServerRule();
    rule.type = 'DOMAIN-SUFFIX';
    rule.payload = 'example.com';
    rule.target = 'up';
    const problems = validateServerConfig(configWith([rule], [upstream]));
    expect(problems.filter((p) => p.code.startsWith('server.problem.rule'))).toEqual([]);
  });

  it('flags unknown targets, missing payloads and duplicate outbound names', () => {
    const a = createServerOutbound('direct');
    a.name = 'same-name';
    const b = createServerOutbound('direct');
    b.name = 'same-name';
    const reserved = createServerOutbound('http');
    reserved.name = 'DIRECT';
    reserved.server = 'x';
    reserved.port = 80;

    const dangling = createServerRule();
    dangling.type = 'DOMAIN';
    dangling.payload = 'example.com';
    dangling.target = 'nowhere';
    const noPayload = createServerRule();
    noPayload.type = 'DST-PORT';
    noPayload.payload = '';
    noPayload.target = 'DIRECT';

    const problems = validateServerConfig(configWith([dangling, noPayload], [a, b, reserved]));
    const codes = problems.map((p) => p.code);
    expect(codes).toContain('server.problem.ruleTargetUnknown');
    expect(codes).toContain('server.problem.rulePayloadRequired');
    expect(codes).toContain('server.problem.outboundDuplicateName');
    expect(codes).toContain('server.problem.outboundReservedName');
  });

  it('warns when a listener proxy references nothing defined', () => {
    const listener = createListener('mixed');
    listener.proxy = 'ghost-outbound';
    const problems = validateServerConfig(configWith([], [], [listener]));
    expect(problems.some((p) => p.code === 'server.problem.listenerProxyUnknown')).toBe(true);
    // And resolves once the outbound exists.
    const upstream = createServerOutbound('http');
    upstream.name = 'ghost-outbound';
    upstream.server = 'h';
    upstream.port = 1;
    const clean = validateServerConfig(configWith([], [upstream], [listener]));
    expect(clean.some((p) => p.code === 'server.problem.listenerProxyUnknown')).toBe(false);
  });

  it('MATCH rules need no payload but still need a resolvable target', () => {
    const rule = createServerRule();
    rule.type = 'MATCH';
    rule.target = 'REJECT';
    const problems = validateServerConfig(configWith([rule]));
    expect(problems.filter((p) => p.severity === 'error')).toEqual([]);
  });
});
