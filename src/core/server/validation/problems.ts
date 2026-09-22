export type ProblemSeverity = 'error' | 'warning' | 'info';

export interface ServerProblem {
  severity: ProblemSeverity;
  code: string;
  params?: Record<string, unknown>;
  listenerId?: string;
  listenerName?: string;
  section?: string;
  field?: string;
}

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password',
  'privateKey',
  'private-key',
  'psk',
  'token',
  'secret',
  'echKey',
  'ech-key',
  'obfsPassword',
  'obfs-password',
  'certificate',
  'clientAuthCert',
  'client-auth-cert',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = Array.isArray(child)
        ? child.map((entry) => (typeof entry === 'string' && entry !== '' ? REDACTED : entry))
        : typeof child === 'string' && child !== ''
          ? REDACTED
          : redactSecrets(child);
    } else {
      out[key] = redactSecrets(child);
    }
  }
  return out as T;
}
