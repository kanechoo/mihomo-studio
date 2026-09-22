import { useEffect } from 'react';
import type { FieldSchema } from '../../schemas/types';
import { useConditionalField } from '../../hooks/useConditionalField';
import { FieldFactory } from './FieldFactory';

interface ConditionalFieldProps {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
  allValues: Record<string, any>;
}

export function ConditionalField({
  field,
  value,
  onChange,
  allValues,
}: ConditionalFieldProps) {
  const shouldShow = useConditionalField(field.showIf, allValues);

  // Both conditions are evaluated on every render, before anything returns.
  // useConditionalField answers `true` for an absent condition — the right
  // answer for showIf and the wrong one for a lock, hence the separate test for
  // whether there is a rule at all.
  const lock = field.lockIf;
  const lockMatches = useConditionalField(lock?.when, allValues);
  // `field.locked` is an unconditional lock declared by the schema itself; the
  // conditional variant above stays as-is for fields that lock only while a
  // sibling condition holds.
  const locked = field.locked === true || (lock !== undefined && lockMatches);
  const lockReason = field.locked === true
    ? field.lockReason
    : locked
      ? lock?.reason
      : undefined;

  // A locked field is not merely uneditable: it holds a particular value, and
  // that value has to be written rather than just drawn. A switch rendered as on
  // while the config underneath still says `false` would export the opposite of
  // what it shows.
  //
  // Deliberately outside the `shouldShow` gate below, so a lock on a field that
  // is currently hidden still applies.
  useEffect(() => {
    if (locked && lock && value !== lock.value) onChange(lock.value);
  }, [locked, lock, value, onChange]);

  if (!shouldShow) {
    return null;
  }

  return (
    <FieldFactory
      field={field}
      value={value}
      onChange={onChange}
      allValues={allValues}
      disabled={locked}
      lockReason={lockReason}
    />
  );
}
