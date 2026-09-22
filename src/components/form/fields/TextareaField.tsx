import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FieldSchema } from '../../../schemas/types';

interface TextareaFieldProps {
  field: FieldSchema;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}

const toLines = (text: string) => text.split('\n').filter((line) => line.trim() !== '');

export function TextareaField({ field, value, onChange }: TextareaFieldProps) {
  const { t } = useTranslation();

  // Store as a list when the schema says so, or when the value already is one.
  // Relying on the current value alone would keep a field that started out
  // empty as a plain string.
  const asList = field.asList || Array.isArray(value);

  const incoming = Array.isArray(value) ? value.join('\n') : value || '';

  // The textarea holds the raw text the user typed, not a rendering of what
  // was stored. A list value has its blank lines stripped, so feeding the
  // stored value straight back would delete the newline on the same keystroke
  // that created it — the caret could never reach the next line.
  const [text, setText] = useState(incoming);

  // What `incoming` would look like if the current text were saved and read
  // back. Equal means the incoming value is just the echo of what was typed.
  const echo = asList ? toLines(text).join('\n') : text;

  useEffect(() => {
    // Adopt the value only when it changed somewhere else — an import, a
    // reset, a different card mounted into this field. Skipping the echo is
    // what keeps a pending blank line alive.
    if (incoming !== echo) setText(incoming);
    // `echo` is deliberately not a dependency: it changes on every keystroke,
    // and re-running then would undo the edit being made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textValue = e.target.value;
    setText(textValue);
    onChange(asList ? toLines(textValue) : textValue);
  };

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
      <textarea
        id={field.fieldKey}
        value={text}
        onChange={handleChange}
        placeholder={field.placeholder}
        rows={4}
        className="w-full px-3 py-2 rounded-md border text-sm font-mono"
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
