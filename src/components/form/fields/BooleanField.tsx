import { useTranslation } from 'react-i18next';
import { Toggle } from '../../common/Toggle';
import type { FieldSchema } from '../../../schemas/types';

interface BooleanFieldProps {
  field: FieldSchema;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  // i18n key for why the switch will not move, shown instead of the
  // description — which describes the setting rather than its being held.
  lockReason?: string;
}

export function BooleanField({
  field,
  value,
  onChange,
  disabled = false,
  lockReason,
}: BooleanFieldProps) {
  const { t } = useTranslation();

  const note = lockReason ?? field.description;

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex-1">
        <label
          htmlFor={field.fieldKey}
          className="block text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {t(field.label)}
        </label>
        {note && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t(note)}
          </p>
        )}
      </div>
      <div className="ml-4">
        <Toggle
          id={field.fieldKey}
          checked={value ?? false}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
