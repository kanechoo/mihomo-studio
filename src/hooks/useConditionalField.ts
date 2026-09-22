import { useMemo } from 'react';
import type { ShowIfCondition } from '../schemas/types';
import { getNestedValue } from '../core/ir';

// Evaluate a single condition
function evaluateCondition(
  condition: ShowIfCondition,
  formValues: Record<string, any>
): boolean {
  const fieldValue = getNestedValue(formValues, condition.field);

  switch (condition.operator) {
    case 'eq':
      return fieldValue === condition.value;
    case 'neq':
      return fieldValue !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'nin':
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    default:
      return true;
  }
}

// Hook to check if a field should be shown based on showIf conditions
export function useConditionalField(
  showIf: ShowIfCondition | ShowIfCondition[] | undefined,
  formValues: Record<string, any>
): boolean {
  return useMemo(() => {
    if (!showIf) return true;

    const conditions = Array.isArray(showIf) ? showIf : [showIf];

    // All conditions must be true (AND logic)
    return conditions.every((condition) => evaluateCondition(condition, formValues));
  }, [showIf, formValues]);
}
