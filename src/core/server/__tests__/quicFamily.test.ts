import { describe, it, expect } from 'vitest';
import { getListenerSchema } from '../../../schemas/listeners';
import { ServerYamlExporter, listenerToYamlNode } from '../exporters/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import { validateSemantic } from '../validation/semantic';
import type { ListenerIR } from '../types';

const exporter = new ServerYamlExporter();

function exportOf(listener: ListenerIR): string {
  return exporter.export({ ...createDefaultServerConfig(), listeners: [listener] });
}

describe('QUIC family registry', () => {
  it('distinguishes tuic v4/v5 schemas under one YAML type', () => {
    const v4 = getListenerSchema('tuic', 'v4')!;
    const v5 = getListenerSchema('tuic', 'v5')!;
    expect(v4.yamlType).toBe('tuic');
    expect(v5.yamlType).toBe('tuic');
    expect(v4.shareUri).toBe('supported');
    expect(v5.shareUri).toBe('supported');
    expect(v4.fields.some((f) => f.key === 'auth.token')).toBe(true);
    expect(v5.fields.some((f) => f.key === 'auth.users')).toBe(true);
    const uuidItem = v5.fields
      .find((f) => f.key === 'auth.users')
      ?.itemFields?.find((f) => f.key === 'username');
    expect(uuidItem?.generator).toBe('uuid');
  });

  it('marks hysteria2/tuic/shadowquic shareable and realm not', () => {
    expect(getListenerSchema('hysteria2')!.shareUri).toBe('supported');
    expect(getListenerSchema('hysteria2-realm')!.shareUri).toBe('unsupported');
    expect(getListenerSchema('shadowquic')!.shareUri).toBe('supported');
  });
});

describe('TUIC export split', () => {
  it('v4 exports a token list; v5 exports a UUID:PASSWORD map', () => {
    const v4 = createListener('tuic', 'v4');
    v4.name = 'tuicv4-in';
    v4.port = '10003';
    v4.auth.token = ['SECRET-A'];
    const v5 = createListener('tuic', 'v5');
    v5.name = 'tuicv5-in';
    v5.port = '10004';
    v5.auth = {
      mode: 'map',
      token: [],
      users: [{ username: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68', password: 'pw' }],
    };

    const nodeV4 = listenerToYamlNode(v4);
    const nodeV5 = listenerToYamlNode(v5);
    expect(nodeV4.type).toBe('tuic');
    expect(nodeV5.type).toBe('tuic');
    expect(nodeV4.token).toEqual(['SECRET-A']);
    expect(nodeV5.users).toEqual({
      '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68': 'pw',
    });
    expect(nodeV4).not.toHaveProperty('users');
    expect(nodeV5).not.toHaveProperty('token');

    const yaml = exporter.export({ ...createDefaultServerConfig(), listeners: [v4, v5] });
    expect(yaml).toContain('- name: tuicv4-in');
    expect(yaml).toContain('- name: tuicv5-in');
  });

  it('carries congestion/bbr-profile/idle/alpn/udp-packet keys kebab-case', () => {
    const v5 = createListener('tuic', 'v5');
    v5.protocol['congestion-controller'] = 'bbr';
    v5.protocol['bbr-profile'] = 'aggressive';
    const yaml = exportOf(v5);
    expect(yaml).toContain('congestion-controller: bbr');
    expect(yaml).toContain('bbr-profile: aggressive');
    expect(yaml).toContain('max-idle-time: 15000');
    expect(yaml).toContain('authentication-timeout: 1000');
    expect(yaml).toContain('max-udp-relay-packet-size: 1500');
  });
});

describe('Hysteria2 rules', () => {
  it('demands the certificate pair unconditionally', () => {
    const hy2 = createListener('hysteria2');
    expect(validateSemantic(hy2).map((p) => p.code)).toContain(
      'server.problem.hy2CertRequired'
    );

    hy2.tls.certificate = { source: 'path', value: './server.crt' };
    hy2.tls.privateKey = { source: 'path', value: './server.key' };
    expect(validateSemantic(hy2)).toHaveLength(0);
  });

  it('validates masquerade as file:// or http(s) URL only', () => {
    const hy2 = createListener('hysteria2');
    hy2.tls.certificate = { source: 'path', value: 'c' };
    hy2.tls.privateKey = { source: 'path', value: 'k' };

    hy2.protocol.masquerade = 'file:///var/www';
    expect(validateSemantic(hy2)).toHaveLength(0);
    hy2.protocol.masquerade = 'http://127.0.0.1:8080';
    expect(validateSemantic(hy2)).toHaveLength(0);
    hy2.protocol.masquerade = 'ftp://x';
    expect(validateSemantic(hy2).map((p) => p.code)).toContain(
      'server.problem.masqueradeInvalid'
    );
  });

  it('exports users map plus obfs coupling keys for the official example', () => {
    const hy2 = createListener('hysteria2');
    hy2.name = 'hy-in';
    hy2.port = '8443';
    hy2.auth = {
      mode: 'map',
      token: [],
      users: [
        { username: 'user1', password: 'password1' },
        { username: 'user2', password: 'password2' },
      ],
    };
    hy2.protocol.obfs = 'salamander';
    hy2.protocol['obfs-password'] = 'password';

    const node = listenerToYamlNode(hy2);
    expect(node.users).toEqual({ user1: 'password1', user2: 'password2' });
    expect(node.obfs).toBe('salamander');
    expect(node['obfs-password']).toBe('password');
  });
});

describe('Hysteria2 Realm identity and rules', () => {
  it('exports the scalar bearer token, not a token list', () => {
    const realm = createListener('hysteria2-realm');
    realm.name = 'realm-in';
    realm.protocol.token = 'public';
    const yaml = exportOf(realm);
    expect(yaml).toContain('token: public');
    expect(yaml).not.toMatch(/token:\s*\n/);

    const node = listenerToYamlNode(realm);
    expect(node.type).toBe('hysteria2-realm');
    expect(node.token).toBe('public');
  });

  it('rejects an invalid realm-name regex and an invalid realm server-url', () => {
    const realm = createListener('hysteria2-realm');
    realm.protocol['realm-name-pattern'] = '[';
    realm.protocol['realm-opts'] = { enable: true, 'server-url': 'notaurl' };
    const codes = validateSemantic(realm).map((p) => p.code);
    expect(codes).toContain('server.problem.realmPatternInvalid');
    expect(codes).toContain('server.problem.realmServerUrlInvalid');
  });
});

describe('ShadowQUIC export shape', () => {
  it('emits jls-upstream and quic knobs with official kebab keys', () => {
    const sq = createListener('shadowquic');
    sq.name = 'shadowquic-in';
    sq.port = '10822';
    sq.protocol['jls-upstream'] = {
      addr: 'www.example.com:443',
      sni: 'example.com',
      'rate-limit': 0,
    };
    sq.protocol['quic-versions'] = ['v1'];
    sq.protocol['zero-rtt'] = true;
    sq.protocol['recv-window-conn'] = 0;
    sq.protocol['disable-mtu-discovery'] = false;

    const yaml = exportOf(sq);
    expect(yaml).toContain('jls-upstream:');
    expect(yaml).toContain('addr: www.example.com:443');
    expect(yaml).toContain('quic-versions:');
    expect(yaml).toContain('- v1');
    expect(yaml).toContain('zero-rtt: true');
    expect(yaml).toContain('recv-window-conn: 0');
    expect(yaml).toContain('disable-mtu-discovery: false');
    expect(yaml).toContain('cwnd: 32');
  });

  it('keeps shadowquic free of certificate requirements', () => {
    const sq = createListener('shadowquic');
    expect(validateSemantic(sq)).toHaveLength(0);
  });
});
