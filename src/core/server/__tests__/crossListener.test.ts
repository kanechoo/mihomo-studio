import { describe, it, expect } from 'vitest';
import {
  listenersConflict,
  validateCrossListeners,
} from '../validation/crossListener';
import { hasErrors, validateServerConfig } from '../validation';
import { createListener, createDefaultServerConfig } from '../factory';
import type { ListenerIR } from '../types';

function listener(kind: ListenerIR['type'], name: string, listen: string, port: string): ListenerIR {
  const l = createListener(kind);
  l.name = name;
  l.listen = listen;
  l.port = port;
  return l;
}

describe('bind conflict analyzer', () => {
  it('flags same-port overlaps across wildcard and specific addresses', () => {
    expect(
      listenersConflict(
        listener('http', 'a', '0.0.0.0', '443'),
        listener('http', 'b', '127.0.0.1', '443')
      )
    ).toBe(true);
    expect(
      listenersConflict(
        listener('http', 'a', '127.0.0.1', '443'),
        listener('http', 'b', '192.168.1.1', '443')
      )
    ).toBe(false);
  });

  it('respects address families (v4 vs v6) unless a hostname is involved', () => {
    expect(
      listenersConflict(listener('http', 'a', '::', '443'), listener('http', 'b', '0.0.0.0', '443'))
    ).toBe(false);
    expect(
      listenersConflict(
        listener('http', 'a', 'my.host.name', '443'),
        listener('http', 'b', '0.0.0.0', '443')
      )
    ).toBe(true);
  });

  it('distinguishes transport families including tunnel networks', () => {
    const socksUdpOnly = listener('socks', 's', '0.0.0.0', '5353');
    // socks defaults udp:true + tcp — conflicts with tunnel tcp
    const tunnelTcp = listener('tunnel', 't', '0.0.0.0', '5353');
    tunnelTcp.protocol.network = ['tcp'];
    expect(listenersConflict(socksUdpOnly, tunnelTcp)).toBe(true);

    const tunnelUdpOnly = listener('tunnel', 'u', '0.0.0.0', '5353');
    tunnelUdpOnly.protocol.network = ['udp'];
    expect(listenersConflict(tunnelTcp, tunnelUdpOnly)).toBe(false);

    const hy2 = listener('hysteria2', 'h', '0.0.0.0', '8443');
    const http = listener('http', 'w', '0.0.0.0', '8443');
    expect(listenersConflict(hy2, http)).toBe(false);
    const tuicSamePort = listener('tuic', 'q2', '0.0.0.0', '8443');
    expect(listenersConflict(hy2, tuicSamePort)).toBe(true);

    const tuic = listener('tuic', 'q', '0.0.0.0', '8443');
    expect(listenersConflict(hy2, tuic)).toBe(true);
  });

  it('understands port ranges and lists', () => {
    expect(
      listenersConflict(listener('http', 'a', '0.0.0.0', '100-200'), listener('http', 'b', '0.0.0.0', '150'))
    ).toBe(true);
    expect(
      listenersConflict(listener('http', 'a', '0.0.0.0', '100-200'), listener('http', 'b', '0.0.0.0', '201-300'))
    ).toBe(false);
    expect(
      listenersConflict(listener('http', 'a', '0.0.0.0', '80/443'), listener('http', 'b', '0.0.0.0', '443'))
    ).toBe(true);
  });
});

describe('cross-listener validation', () => {
  it('detects duplicate names and reserved outbound names', () => {
    const config = createDefaultServerConfig();
    config.listeners = [
      listener('http', 'dup', '127.0.0.1', '8001'),
      listener('http', 'dup', '127.0.0.2', '8002'),
      listener('http', 'DIRECT', '127.0.0.3', '8003'),
    ];
    const codes = validateCrossListeners(config).map((p) => p.code);
    expect(codes).toContain('server.problem.duplicateName');
    expect(codes).toContain('server.problem.reservedName');
  });

  it('ignores disabled listeners for both naming and conflicts', () => {
    const config = createDefaultServerConfig();
    const a = listener('http', 'same', '0.0.0.0', '9000');
    const b = listener('http', 'same', '0.0.0.0', '9000');
    b.enabled = false;
    config.listeners = [a, b];
    expect(validateCrossListeners(config)).toHaveLength(0);
  });
});

describe('validateServerConfig pipeline', () => {
  it('aggregates L1-L5 problems for the whole document', () => {
    const config = createDefaultServerConfig();
    const vless = listener('vless', 'vl', '0.0.0.0', '443');
    const trojan = listener('trojan', 'tj', '0.0.0.0', '443');
    const badPort = listener('http', 'bad', '0.0.0.0', '99999');
    config.listeners = [vless, trojan, badPort];

    const problems = validateServerConfig(config);
    const codes = new Set(problems.map((p) => p.code));

    expect(codes.has('server.problem.bindConflict')).toBe(true);
    expect(codes.has('server.problem.insecureLayerRequired')).toBe(true);
    expect(codes.has('server.problem.portBounds')).toBe(true);
    expect(codes.has('server.problem.plaintextPublicNoAuth')).toBe(false);
    expect(codes.has('server.problem.globalAuthFallback')).toBe(true);
    expect(hasErrors(problems)).toBe(true);
  });

  it('reports no errors for well-formed distinct listeners with layers', () => {
    const config = createDefaultServerConfig();
    const socks = listener('socks', 's1', '127.0.0.1', '1080');
    const vless = listener('vless', 'vl', '0.0.0.0', '443');
    vless.tls.mode = 'reality';
    vless.tls.reality = {
      dest: 'test.com:443',
      privateKey: 'rk',
      shortIds: ['01'],
      serverNames: ['test.com'],
    };
    const tun = listener('tun', 'tun-in', '', '');
    config.listeners = [socks, vless, tun];

    const problems = validateServerConfig(config);
    expect(problems.filter((p) => p.severity === 'error')).toHaveLength(0);
    // The old always-on tunAdvanced advisory is gone: a default tun listener
    // contributes nothing of its own any more.
    expect(problems.map((p) => p.code)).not.toContain('server.problem.tunAdvanced');
  });

  it('skips everything for disabled listeners', () => {
    const config = createDefaultServerConfig();
    const bare = listener('vless', 'off', '', 'not-a-port');
    bare.enabled = false;
    config.listeners = [bare];
    expect(validateServerConfig(config)).toHaveLength(0);
  });
});
