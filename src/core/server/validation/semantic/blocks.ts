import type { ListenerIR } from '../../types';
import type { ServerProblem } from '../problems';
import { isHex } from '../syntax';

function baseOf(listener: ListenerIR, section: 'tls' | 'security', field?: string) {
  return {
    listenerId: listener.id,
    listenerName: listener.name,
    section,
    field,
  };
}

const REALITY_REQUIRED_SHORT_ID_MAX_HEX = 16;

export function validateBlocks(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const tls = listener.tls;
  const sec = listener.security;

  if (tls.mode === 'reality') {
    const reality = tls.reality;

    if (tls.certificate?.value || tls.privateKey?.value) {
      problems.push({
        severity: 'error',
        code: 'server.problem.realityXorCertificate',
        ...baseOf(listener, 'tls', 'tls.mode'),
      });
    }

    // Every field below is read defensively: a listener can reach this
    // validator with a half-built reality section (mode switched on before any
    // field was typed, or imported from YAML that omitted keys), and a missing
    // value means "empty" — i.e. exactly what the required-checks exist to
    // report — rather than a reason for the editor to stop rendering.
    if (reality) {
      if (!reality.dest?.trim()) {
        problems.push({
          severity: 'error',
          code: 'server.problem.realityDestRequired',
          ...baseOf(listener, 'tls', 'tls.reality.dest'),
        });
      }
      if (!reality.privateKey?.trim()) {
        problems.push({
          severity: 'error',
          code: 'server.problem.realityKeyRequired',
          ...baseOf(listener, 'tls', 'tls.reality.privateKey'),
        });
      }
      for (const shortId of reality.shortIds ?? []) {
        const value = typeof shortId === 'string' ? shortId.trim() : '';
        if (value !== '' && (!isHex(value) || value.length > REALITY_REQUIRED_SHORT_ID_MAX_HEX)) {
          problems.push({
            severity: 'error',
            code: 'server.problem.shortIdInvalid',
            params: { value },
            ...baseOf(listener, 'tls', 'tls.reality.shortIds'),
          });
        }
      }
    }
  }

  const stls = sec.shadowTls;
  if (stls?.enable) {
    if (stls.version === 2 && !stls.password) {
      problems.push({
        severity: 'error',
        code: 'server.problem.stlsPasswordRequired',
        ...baseOf(listener, 'security', 'security.shadowTls.password'),
      });
    }
    if (stls.version === 3 && (stls.users ?? []).length === 0) {
      problems.push({
        severity: 'error',
        code: 'server.problem.stlsUsersRequired',
        ...baseOf(listener, 'security', 'security.shadowTls.users'),
      });
    }
    if (!stls.handshake?.dest?.trim()) {
      problems.push({
        severity: 'error',
        code: 'server.problem.handshakeDestRequired',
        ...baseOf(listener, 'security', 'security.shadowTls.handshake.dest'),
      });
    }
  }

  const res = sec.resTls;
  if (res?.enable) {
    if (!res.dest?.trim()) {
      problems.push({
        severity: 'error',
        code: 'server.problem.restlsDestRequired',
        ...baseOf(listener, 'security', 'security.resTls.dest'),
      });
    }
    if (!res.password) {
      problems.push({
        severity: 'error',
        code: 'server.problem.restlsPasswordRequired',
        ...baseOf(listener, 'security', 'security.resTls.password'),
      });
    }
  }

  const jls = sec.jls;
  if (jls?.enable) {
    if (!jls.dest?.trim()) {
      problems.push({
        severity: 'error',
        code: 'server.problem.jlsDestRequired',
        ...baseOf(listener, 'security', 'security.jls.dest'),
      });
    }
    if ((jls.users ?? []).length === 0) {
      problems.push({
        severity: 'error',
        code: 'server.problem.jlsUsersRequired',
        ...baseOf(listener, 'security', 'security.jls.users'),
      });
    }
  }

  const brutal = sec.muxOption?.brutal;
  if (brutal?.enabled && (brutal.up <= 0 || brutal.down <= 0)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.brutalBandwidthRequired',
      ...baseOf(listener, 'security', 'security.muxOption.brutal'),
    });
  }

  return problems;
}
