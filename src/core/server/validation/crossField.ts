import type { ServerFieldDef, ServerShowIf } from '../../../schemas/listeners/dsl';
import type { ListenerIR } from '../types';
import type { ServerProblem } from './problems';

function getNested(values: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === 'object'
        ? (node as Record<string, unknown>)[key]
        : undefined,
    values
  );
}

function evaluateCondition(condition: ServerShowIf, values: Record<string, unknown>): boolean {
  const actual = getNested(values, condition.field);
  switch (condition.operator) {
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'nin':
      return Array.isArray(condition.value) && !condition.value.includes(actual);
    default:
      return true;
  }
}

export function isRequiredNow(def: ServerFieldDef, listener: ListenerIR): boolean {
  if (def.required) return true;
  if (!def.requiredWhen || def.requiredWhen.length === 0) return false;
  const values = listener as unknown as Record<string, unknown>;
  return def.requiredWhen.every((condition) => evaluateCondition(condition, values));
}

function hasValue(value: unknown): boolean {
  return !(value === undefined || value === null || value === '');
}

export function findConflicts(
  defs: ServerFieldDef[],
  listener: ListenerIR
): { keyA: string; keyB: string }[] {
  const values = listener as unknown as Record<string, unknown>;
  const conflicts: { keyA: string; keyB: string }[] = [];
  const seen = new Set<string>();

  for (const def of defs) {
    for (const otherKey of def.conflictsWith ?? []) {
      const pairKey = [def.key, otherKey].sort().join('|');
      if (seen.has(pairKey)) continue;

      const other = defs.find((candidate) => candidate.key === otherKey);
      if (!other) continue;
      if (!hasValue(getNested(values, def.key))) continue;
      if (!hasValue(getNested(values, otherKey))) continue;

      seen.add(pairKey);
      conflicts.push({ keyA: def.key, keyB: otherKey });
    }
  }
  return conflicts;
}

export function validateCrossField(listener: ListenerIR): ServerProblem[] {
  const problems: ServerProblem[] = [];
  const base = { listenerId: listener.id, listenerName: listener.name, section: 'tls' };
  const tls = listener.tls;

  if (tls.mode !== 'none') {
    const hasCert = hasValue(tls.certificate?.value);
    const hasKey = hasValue(tls.privateKey?.value);
    if (hasCert !== hasKey) {
      problems.push({
        severity: 'error',
        code: 'server.problem.certPairMismatch',
        ...base,
        field: hasCert ? 'privateKey' : 'certificate',
      });
    }

    if (
      (tls.clientAuthType === 'verify-if-given' || tls.clientAuthType === 'require-and-verify') &&
      !hasValue(tls.clientAuthCert?.value)
    ) {
      problems.push({
        severity: 'error',
        code: 'server.problem.clientAuthCertRequired',
        params: { clientAuthType: tls.clientAuthType },
        ...base,
        field: 'clientAuthCert',
      });
    }
  }

  return problems;
}

export function validateDefsCrossField(
  defs: ServerFieldDef[],
  listener: ListenerIR
): ServerProblem[] {
  const problems: ServerProblem[] = [];

  for (const def of defs) {
    if (!isRequiredNow(def, listener) && def.showIf && !def.required) continue;
    if (isRequiredNow(def, listener)) {
      const values = listener as unknown as Record<string, unknown>;
      const value = getNested(values, def.key);
      const visible =
        !def.showIf || def.showIf.every((condition) => evaluateCondition(condition, values));
      if (visible && (value === undefined || value === null || value === '')) {
        problems.push({
          severity: 'error',
          code: 'server.problem.fieldRequiredConditionally',
          listenerId: listener.id,
          listenerName: listener.name,
          section: def.section,
          field: def.key,
        });
      }
    }
  }

  for (const conflict of findConflicts(defs, listener)) {
    problems.push({
      severity: 'error',
      code: 'server.problem.conflictingFields',
      params: { fieldA: conflict.keyA, fieldB: conflict.keyB },
      listenerId: listener.id,
      listenerName: listener.name,
    });
  }

  return problems;
}
