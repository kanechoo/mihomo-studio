import { describe, it, expect } from 'vitest';
import { validateBlocks } from '../validation/semantic/blocks';
import type { AuthSection, ListenerIR, SecurityBlocks, TlsSection } from '../types';

// Regression: the editor must keep rendering when a listener carries a
// half-built TLS/security section — mode switched to Reality before any field
// was typed, or a YAML import / older draft that omitted keys. The types say
// every key exists; real persisted data does not always agree. Missing values
// are reported as the usual required-problems; they never throw.
function listenerWith(tls: unknown, security: unknown = {}): ListenerIR {
  return {
    id: 'l1',
    name: 'l1',
    type: 'vless',
    port: '443',
    listen: '::',
    enabled: true,
    auth: { mode: 'none' } as AuthSection,
    tls: tls as TlsSection,
    transport: { kind: 'tcp' },
    protocol: {},
    security: security as SecurityBlocks,
    extensions: {},
  };
}

describe('validateBlocks tolerates partially-built sections', () => {
  it('reports missing reality fields instead of throwing', () => {
    const problems = validateBlocks(
      listenerWith({ mode: 'reality', reality: { serverNames: ['example.com'] } })
    );
    const codes = problems.map((p) => p.code);
    expect(codes).toContain('server.problem.realityDestRequired');
    expect(codes).toContain('server.problem.realityKeyRequired');
  });

  it('tolerates a reality section without shortIds and flags invalid entries', () => {
    const problems = validateBlocks(
      listenerWith({ mode: 'reality', reality: { dest: 'd', privateKey: 'k' } })
    );
    expect(problems).toHaveLength(0);

    const withBadEntry = validateBlocks(
      listenerWith({
        mode: 'reality',
        reality: { dest: 'd', privateKey: 'k', shortIds: ['zz'] },
      })
    );
    expect(withBadEntry.map((p) => p.code)).toContain('server.problem.shortIdInvalid');
  });

  it('treats an empty reality object as two required-field errors', () => {
    expect(validateBlocks(listenerWith({ mode: 'reality', reality: {} }))).toHaveLength(2);
  });

  it('does not throw on shadowTls/resTls/jls sections missing nested dests', () => {
    const security = {
      shadowTls: { enable: true, version: 2, password: 'p' },
      resTls: { enable: true },
      jls: { enable: true },
    };
    let codes: string[] = [];
    expect(() => {
      codes = validateBlocks(listenerWith({ mode: 'none' }, security)).map((p) => p.code);
    }).not.toThrow();
    expect(codes).toContain('server.problem.handshakeDestRequired');
    expect(codes).toContain('server.problem.restlsDestRequired');
    expect(codes).toContain('server.problem.jlsDestRequired');
  });
});
