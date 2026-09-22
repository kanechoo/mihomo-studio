import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { generateProxyShare, shareableUsers, isMultiUserController } from '../share';
import { createListener } from '../factory';

function nodeOf(result: { yaml?: string }): Record<string, any> {
  return (yaml.load(result.yaml!) as Record<string, any>).proxies[0];
}

// Multi-user protocols hand out one node per identity; the name carries a
// label so a client's proxies list can tell them apart.
describe('per-user proxy shares', () => {
  it('classifies protocols by whether their auth list holds identities', () => {
    for (const kind of [
      'vless',
      'vmess',
      'trojan',
      'hysteria2',
      'anytls',
      'mieru',
    ] as const) {
      expect(isMultiUserController(createListener(kind))).toBe(true);
    }
    expect(isMultiUserController(createListener('tuic', 'v5'))).toBe(true);
    expect(isMultiUserController(createListener('shadowquic'))).toBe(true);
    expect(isMultiUserController(createListener('trusttunnel'))).toBe(true);
    // Single-credential listeners have exactly one identity per share.
    for (const kind of ['shadowsocks', 'http', 'snell', 'sudoku'] as const) {
      expect(isMultiUserController(createListener(kind))).toBe(false);
    }
    // TUIC v4 authenticates by token list, not per-person entries.
    expect(isMultiUserController(createListener('tuic', 'v4'))).toBe(false);
  });

  it('shareableUsers skips entries missing their required secret', () => {
    const vless = createListener('vless');
    vless.auth.users = [
      { username: '', uuid: 'uuid-1', flow: '' },
      { username: 'broken', uuid: '', flow: '' },
      { username: '', uuid: 'uuid-3', flow: '' },
    ];
    expect(shareableUsers(vless).map((u) => u.uuid)).toEqual(['uuid-1', 'uuid-3']);

    const ss = createListener('shadowsocks');
    ss.auth.users = [{ username: 'ignored', password: 'pw' }];
    expect(shareableUsers(ss)).toEqual([]);
  });

  it('vless emits the chosen user and labels the node name', () => {
    const vless = createListener('vless');
    vless.name = 'node';
    vless.auth.users = [
      { username: '', uuid: 'aaaaaaaa-1111', flow: '' },
      { username: 'alice', uuid: 'bbbbbbbb-2222', flow: '' },
    ];

    // No user argument: historic behaviour — first usable entry, plain name.
    const first = nodeOf(generateProxyShare(vless, 'e.com'));
    expect(first.uuid).toBe('aaaaaaaa-1111');
    expect(first.name).toBe('node');

    const second = nodeOf(generateProxyShare(vless, 'e.com', vless.auth.users[1]));
    expect(second.uuid).toBe('bbbbbbbb-2222');
    expect(second.name).toBe('node alice');
  });

  it('trojan, hysteria2 and tuic pick the requested password identity', () => {
    const trojan = createListener('trojan');
    trojan.name = 'tj';
    trojan.auth.users = [
      { username: 'carol', password: 'pw-1' },
      { username: 'dave', password: 'pw-2' },
    ];
    const trojanNode = nodeOf(generateProxyShare(trojan, 'e.com', trojan.auth.users[1]));
    expect(trojanNode.password).toBe('pw-2');
    expect(trojanNode.name).toBe('tj dave');

    const hy2 = createListener('hysteria2');
    hy2.name = 'hy';
    hy2.auth.users = [
      { username: 'a', password: 'hpw-1' },
      { username: 'b', password: 'hpw-2' },
    ];
    const hyNode = nodeOf(generateProxyShare(hy2, 'e.com', hy2.auth.users[1]));
    expect(hyNode.password).toBe('hpw-2');
    expect(hyNode.name).toBe('hy b');

    const tuic = createListener('tuic', 'v5');
    tuic.name = 'tc';
    tuic.auth.users = [
      { username: 'erin', password: 'tpw-1' },
      { username: 'frank', password: 'tpw-2' },
    ];
    const tuicNode = nodeOf(generateProxyShare(tuic, 'e.com', tuic.auth.users[1]));
    expect(tuicNode.uuid).toBe('frank');
    expect(tuicNode.password).toBe('tpw-2');
    expect(tuicNode.name).toBe('tc frank');
  });

  it('shadowquic and trusttunnel expand both halves of the credential', () => {
    const sq = createListener('shadowquic');
    sq.name = 'sq';
    sq.auth.users = [
      { username: 'sq-user-1', password: 'sq-pw-1' },
      { username: 'sq-user-2', password: 'sq-pw-2' },
    ];
    const sqNode = nodeOf(generateProxyShare(sq, 'e.com', sq.auth.users[1]));
    expect(sqNode.username).toBe('sq-user-2');
    expect(sqNode.password).toBe('sq-pw-2');

    const tt = createListener('trusttunnel');
    tt.name = 'tt';
    tt.auth.users = [{ username: 'tt-user', password: 'tt-pw' }];
    tt.protocol.network = ['tcp', 'udp'];
    const ttNode = nodeOf(generateProxyShare(tt, 'e.com', tt.auth.users[0]));
    expect(ttNode.username).toBe('tt-user');
    expect(ttNode.password).toBe('tt-pw');
    expect(ttNode.quic).toBe(true);
    expect(ttNode.udp).toBe(true);
  });

  it('vmess always writes alterId: mihomo rejects the node without it', () => {
    const vmess = createListener('vmess');
    vmess.name = 'v';
    vmess.auth.users = [{ username: '', uuid: 'uuid-1', alterId: 0 }];
    expect(nodeOf(generateProxyShare(vmess, 'e.com', vmess.auth.users[0])).alterId).toBe(0);

    const nonzero = createListener('vmess');
    nonzero.auth.users = [{ username: '', uuid: 'uuid-2', alterId: 2 }];
    expect(nodeOf(generateProxyShare(nonzero, 'e.com')).alterId).toBe(2);
  });

  it('falls back to the short uuid as the label when there is no username', () => {
    const vless = createListener('vless');
    vless.name = 'n';
    vless.auth.users = [{ username: '', uuid: 'abcdef12-9999', flow: '' }];
    const node = nodeOf(generateProxyShare(vless, 'e.com', vless.auth.users[0]));
    expect(node.name).toBe('n abcdef12');
  });
});
