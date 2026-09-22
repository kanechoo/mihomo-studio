import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { FieldSchema } from '../../../schemas/types';
import { toStringList } from '../../../core/ir';

interface MultiSelectFieldProps {
  field: FieldSchema;
  // A stored value is normally a list, but a config written before this field
  // was a list — or hand-edited in the YAML pane — can hold a bare string.
  value: string[] | string | undefined;
  onChange: (value: string[]) => void;
}

// Picks several values from a short, fixed list — ALPN protocols and the like.
// Chips rather than a dropdown, because every list this renders is two or three
// entries and a menu would hide them behind a click.
//
// Selection order is kept: for ALPN the list is a preference order, so ticking
// h2 first has to mean something different from ticking http/1.1 first.
export function MultiSelectField({ field, value, onChange }: MultiSelectFieldProps) {
  const { t } = useTranslation();

  const selected = toStringList(value);

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((entry) => entry !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div className="mb-4">
      <span className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
        {t(field.label)}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {field.description && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t(field.description)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(field.options ?? []).map((option) => {
          const optionValue = option.value.toString();
          const isSelected = selected.includes(optionValue);
          return (
            <label
              key={optionValue}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer select-none"
              style={{
                backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                borderColor: isSelected ? 'var(--accent)' : 'var(--border-color)',
                color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {/* A real checkbox, hidden but focusable: keyboard toggling and
                  screen-reader semantics come with it rather than being
                  reimplemented on a div. */}
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => toggle(optionValue)}
              />
              {isSelected && <Check size={14} className="shrink-0" />}
              <span className="font-mono">{t(option.label)}</span>
            </label>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
          {t('common.noneSelected')}
        </p>
      )}
    </div>
  );
}
