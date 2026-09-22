import type { ListenerIR } from '../../types';
import type { ServerProblem } from '../problems';
import { validateSecurityLayer } from './encrypted';

const CIPHER_2022_BYTE_LENGTHS: Record<string, number> = {
  '2022-blake3-aes-128-gcm': 16,
  '2022-blake3-aes-256-gcm': 32,
  '2022-blake3-chacha20-poly1305': 32,
};

const KNOWN_CIPHERS = new Set([
  ...Object.keys(CIPHER_2022_BYTE_LENGTHS),
  'aes-128-gcm',
  'aes-192-gcm',
  'aes-256-gcm',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  'none',
]);

export function base64DecodedByteLength(value: string): number {
  const trimmed = value.trim();
  const padding = (trimmed.match(/=+$/) ?? [''])[0].length;
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}

export function validateShadowsocks(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const base = {
    listenerId: listener.id,
    listenerName: listener.name,
    section: 'protocol' as const,
  };

  const cipher = typeof listener.protocol.cipher === 'string' ? listener.protocol.cipher : '';
  const password = typeof listener.protocol.password === 'string' ? listener.protocol.password : '';

  if (cipher === 'none' && !listener.protocol['allow-insecure']) {
    problems.push({
      severity: 'warning',
      code: 'server.problem.ssNoneCipher',
      ...base,
      field: 'protocol.cipher',
    });
  }

  if (cipher !== '' && !KNOWN_CIPHERS.has(cipher)) {
    problems.push({
      severity: 'warning',
      code: 'server.problem.ssUnknownCipher',
      params: { cipher },
      ...base,
      field: 'protocol.cipher',
    });
  }

  const expectedBytes = CIPHER_2022_BYTE_LENGTHS[cipher];
  if (expectedBytes !== undefined && password !== '') {
    if (base64DecodedByteLength(password) !== expectedBytes) {
      problems.push({
        severity: 'error',
        code: 'server.problem.ss2022PasswordLength',
        params: { expectedBytes },
        ...base,
        field: 'protocol.password',
      });
    }
  }

  return problems;
}

export { validateSecurityLayer };
