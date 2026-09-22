import { describe, it, expect } from 'vitest';
import { getListenerSchema } from '../../../schemas/listeners';
import { ServerYamlExporter } from '../exporters/serverYaml';
import { createListener, createDefaultServerConfig } from '../factory';
import { validateSemantic } from '../validation/semantic';
import { validateCommonSyntax } from '../validation/syntax';
import {
  isValidSudokuTable,
} from '../validation/semantic/misc';
import type { ListenerIR } from '../types';

const exporter = new ServerYamlExporter();

function exportOf(listener: ListenerIR): string {
  return exporter.export({ ...createDefaultServerConfig(), listeners: [listener] });
}

describe('P11 registry entries', () => {
  it('marks sudoku single-port and tun portless', () => {
    expect(getListenerSchema('sudoku')!.portMode).toBe('single');
    expect(getListenerSchema('tun')!.portMode).toBe('none');
    expect(getListenerSchema('trusttunnel')!.capability.quic).toBe(true);
    expect(getListenerSchema('mieru')!.shareUri).toBe('supported');
    expect(getListenerSchema('mieru')!.fields.some((f) => f.key === 'protocol.transport')).toBe(
      true
    );
  });

  it('exposes the full TUN advanced field set', () => {
    const fields = getListenerSchema('tun')!.fields.filter((f) => f.level === 'advanced');
    expect(fields.length).toBeGreaterThanOrEqual(16);
    for (const def of getListenerSchema('tun')!.fields) {
      if (def.section !== 'common') expect(def.section).toBe('protocol');
    }
  });
});

describe('Mieru', () => {
  it('exports transport and map users; warns on non-base64 traffic patterns', () => {
    const mieru = createListener('mieru');
    mieru.name = 'mieru-in';
    mieru.port = '10818';
    mieru.auth = { mode: 'map', token: [], users: [{ username: 'u', password: 'p' }] };
    const yaml = exportOf(mieru);
    expect(yaml).toContain('transport: TCP');
    expect(yaml).toContain('users:');
    expect(yaml).toContain('u: p');

    mieru.protocol['traffic-pattern'] = 'not base64!!';
    expect(validateSemantic(mieru).map((p) => p.code)).toContain(
      'server.problem.mieruPatternNotBase64'
    );
    mieru.protocol['traffic-pattern'] = 'AAAA';
    expect(validateSemantic(mieru)).toHaveLength(0);
  });
});

describe('Sudoku rules', () => {
  function sudoku(): ListenerIR {
    const l = createListener('sudoku');
    l.protocol.key = 'k';
    return l;
  }

  it('rejects multi-port expressions (single port only)', () => {
    const l = sudoku();
    l.port = '8443,8444';
    expect(validateSemantic(l).map((p) => p.code)).toContain('server.problem.sudokuSinglePort');
    expect(validateCommonSyntax(sudoku())).toHaveLength(0);
  });

  it('warns on aead none and enforces padding-min<=max', () => {
    const l = sudoku();
    l.protocol['aead-method'] = 'none';
    expect(validateSemantic(l).map((p) => p.code)).toContain('server.problem.sudokuAeadNone');

    l.protocol['aead-method'] = 'chacha20-poly1305';
    l.protocol['padding-min'] = 20;
    l.protocol['padding-max'] = 10;
    expect(validateSemantic(l).map((p) => p.code)).toContain(
      'server.problem.sudokuPaddingRange'
    );

    l.protocol['padding-max'] = 30;
    expect(validateSemantic(l)).toHaveLength(0);
  });

  it.each([
    ['xpxvvpvv', true],
    ['vxpvxvvp', true],
    ['xxxxppvv', false],
    ['xpxvvpv', false],
    ['xpxvvpvw', false],
    ['', false],
  ])('custom table %j validity → %j', (table, expected) => {
    expect(isValidSudokuTable(table)).toBe(expected);
  });

  it('flags invalid custom tables and fallback addresses', () => {
    const l = sudoku();
    l.protocol['custom-table'] = 'xxxxppvv';
    l.protocol.fallback = 'no-port-here';
    const codes = validateSemantic(l).map((p) => p.code);
    expect(codes).toContain('server.problem.sudokuTableInvalid');
    expect(codes).toContain('server.problem.sudokuFallbackInvalid');

    l.protocol['custom-table'] = 'xpxvvpvv';
    l.protocol.fallback = '127.0.0.1:80';
    expect(validateSemantic(l)).toHaveLength(0);
  });
});

describe('TrustTunnel certificate mandate', () => {
  it('errors until both certificate and private-key are present', () => {
    const tt = createListener('trusttunnel');
    const codes = validateSemantic(tt).map((p) => p.code);
    expect(codes).toContain('server.problem.trusttunnelCertRequired');
    expect(codes).not.toContain('server.problem.certPairMismatch');

    tt.tls.certificate = { source: 'path', value: './c.pem' };
    tt.tls.privateKey = { source: 'path', value: './k.pem' };
    expect(validateSemantic(tt)).toHaveLength(0);
  });

  it('exports network list and bbr congestion by default', () => {
    const yaml = exportOf(createListener('trusttunnel'));
    expect(yaml).toContain('network:');
    expect(yaml).toContain('- tcp');
    expect(yaml).toContain('- udp');
    expect(yaml).toContain("congestion-controller: bbr");
  });
});

describe('TUN listener', () => {
  it('reports nothing for a default tun listener', () => {
    const tun = createListener('tun');
    expect(validateSemantic(tun)).toEqual([]);
  });

  it('flags filters and auto-redirect that require auto-route', () => {
    const tun = createListener('tun');
    (tun.protocol as Record<string, unknown>)['auto-redirect'] = true;
    (tun.protocol as Record<string, unknown>)['include-package'] = ['com.android.chrome'];
    const codes = validateSemantic(tun).map((p) => p.code);
    expect(codes).toContain('server.problem.tunAutoRedirectNeedsAutoRoute');
    expect(codes).toContain('server.problem.tunFilterNeedsAutoRoute');
  });

  it('validates dns-hijack entries', () => {
    const tun = createListener('tun');
    tun.protocol['dns-hijack'] = ['any:53', 'tcp://0.0.0.0:53'];
    expect(validateSemantic(tun)).toEqual([]);
    tun.protocol['dns-hijack'] = ['not a port'];
    expect(validateSemantic(tun).map((p) => p.code)).toContain(
      'server.problem.tunDnsHijackInvalid'
    );
  });

  it('exports without port/listen-required noise using stack and dns-hijack defaults', () => {
    const tun = createListener('tun');
    tun.name = 'tun-in';
    const yaml = exportOf(tun);
    expect(yaml).toContain('- name: tun-in');
    expect(yaml).toContain('type: tun');
    expect(yaml).toContain('stack: system');
    expect(yaml).toContain('dns-hijack:');
    expect(yaml).toContain('- 0.0.0.0:53');
    expect(yaml).not.toMatch(/^\s+port:/m);

    expect(validateCommonSyntax(tun)).toHaveLength(0);
  });
});
