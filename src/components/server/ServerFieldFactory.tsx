import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { ServerFieldDef, ServerOption } from '../../schemas/listeners/dsl';
import { useConditionalField } from '../../hooks/useConditionalField';
import { getNestedValue } from '../../core/ir';
import { FieldShell, serverInputClass, serverInputStyle } from './fields/FieldShell';
import { Toggle } from '../common/Toggle';
import { Select } from '../common/Select';
import { SecretTextField } from './fields/SecretTextField';
import { PortExpressionField } from './fields/PortExpressionField';
import { PemTextareaField } from './fields/PemTextareaField';
import { TagListField } from './fields/TagListField';
import { KvMapField } from './fields/KvMapField';
import { UserListField } from './fields/UserListField';

export interface ServerFieldFactoryProps {
  def: ServerFieldDef;
  values: Record<string, unknown>;
  onChange: (path: string, value: unknown) => void;
}

function optionLabel(option: ServerOption, t: (key: string) => string): string {
  return option.labelKey ? t(option.labelKey) : (option.label ?? String(option.value));
}

export function ServerConditionalField({
  def,
  values,
  children,
}: {
  def: ServerFieldDef;
  values: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const visible = useConditionalField(def.showIf, values as Record<string, never>);
  if (!visible) return null;
  return <>{children}</>;
}

export function ServerFieldFactory({ def, values, onChange }: ServerFieldFactoryProps) {
  const { t } = useTranslation();
  const value = getNestedValue(values, def.key);
  const change = (v: unknown) => onChange(def.key, v);

  switch (def.type) {
    case 'text':
    case 'number': {
      return (
        <FieldShell def={def}>
          <input
            id={def.id ?? def.key}
            type={def.type === 'number' ? 'number' : 'text'}
            value={value === undefined || value === null ? '' : String(value)}
            min={def.min}
            max={def.max}
            pattern={def.pattern}
            spellCheck={false}
            placeholder={def.placeholderKey ? t(def.placeholderKey) : ''}
            className={`${serverInputClass}${def.type === 'text' ? ' font-mono' : ''}`}
            style={serverInputStyle()}
            onChange={(e) =>
              change(
                def.type === 'number'
                  ? e.target.value === ''
                    ? null
                    : Number(e.target.value)
                  : e.target.value
              )
            }
          />
        </FieldShell>
      );
    }

    case 'boolean': {
      // Same row as the client BooleanField: label and description on the
      // left, the shared toggle on the right.
      return (
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label
              htmlFor={def.id ?? def.key}
              className="block text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {t(def.labelKey)}
            </label>
            {def.descriptionKey && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t(def.descriptionKey)}
              </p>
            )}
          </div>
          <div className="ml-4 shrink-0">
            <Toggle
              id={def.id ?? def.key}
              checked={Boolean(value)}
              onChange={(checked) => change(checked)}
            />
          </div>
        </div>
      );
    }

    case 'select': {
      // The app dropdown, not a native select: a themed listbox instead of an
      // OS-painted one that ignores dark mode.
      const items = (def.options ?? []).map((option) => ({
        value: String(option.value),
        label: optionLabel(option, t),
      }));
      const current = value === undefined || value === null ? '' : String(value);
      // A stored value no option names is appended rather than hidden, so the
      // config keeps saying what it says — same contract as SelectField.
      if (current !== '' && !items.some((item) => item.value === current)) {
        items.push({ value: current, label: current });
      }
      return (
        <FieldShell def={def}>
          <Select
            id={def.id ?? def.key}
            value={current}
            onChange={(next) => {
              const match = (def.options ?? []).find((o) => String(o.value) === next);
              change(match ? match.value : next);
            }}
            items={items}
          />
        </FieldShell>
      );
    }

    case 'multiselect': {
      // Chips like the client MultiSelectField: a real checkbox behind each
      // chip carries keyboard toggling and screen-reader semantics.
      const selected = Array.isArray(value) ? value.map(String) : [];
      const toggle = (entry: string) => {
        change(
          selected.includes(entry)
            ? selected.filter((item) => item !== entry)
            : [...selected, entry]
        );
      };
      return (
        <FieldShell def={def}>
          <div className="flex flex-wrap gap-2">
            {(def.options ?? []).map((option) => {
              const optionValue = String(option.value);
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
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => toggle(optionValue)}
                  />
                  {isSelected && <Check size={14} className="shrink-0" />}
                  <span>{optionLabel(option, t)}</span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    case 'secret-text':
      return (
        <SecretTextField def={def} value={value as string} onChange={(v) => change(v)} values={values} />
      );

    case 'port-expression':
      return (
        <PortExpressionField def={def} value={value as string} onChange={(v) => change(v)} />
      );

    case 'pem':
      return (
        <PemTextareaField def={def} value={value as string} onChange={(v) => change(v)} />
      );

    case 'tag-list':
      return (
        <TagListField def={def} value={value as string[]} onChange={(v) => change(v)} />
      );

    case 'kv-map':
      return (
        <KvMapField
          def={def}
          value={value as Record<string, string>}
          onChange={(v) => change(v)}
        />
      );

    case 'user-list':
      return (
        <UserListField
          def={def}
          value={value as Record<string, unknown>[]}
          onChange={(v) => change(v)}
        />
      );

    default:
      return null;
  }
}
