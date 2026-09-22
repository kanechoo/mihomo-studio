import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { generateProxyShare } from '../share';
import { createListener } from '../factory';

// Every share is a client `proxies:` document; tests parse it back to inspect.
function nodesOf(result: { yaml?: string }): Record<string, any>[] {
  return (yaml.load(result.yaml!) as Record<string, any>).proxies;
}

describe('proxy share support matrix', () => {
  it('marks the pure server-side listeners as unsupported', () => {
    for (const kind of [
      'http',
      'socks',
      'mixed',
      'redir',
      'tproxy',
      'tun',
      'tunnel',
      'hysteria2-realm',
    ] as const) {
      const result = generateProxyShare(createListener(kind), '');
      expect(result.supported).toBe(false);
      expect(result.reasonCode).toBe('server.share.unsupported');
    }
  });

  it('supports every protocol with a documented client proxy', () => {
    for (const kind of [
      'vless',
      'vmess',
      'trojan',
      'shadowsocks',
      'anytls',
      'snell',
      'mieru',
      'sudoku',
      'shadowquic',
      'hysteria2',
    ] as const) {
      expect(generateProxyShare(createListener(kind), '').supported).toBe(true);
    }
    expect(generateProxyShare(createListener('tuic', 'v4'), '').supported).toBe(true);
    expect(generateProxyShare(createListener('tuic', 'v5'), '').supported).toBe(true);
  });

  it('refuses the combinations the official docs exclude', () => {
    const vmess = createListener('vmess');
    vmess.transport = { kind: 'mekya' };
    expect(generateProxyShare(vmess, 'e.com')).toMatchObject({
      supported: false,
      reasonCode: 'server.share.unsupportedMekya',
    });

    const anytls = createListener('anytls');
    anytls.tls.mode = 'reality';
    expect(generateProxyShare(anytls, 'e.com')).toMatchObject({
      supported: false,
      reasonCode: 'server.share.anytlsRealityUnsupported',
    });
  });
});

describe('VLESS proxy conversion', () => {
  it('maps uuid/flow and warns without a uri when the host argument is empty', () => {
    const vless = createListener('vless');
    vless.auth.users = [{ username: '', uuid: 'u-1', flow: 'xtls-rprx-vision' }];
    expect(nodesOf(generateProxyShare(vless, 'e.com'))[0]).toMatchObject({
      name: 'vless-in',
      type: 'vless',
      server: 'e.com',
      port: 10817,
      uuid: 'u-1',
      flow: 'xtls-rprx-vision',
    });

    const result = generateProxyShare(vless, '');
    expect(result.yaml).toBeUndefined();
    expect(result.warnings).toContain('server.share.missingHost');
  });

  it('switches transport blocks for ws and grpc', () => {
    const ws = createListener('vless');
    ws.auth.users = [{ uuid: 'u1' }];
    ws.transport = { kind: 'ws', wsPath: '/wspath' };
    let node = nodesOf(generateProxyShare(ws, 'e.com'))[0];
    expect(node.network).toBe('ws');
    expect(node['ws-opts']).toEqual({ path: '/wspath' });

    const grpc = createListener('vless');
    grpc.auth.users = [{ uuid: 'u1' }];
    grpc.transport = { kind: 'grpc', grpcServiceName: 'GunService' };
    node = nodesOf(generateProxyShare(grpc, 'e.com'))[0];
    expect(node.network).toBe('grpc');
    expect(node['grpc-opts']).toEqual({ 'grpc-service-name': 'GunService' });
  });

  it('carries every xhttp-config parameter into xhttp-opts and drops server-only ones', () => {
    const xhttp = createListener('vless');
    xhttp.auth.users = [{ uuid: 'u1' }];
    xhttp.transport = {
      kind: 'xhttp',
      xhttp: {
        path: '/xp',
        host: 'cdn.e.com',
        mode: 'stream-one',
        noSseHeader: true,
        xPaddingBytes: '100-1000',
        xPaddingObfsMode: true,
        xPaddingKey: 'x_padding',
        xPaddingHeader: 'Referer',
        xPaddingPlacement: 'queryInHeader',
        xPaddingMethod: 'tokenish',
        uplinkHttpMethod: 'POST',
        sessionPlacement: 'path',
        sessionKey: 'sk',
        sessionTable: 'uuid',
        sessionLength: '16-32',
        seqPlacement: 'path',
        seqKey: 'seq',
        uplinkDataPlacement: 'cookie',
        uplinkDataKey: 'udata',
        uplinkChunkSize: 3072,
        scMaxBufferedPosts: 30,
        scStreamUpServerSecs: '20-80',
        scMaxEachPostBytes: 1000000,
      },
    };

    const node = nodesOf(generateProxyShare(xhttp, 'e.com'))[0];
    expect(node.network).toBe('xhttp');
    expect(node['xhttp-opts']).toEqual({
      path: '/xp',
      host: 'cdn.e.com',
      mode: 'stream-one',
      'x-padding-bytes': '100-1000',
      'x-padding-obfs-mode': true,
      'x-padding-key': 'x_padding',
      'x-padding-header': 'Referer',
      'x-padding-placement': 'queryInHeader',
      'x-padding-method': 'tokenish',
      'uplink-http-method': 'POST',
      'session-placement': 'path',
      'session-key': 'sk',
      'session-table': 'uuid',
      'session-length': '16-32',
      'seq-placement': 'path',
      'seq-key': 'seq',
      'uplink-data-placement': 'cookie',
      'uplink-data-key': 'udata',
      'uplink-chunk-size': 3072,
      'sc-max-each-post-bytes': 1000000,
    });
    // Server-only xhttp keys must never leak into the node.
    const emitted = Object.keys(node['xhttp-opts']);
    for (const key of ['no-sse-header', 'sc-max-buffered-posts', 'sc-stream-up-server-secs']) {
      expect(emitted).not.toContain(key);
    }
  });

  it('derives reality-opts and leaves server TLS material behind', () => {
    const vless = createListener('vless');
    vless.name = 'vless-reality';
    vless.listen = '127.0.0.1';
    vless.routingMark = 42;
    vless.rule = 'sub-rule';
    vless.proxy = 'proxy';
    vless.auth.users = [{ username: '', uuid: 'u-1', flow: '' }];
    vless.tls = {
      mode: 'reality',
      certificate: { source: 'pem', value: 'CERT' },
      privateKey: { source: 'pem', value: 'KEY' },
      reality: {
        dest: 'test.com:443',
        privateKey: 'rk',
        shortIds: ['ABCD'],
        serverNames: ['sni.com'],
        publicKey: 'PUBKEY123',
      },
    };
    vless.security.muxOption = {
      padding: true,
      brutal: { enabled: true, up: 1000, down: 1000 },
    };

    const node = nodesOf(generateProxyShare(vless, 'example.com'))[0];
    expect(node['reality-opts']).toEqual({ 'public-key': 'PUBKEY123', 'short-id': 'ABCD' });
    expect(node.servername).toBe('sni.com');
    expect(node.tls).toBe(true);
    expect(node.smux).toEqual({
      enabled: true,
      padding: true,
      'brutal-opts': { enabled: true, up: 1000, down: 1000 },
    });
    // Server-only listener fields never enter the client document.
    for (const key of ['listen', 'routing-mark', 'rule', 'proxy', 'certificate', 'private-key']) {
      expect(key in node).toBe(false);
    }
  });

  it('keeps decryption and allow-insecure on the server side', () => {
    const vless = createListener('vless');
    vless.auth.users = [{ username: '', uuid: 'u-1', flow: '' }];
    vless.protocol.decryption = 'mlkem768x25519plus.native/xorpub/random.600s';
    vless.protocol['allow-insecure'] = true;

    const node = nodesOf(generateProxyShare(vless, 'e.com'))[0];
    expect('decryption' in node).toBe(false);
    expect('allow-insecure' in node).toBe(false);
  });
});

describe('VMess proxy conversion', () => {
  it('supplies the required cipher and carries alterId', () => {
    const vmess = createListener('vmess');
    vmess.auth.users = [{ username: 'u', uuid: 'uuid-1', alterId: 2 }];
    vmess.transport = { kind: 'ws', wsPath: '/p' };

    const node = nodesOf(generateProxyShare(vmess, 'e.com'))[0];
    expect(node).toMatchObject({
      type: 'vmess',
      uuid: 'uuid-1',
      alterId: 2,
      cipher: 'auto',
      network: 'ws',
      'ws-opts': { path: '/p' },
    });
  });

  it('renames mkcp-config into mkcp-opts and drops enable', () => {
    const vmess = createListener('vmess');
    vmess.auth.users = [{ uuid: 'u-1' }];
    vmess.transport = {
      kind: 'mkcp',
      mkcpConfig: {
        enable: true,
        mtu: 1350,
        tti: 50,
        uplinkCapacity: 5,
        downlinkCapacity: 20,
        congestion: false,
        writeBuffer: 2097152,
        readBuffer: 2097152,
        seed: 's3cr3t',
        header: 'srtp',
      },
    };

    const node = nodesOf(generateProxyShare(vmess, 'e.com'))[0];
    expect(node.network).toBe('mkcp');
    expect(node['mkcp-opts']).toEqual({
      mtu: 1350,
      tti: 50,
      'uplink-capacity': 5,
      'downlink-capacity': 20,
      congestion: false,
      'write-buffer': 2097152,
      'read-buffer': 2097152,
      seed: 's3cr3t',
      header: 'srtp',
    });
  });
});

describe('Trojan / SS / Hysteria2 / TUIC conversions', () => {
  it('trojan maps password, sni and ss-option → ss-opts', () => {
    const trojan = createListener('trojan');
    trojan.auth.users = [{ username: 'u', password: 'pw@rd' }];
    trojan.tls.mode = 'reality';
    trojan.tls.reality = {
      dest: 'd:443',
      privateKey: 'k',
      shortIds: ['ABCD'],
      serverNames: ['sni.com'],
    };
    trojan.protocol['ss-option'] = { enabled: true, method: 'aes-128-gcm', password: 'sspw' };

    const node = nodesOf(generateProxyShare(trojan, '::1'))[0];
    expect(node.password).toBe('pw@rd');
    expect(node.sni).toBe('sni.com');
    expect(node['reality-opts']['short-id']).toBe('ABCD');
    expect(node['ss-opts']).toEqual({ enabled: true, method: 'aes-128-gcm', password: 'sspw' });
    // Trojan is always TLS — there is no tls flag to write.
    expect('tls' in node).toBe(false);
  });

  it('ss renames to type ss and turns simple-obfs into a plugin', () => {
    const ss = createListener('shadowsocks');
    ss.protocol.cipher = 'aes-128-gcm';
    ss.protocol.password = 'pass';
    let node = nodesOf(generateProxyShare(ss, 'e.com'))[0];
    expect(node.type).toBe('ss');
    expect(node.cipher).toBe('aes-128-gcm');
    expect(node.password).toBe('pass');

    ss.protocol['simple-obfs'] = { enable: true, mode: 'http', host: 'bing.com' };
    node = nodesOf(generateProxyShare(ss, 'e.com'))[0];
    expect(node.plugin).toBe('obfs');
    expect(node['plugin-opts']).toEqual({ mode: 'http', host: 'bing.com' });
    expect(generateProxyShare(ss, 'e.com').warnings).toContain(
      'server.share.ssContainsCredentials'
    );
  });

  it('ss derives plugin host from bracketed IPv6 handshake dest', () => {
    const ss = createListener('shadowsocks');
    ss.protocol.cipher = 'aes-128-gcm';
    ss.protocol.password = 'pass';
    ss.security.shadowTls = {
      enable: true,
      version: 3,
      users: [{ name: 'n', password: 'p' }],
      handshake: { dest: '[::1]:443' },
    };
    const node = nodesOf(generateProxyShare(ss, 'e.com'))[0];
    expect(node.plugin).toBe('shadow-tls');
    expect(node['plugin-opts'].host).toBe('::1');
  });

  it('ss folds kcp-tun into the kcptun plugin verbatim', () => {
    const ss = createListener('shadowsocks');
    ss.protocol.cipher = 'aes-128-gcm';
    ss.protocol.password = 'pass';
    ss.transport.kcpTun = { enable: true, key: 'secret', crypt: 'aes', mode: 'fast', mtu: 1350 };

    const node = nodesOf(generateProxyShare(ss, 'e.com'))[0];
    expect(node.plugin).toBe('kcptun');
    expect(node['plugin-opts']).toEqual({ key: 'secret', crypt: 'aes', mode: 'fast', mtu: 1350 });
    expect('enable' in node['plugin-opts']).toBe(false);
  });

  it('hysteria2 carries obfs pair and derives hopping ports', () => {
    const hy2 = createListener('hysteria2');
    hy2.port = '20000-30000';
    hy2.auth.users = [{ username: 'u1', password: 'pw1' }];
    hy2.protocol.obfs = 'salamander';
    hy2.protocol['obfs-password'] = 'ob';
    hy2.protocol.masquerade = 'https://news.ycombinator.com';

    const node = nodesOf(generateProxyShare(hy2, 'e.com'))[0];
    expect(node.port).toBe(20000);
    expect(node.ports).toBe('20000-30000');
    expect(node.obfs).toBe('salamander');
    expect(node['obfs-password']).toBe('ob');
    // masquerade only decorates the inbound's HTTP/3 replies.
    expect('masquerade' in node).toBe(false);
  });

  it('tuic v5 expands map users into uuid+password and copies QUIC tuning', () => {
    const tuic = createListener('tuic', 'v5');
    tuic.auth.users = [{ username: 'uuid-x', password: 'pwd' }];
    tuic.protocol['congestion-controller'] = 'bbr';
    tuic.protocol.alpn = ['h3'];
    tuic.protocol['max-idle-time'] = 15000;
    tuic.protocol['authentication-timeout'] = 1000;

    const node = nodesOf(generateProxyShare(tuic, 'e.com'))[0];
    expect(node.uuid).toBe('uuid-x');
    expect(node.password).toBe('pwd');
    expect(node['congestion-controller']).toBe('bbr');
    expect(node.alpn).toEqual(['h3']);
    // Inbound session lifecycle knobs have no outbound counterpart.
    expect('max-idle-time' in node).toBe(false);
    expect('authentication-timeout' in node).toBe(false);
  });

  it('tuic v4 shares the first token as the single identity', () => {
    const tuic = createListener('tuic', 'v4');
    tuic.auth.token = ['tok-1', 'tok-2'];

    const node = nodesOf(generateProxyShare(tuic, 'e.com'))[0];
    expect(node.token).toBe('tok-1');
    expect('uuid' in node).toBe(false);
  });
});
