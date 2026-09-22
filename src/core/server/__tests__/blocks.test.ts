import { describe, it, expect } from 'vitest';
import { TLS_FIELDS } from '../../../schemas/listeners/blocks/tls';
import { REALITY_FIELDS } from '../../../schemas/listeners/blocks/reality';
import {
  SHADOW_TLS_FIELDS,
  RES_TLS_FIELDS,
  JLS_FIELDS,
  MUX_FIELDS,
} from '../../../schemas/listeners/blocks/securityBlocks';
import { isVisible } from '../../../schemas/listeners/dsl';
import { validateBlocks } from '../validation/semantic/blocks';
import { validateSemantic } from '../validation/semantic';
import { getListenerSchema } from '../../../schemas/listeners';
import type { ListenerIR } from '../types';
import { createListener } from '../factory';

describe('TLS block schema', () => {
  it('hides certificate fields unless mode is tls and honours source switching', () => {
    const none: Record<string, unknown> = { tls: { mode: 'none' } };
    const tlsPath: Record<string, unknown> = {
      tls: { mode: 'tls', certificate: { source: 'path' }, privateKey: { source: 'path' } },
    };
    const tlsPem: Record<string, unknown> = {
      tls: { mode: 'tls', certificate: { source: 'pem' }, privateKey: { source: 'pem' } },
    };

    for (const def of TLS_FIELDS) {
      if (def.key === 'tls.mode') continue;
      expect(isVisible(def, none)).toBe(false);
    }

    const byId = (id: string) => TLS_FIELDS.find((def) => (def.id ?? def.key) === id)!;
    const byKey = (key: string) => TLS_FIELDS.find((def) => def.key === key)!;
    expect(isVisible(byId('cert-path'), tlsPath)).toBe(true);
    expect(isVisible(byId('cert-pem'), tlsPath)).toBe(false);
    expect(isVisible(byId('cert-pem'), tlsPem)).toBe(true);
    expect(isVisible(byKey('tls.clientAuthCert.value'), tlsPath)).toBe(false);
    expect(
      isVisible(
        byKey('tls.clientAuthCert.value'),
        { tls: { mode: 'tls', clientAuthType: 'require-and-verify' } }
      )
    ).toBe(true);
  });

  it('composes the official field set into the three app-proxy protocols', () => {
    for (const kind of ['http', 'socks', 'mixed'] as const) {
      const fields = getListenerSchema(kind)!.fields;
      expect(fields.some((f) => f.key === 'tls.mode')).toBe(true);
      expect(fields.some((f) => f.key === 'tls.echKey')).toBe(true);
      // reality is not part of the app-proxy trio
      expect(fields.some((f) => f.key === 'tls.reality.dest')).toBe(false);
    }
  });
});

describe('Reality block rules', () => {
  function withReality(patch: Partial<ListenerIR['tls']['reality']>): ListenerIR {
    const listener = createListener('vless');
    listener.tls = {
      mode: 'reality',
      reality: {
        dest: 'test.com:443',
        privateKey: 'rk',
        shortIds: [],
        serverNames: ['test.com'],
        ...patch,
      },
    };
    return listener;
  }

  it('rejects a reality block without dest or private key', () => {
    const codes = validateBlocks(withReality({ dest: '', privateKey: '' })).map((p) => p.code);
    expect(codes).toContain('server.problem.realityDestRequired');
    expect(codes).toContain('server.problem.realityKeyRequired');
  });

  it('rejects short-ids that are not hex or exceed 16 characters', () => {
    const problems = validateBlocks(
      withReality({ shortIds: ['0123456789abcdef', 'zzzz', '0123456789abcdef0'] })
    );
    const invalid = problems.filter((p) => p.code === 'server.problem.shortIdInvalid');
    expect(invalid).toHaveLength(2);
    expect((invalid[0].params as { value: string }).value).toBe('zzzz');
  });

  it('forbids mixing reality with a certificate pair', () => {
    const listener = withReality({});
    listener.tls.certificate = { source: 'path', value: './c.pem' };
    expect(validateBlocks(listener).map((p) => p.code)).toContain(
      'server.problem.realityXorCertificate'
    );
  });

  it('exposes limit-fallback triples only as advanced fields', () => {
    for (const def of REALITY_FIELDS) {
      if (def.key.includes('limitFallback')) {
        expect(def.level).toBe('advanced');
        expect(def.min).toBe(0);
      }
    }
  });
});

describe('ShadowTLS / ResTLS / JLS / mux block rules', () => {
  it('demands password for shadow-tls v2 and users for v3', () => {
    const v2 = createListener('trojan');
    v2.security.shadowTls = {
      enable: true,
      version: 2,
      handshake: { dest: 'dest.com:443' },
    };
    expect(validateBlocks(v2).map((p) => p.code)).toContain(
      'server.problem.stlsPasswordRequired'
    );

    v2.security.shadowTls.version = 3;
    expect(validateBlocks(v2).map((p) => p.code)).toContain(
      'server.problem.stlsUsersRequired'
    );

    v2.security.shadowTls.users = [{ name: 'n', password: 'p' }];
    expect(validateBlocks(v2).map((p) => p.code)).not.toContain(
      'server.problem.stlsUsersRequired'
    );
  });

  it('requires the handshake dest whenever shadow-tls is on', () => {
    const l = createListener('trojan');
    l.security.shadowTls = { enable: true, version: 3, handshake: { dest: '' } };
    expect(validateBlocks(l).map((p) => p.code)).toContain(
      'server.problem.handshakeDestRequired'
    );
  });

  it('requires dest+password for restls and dest+users for jls when enabled', () => {
    const l = createListener('snell');
    l.security.resTls = { enable: true, dest: '', password: '' };
    l.security.jls = { enable: true, dest: '', users: [] };

    const codes = validateBlocks(l).map((p) => p.code);
    expect(codes).toContain('server.problem.restlsDestRequired');
    expect(codes).toContain('server.problem.restlsPasswordRequired');
    expect(codes).toContain('server.problem.jlsDestRequired');
    expect(codes).toContain('server.problem.jlsUsersRequired');

    l.security.resTls = { enable: true, dest: 'd:443', password: 'p' };
    l.security.jls = {
      enable: true,
      dest: 'd:443',
      users: [{ username: 'u', password: 'p' }],
    };
    expect(validateBlocks(l)).toHaveLength(0);
  });

  it('validates brutal bandwidth positivity only when enabled', () => {
    const l = createListener('vmess');
    l.security.muxOption = { padding: true, brutal: { enabled: true, up: 0, down: -1 } };
    expect(validateBlocks(l).map((p) => p.code)).toContain(
      'server.problem.brutalBandwidthRequired'
    );

    l.security.muxOption.brutal = { enabled: false, up: 0, down: 0 };
    expect(validateBlocks(l)).toHaveLength(0);
  });

  it('routes every block problem through validateSemantic regardless of protocol', () => {
    const l = createListener('socks');
    l.security.shadowTls = { enable: true, version: 2, handshake: { dest: 'x:443' } };
    const codes = validateSemantic(l).map((p) => p.code);
    expect(codes).toContain('server.problem.stlsPasswordRequired');
  });

  it('keeps all security block defs inside the security section for grouping', () => {
    for (const def of [...SHADOW_TLS_FIELDS, ...RES_TLS_FIELDS, ...JLS_FIELDS, ...MUX_FIELDS]) {
      expect(def.section).toBe('security');
    }
  });
});
