import type { ServerConfigIR } from '../types';
import { getListenerSchema } from '../../../schemas/listeners';
import { validateCommonSyntax } from './syntax';
import { validateListenerFields } from './fields';
import { validateDefsCrossField } from './crossField';
import { validateSemantic } from './semantic';
import { validateCrossListeners } from './crossListener';
import { validateRouting } from './routing';
import type { ServerProblem } from './problems';

export type { ServerProblem } from './problems';

export function validateServerConfig(config: ServerConfigIR): ServerProblem[] {
  const problems: ServerProblem[] = [];

  for (const listener of config.listeners) {
    if (!listener.enabled) continue;

    problems.push(...validateCommonSyntax(listener));

    const schema = getListenerSchema(listener.type, listener.tuicVersion);
    if (schema) {
      problems.push(...validateListenerFields(schema.fields, listener));
      problems.push(...validateDefsCrossField(schema.fields, listener));
    }

    problems.push(...validateSemantic(listener));
  }

  problems.push(...validateCrossListeners(config));
  problems.push(...validateRouting(config));

  return problems;
}

export function hasErrors(problems: ServerProblem[]): boolean {
  return problems.some((problem) => problem.severity === 'error');
}
