import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import {
  type KvEntry,
  kvEntriesToRecord,
  recordToKvEntries,
  upsertKvEntry,
  removeKvEntry,
} from './kv';
import { FieldShell, serverInputClass, serverInputStyle } from './FieldShell';

interface KvMapFieldProps {
  def: ServerFieldDef;
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string>) => void;
}

export function KvMapField({ def, value, onChange }: KvMapFieldProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<KvEntry[]>(() => recordToKvEntries(value));

  useEffect(() => {
    const incoming = value ?? {};
    if (JSON.stringify(kvEntriesToRecord(entries)) !== JSON.stringify(incoming)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt external value only when it differs; local edits already flow up through onChange
      setEntries(recordToKvEntries(incoming));
    }
  }, [value]);

  const apply = (next: KvEntry[]) => {
    setEntries(next);
    onChange(kvEntriesToRecord(next));
  };

  const inputStyle = serverInputStyle();
  const keyPlaceholder = def.keyPlaceholderKey ? t(def.keyPlaceholderKey) : 'KEY';
  const valuePlaceholder = def.valuePlaceholderKey ? t(def.valuePlaceholderKey) : 'VALUE';

  return (
    <FieldShell def={def}>
      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={entry.key}
              spellCheck={false}
              placeholder={keyPlaceholder}
              onChange={(e) => apply(upsertKvEntry(entries, index, { key: e.target.value }))}
              className={`${serverInputClass} font-mono w-1/3`}
              style={inputStyle}
            />
            <input
              type="text"
              value={entry.value}
              spellCheck={false}
              placeholder={valuePlaceholder}
              onChange={(e) => apply(upsertKvEntry(entries, index, { value: e.target.value }))}
              className={`${serverInputClass} font-mono flex-1`}
              style={inputStyle}
            />
            <button
              type="button"
              aria-label={t('common.delete')}
              onClick={() => apply(removeKvEntry(entries, index))}
              className="p-2 rounded-md border shrink-0"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEntries([...entries, { key: '', value: '' }])}
        className="mt-2 flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
      >
        <Plus size={14} />
        {t('server.fields.addEntry')}
      </button>
    </FieldShell>
  );
}
