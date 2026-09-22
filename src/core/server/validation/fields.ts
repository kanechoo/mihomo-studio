import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import { isVisible } from '../../../schemas/listeners/dsl';
import { parsePortExpression } from '../portExpression';
import { isValidPem } from './syntax';
import type { ListenerIR } from '../types';
import type { ServerProblem } from './problems';

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function validateFieldSyntax(
  def: ServerFieldDef,
  listener: ListenerIR
): ServerProblem | null {
  const values = listener as unknown as Record<string, unknown>;
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      values
    );
  const value = get(def.key);
  const base = {
    listenerId: listener.id,
    listenerName: listener.name,
    section: def.section,
    field: def.key,
  };

  if (def.required && isEmptyValue(value)) {
    return { severity: 'error', code: 'server.problem.fieldRequired', ...base };
  }

  switch (def.type) {
    case 'number': {
      if (value === undefined || value === null) return null;
      const num = Number(value);
      if (Number.isNaN(num)) {
        return { severity: 'error', code: 'server.problem.notANumber', ...base };
      }
      if (def.min !== undefined && num < def.min) {
        return { severity: 'error', code: 'server.problem.belowMin', params: { min: def.min }, ...base };
      }
      if (def.max !== undefined && num > def.max) {
        return { severity: 'error', code: 'server.problem.aboveMax', params: { max: def.max }, ...base };
      }
      return null;
    }

    case 'text': {
      if (
        typeof value === 'string' &&
        value !== '' &&
        def.pattern !== undefined &&
        !new RegExp(def.pattern).test(value)
      ) {
        return { severity: 'error', code: 'server.problem.patternMismatch', params: { pattern: def.pattern }, ...base };
      }
      return null;
    }

    case 'select': {
      if (isEmptyValue(value)) return null;
      const known = (def.options ?? []).some((option) => String(option.value) === String(value));
      if (!known) {
        return { severity: 'warning', code: 'server.problem.unknownOption', params: { value: String(value) }, ...base };
      }
      return null;
    }

    case 'multiselect':
    case 'tag-list': {
      if (value === undefined) return null;
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        return { severity: 'error', code: 'server.problem.notStringList', ...base };
      }
      return null;
    }

    case 'port-expression': {
      if (isEmptyValue(value)) return null;
      const { errors } = parsePortExpression(String(value));
      if (errors.length > 0) {
        return {
          severity: 'error',
          code:
            errors[0].code === 'bounds'
              ? 'server.problem.portBounds'
              : 'server.problem.portSyntax',
          params: errors[0].token ? { token: errors[0].token } : undefined,
          ...base,
        };
      }
      return null;
    }

    case 'pem': {
      if (typeof value === 'string' && value.trim() !== '' && !isValidPem(value)) {
        return { severity: 'error', code: 'server.problem.pemInvalid', ...base };
      }
      return null;
    }

    default:
      return null;
  }
}

export function validateListenerFields(
  defs: ServerFieldDef[],
  listener: ListenerIR
): ServerProblem[] {
  const problems: ServerProblem[] = [];
  for (const def of defs) {
    if (!isVisible(def, listener as unknown as Record<string, unknown>)) continue;
    const problem = validateFieldSyntax(def, listener);
    if (problem) problems.push(problem);
  }
  return problems;
}
