import { useTranslation } from 'react-i18next';
import type { FieldSchema } from '../../../schemas/types';

interface NumberFieldProps {
  field: FieldSchema;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}

export function NumberField({ field, value, onChange }: NumberFieldProps) {
  const { t } = useTranslation();

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
      {field.description && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t(field.description)}
        </p>
      )}
      <input
        id={field.fieldKey}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          // Clearing a numeric input un-sets the field rather than becoming
          // `0`. A zero the user never typed would leak into the export and
          // keep the surrounding option block alive.
          onChange(e.target.value === '' ? null : Number(e.target.value));
        }}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        className="w-full px-3 py-2 rounded-md border text-sm"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
          color: 'var(--text-primary)',
        }}
        required={field.required}
      />
    </div>
  );
}
