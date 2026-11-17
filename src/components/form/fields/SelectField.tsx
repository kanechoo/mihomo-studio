import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Select } from '../../common/Select';
import type { FieldSchema } from '../../../schemas/types';

interface SelectFieldProps {
  field: FieldSchema;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  disabled?: boolean;
  // i18n key for why the dropdown will not open, shown instead of the
  // description.
  lockReason?: string;
}

export function SelectField({
  field,
  value,
  onChange,
  disabled = false,
  lockReason,
}: SelectFieldProps) {
  const { t } = useTranslation();

  const items = (field.options ?? []).map((option) => ({
    value: option.value.toString(),
    label: t(option.label),
  }));

  // A stored value the schema does not list — an imported config naming a
  // transport this form no longer offers, say. Left out, the dropdown paints
  // itself empty and reads as broken, so it is carried at the end of the list
  // instead: the config still says what it says, and moving off it stays a
  // decision rather than a side effect of opening the form.
  const current = value?.toString() ?? '';
  if (current !== '' && !items.some((item) => item.value === current)) {
    items.push({ value: current, label: current });
  }

  const note = lockReason ?? field.description;

  return (
    <div className="mb-4">
      <label
        htmlFor={field.fieldKey}
        className="block text-sm font-medium mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {t(field.label)}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {note && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t(note)}
        </p>
      )}
      <div className={field.clearable ? 'flex items-center gap-2' : undefined}>
        <div className={field.clearable ? 'min-w-0 flex-1' : undefined}>
          <Select
            id={field.fieldKey}
            value={current}
            placeholder={field.placeholder ? t(field.placeholder) : undefined}
            disabled={disabled}
            onChange={(val) => {
              // Try to preserve the original type
              const option = field.options?.find((o) => o.value.toString() === val);
              onChange(option ? option.value : val);
            }}
            items={items}
          />
        </div>
        {field.clearable && current !== '' && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t(field.clearLabel ?? 'common.reset')}
            title={t(field.clearLabel ?? 'common.reset')}
            className="p-2 rounded-md border shrink-0"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
