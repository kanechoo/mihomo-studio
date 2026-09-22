import { describe, it, expect } from 'vitest';
import { getListenerSchema } from '../../../schemas/listeners';
import { ServerYamlExporter, listenerToYamlNode } from '../exporters/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import { validateSemantic } from '../validation/semantic';
import { looksLikeDecryptionConfig } from '../validation/semantic/encrypted';
import type { ListenerIR } from '../types';

const exporter = new ServerYamlExporter();

function exportOf(listener: ListenerIR): string {
  return exporter.export({ ...createDefaultServerConfig(), listeners: [listener] });
}

describe('encrypted trio registry entries', () => {
  it('declares official capabilities and share-URI support', () => {
    const vless = getListenerSchema('vless')!;
    const vmess = getListenerSchema('vmess')!;
    const trojan = getListenerSchema('trojan')!;

    for (const schema of [vless, vmess, trojan]) {
      expect(schema.category).toBe('encrypted');
      expect(schema.capability.tls).toBe(true);
      expect(schema.capability.reality).toBe(true);
      expect(schema.capability.mtls).toBe(true);
      expect(schema.capability.ech).toBe(true);
      expect(schema.shareUri).toBe('supported');
    }

    expect(vless.capability.xhttp).toBe(true);
    expect(vmess.capability.xhttp).toBe(false);
    expect(trojan.capability.xhttp).toBe(false);
    expect(trojan.fields.some((f) => f.key === 'transport.kind')).toBe(true);
    const vmessKind = vmess.fields.find((f) => f.key === 'transport.kind')!;
    expect(vmessKind.options?.map((o) => o.value)).toEqual([
      'tcp',
      'ws',
      'grpc',
      'mekya',
      'mkcp',
    ]);
  });

  it('binds per-protocol auth shapes', () => {
    const items = (kind: 'vless' | 'vmess' | 'trojan') =>
      getListenerSchema(kind)!
        .fields.find((f) => f.key === 'auth.users')
        ?.itemFields?.map((f) => f.key);

    expect(items('vless')).toEqual(['username', 'uuid', 'flow']);
    expect(items('vmess')).toEqual(['username', 'uuid', 'alterId']);
    expect(items('trojan')).toEqual(['username', 'password']);
  });
});

describe('VLESS', () => {
  it('exports the full xhttp-config block with deep kebab keys', () => {
    const vless = createListener('vless');
    vless.name = 'vless-xhttp';
    vless.port = '443';
    vless.transport = {
      kind: 'xhttp',
      xhttp: {
        path: '/xhttp',
        mode: 'stream-one',
        noSseHeader: true,
        xPaddingBytes: '100-1000',
        xPaddingPlacement: 'queryInHeader',
        uplinkHttpMethod: 'POST',
        sessionTable: 'uuid',
        sessionLength: '16-32',
        scMaxEachPostBytes: 1000000,
      },
    };
    vless.protocol['allow-insecure'] = true;

    const node = listenerToYamlNode(vless);
    expect(node['xhttp-config']).toMatchObject({
      path: '/xhttp',
      mode: 'stream-one',
      'no-sse-header': true,
      'x-padding-bytes': '100-1000',
      'x-padding-placement': 'queryInHeader',
      'uplink-http-method': 'POST',
      'session-table': 'uuid',
      'session-length': '16-32',
      'sc-max-each-post-bytes': 1000000,
    });
  });

  it('requires a security layer unless allow-insecure is true (six-alternative matrix)', () => {
    const bare = createListener('vless');
    expect(validateSemantic(bare).map((p) => p.code)).toContain(
      'server.problem.insecureLayerRequired'
    );

    const insecure = createListener('vless');
    insecure.protocol['allow-insecure'] = true;
    expect(validateSemantic(insecure)).toHaveLength(0);

    const reality = createListener('vless');
    reality.tls.mode = 'reality';
    reality.tls.reality = {
      dest: 'test.com:443',
      privateKey: 'rk',
      shortIds: ['01'],
      serverNames: ['test.com'],
    };
    expect(validateSemantic(reality).map((p) => p.code)).not.toContain(
      'server.problem.insecureLayerRequired'
    );

    const decrypted = createListener('vless');
    decrypted.protocol.decryption = 'mlkem768x25519plus.native/xorpub/random.600s(k1)(k2)';
    expect(validateSemantic(decrypted).map((p) => p.code)).not.toContain(
      'server.problem.insecureLayerRequired'
    );
  });

  it('rejects zero-start session lengths once a session table is selected', () => {
    const vless = createListener('vless');
    vless.transport = {
      kind: 'xhttp',
      xhttp: { sessionTable: 'hex', sessionLength: '0-32' },
    };
    expect(validateSemantic(vless).map((p) => p.code)).toContain(
      'server.problem.xhttpSessionLengthZero'
    );

    vless.transport.xhttp!.sessionLength = '16-32';
    expect(validateSemantic(vless).map((p) => p.code)).not.toContain(
      'server.problem.xhttpSessionLengthZero'
    );
  });

  it('recognises composite decryption strings weakly', () => {
    expect(looksLikeDecryptionConfig('mlkem768x25519plus.native/xorpub/random.600s(a)(b)')).toBe(true);
    expect(looksLikeDecryptionConfig('none')).toBe(false);
    expect(looksLikeDecryptionConfig('')).toBe(false);
  });
});

describe('VMess', () => {
  it('exports mekya-config derived from the transport kind with kcp sub-block kebabed', () => {
    const vmess = createListener('vmess');
    vmess.name = 'vmess-mekya';
    vmess.port = '10814';
    vmess.protocol['allow-insecure'] = true;
    vmess.transport = {
      kind: 'mekya',
      mekyaConfig: {
        enable: true,
        maxWriteSize: 10485760,
        kcp: { mtu: 1350, header: 'srtp', seed: 's' },
      },
    };

    const node = listenerToYamlNode(vmess);
    expect(node['mekya-config']).toEqual({
      enable: true,
      'max-write-size': 10485760,
      kcp: { mtu: 1350, header: 'srtp', seed: 's' },
    });
    expect(node).not.toHaveProperty('ws-path');
    expect(node).not.toHaveProperty('mkcp-config');
  });

  it('exports mkcp-config when the kind switches to mkcp', () => {
    const vmess = createListener('vmess');
    vmess.protocol['allow-insecure'] = true;
    vmess.transport = { kind: 'mkcp', mkcpConfig: { enable: true, tti: 50 } };
    expect(listenerToYamlNode(vmess)['mkcp-config']).toEqual({ enable: true, tti: 50 });
  });

  it('exports tlsmirror-config and omits certificate pair in tlsmirror mode', () => {
    const vmess = createListener('vmess');
    vmess.name = 'vmess-mirror';
    vmess.tls = {
      mode: 'tlsmirror',
      tlsmirror: { dest: 'test.com:443', 'primary-key': 'MDEyMzQ1Njc4OWFiY2RlZg==' },
    };
    const node = listenerToYamlNode(vmess);
    expect(node['tlsmirror-config']).toEqual({
      dest: 'test.com:443',
      'primary-key': 'MDEyMzQ1Njc4OWFiY2RlZg==',
    });
    expect(node).not.toHaveProperty('certificate');
  });

  it('treats an incomplete tlsmirror block as missing security layer', () => {
    const vmess = createListener('vmess');
    vmess.tls = { mode: 'tlsmirror', tlsmirror: { dest: '' } };
    expect(validateSemantic(vmess).map((p) => p.code)).toContain(
      'server.problem.insecureLayerRequired'
    );
  });
});

describe('Trojan', () => {
  it('passes ss-option through with its method enum and counts it as a layer', () => {
    const trojan = createListener('trojan');
    trojan.name = 'trojan-ss';
    trojan.protocol['ss-option'] = {
      enabled: true,
      method: 'chacha20-ietf-poly1305',
      password: 'example',
    };
    const node = listenerToYamlNode(trojan);
    expect(node['ss-option']).toEqual({
      enabled: true,
      method: 'chacha20-ietf-poly1305',
      password: 'example',
    });
    expect(validateSemantic(trojan)).toHaveLength(0);
  });

  it('ignores ss-option as a layer when disabled or password-less', () => {
    const trojan = createListener('trojan');
    trojan.protocol['ss-option'] = { enabled: true, method: 'aes-128-gcm', password: '' };
    expect(validateSemantic(trojan).map((p) => p.code)).toContain(
      'server.problem.insecureLayerRequired'
    );
  });

  it('renders ws transport and users exactly like the official example', () => {
    const trojan = createListener('trojan');
    trojan.name = 'trojan-ws';
    trojan.port = '10819';
    trojan.auth = {
      mode: 'list',
      token: [],
      users: [{ username: '1', password: '9d0cb9d0-964f-4ef6-897d-6c6b3ccf9e68' }],
    };
    trojan.transport = { kind: 'ws', wsPath: '/trojan' };
    trojan.tls = {
      mode: 'tls',
      certificate: { source: 'path', value: './server.crt' },
      privateKey: { source: 'path', value: './server.key' },
    };

    const yaml = exportOf(trojan);
    expect(yaml).toContain("port: '10819'");
    expect(yaml).toContain('ws-path: /trojan');
    expect(yaml).toContain("- username: '1'");
    expect(yaml).toContain('certificate: ./server.crt');
  });
});
