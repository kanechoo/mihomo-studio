import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Dices } from 'lucide-react';
import type { ServerFieldDef, ServerGenerator } from '../../../schemas/listeners/dsl';
import { generateByKind } from '../../../core/server/generators/crypto';
import { FieldShell } from './FieldShell';

interface TagListFieldProps {
  def: ServerFieldDef;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}

export function TagListField({ def, value, onChange }: TagListFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const tags = value ?? [];

  const commit = () => {
    const entry = draft.trim();
    if (entry === '' || tags.includes(entry)) {
      setDraft('');
      return;
    }
    onChange([...tags, entry]);
    setDraft('');
  };

  return (
    <FieldShell def={def}>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-sm font-mono"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            {tag}
            <button
              type="button"
              aria-label={t('common.delete')}
              onClick={() => onChange(tags.filter((entry) => entry !== tag))}
              className="text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('common.noneSelected')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`${def.key}-draft`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={def.placeholderKey ? t(def.placeholderKey) : ''}
          className="flex-1 px-3 py-1.5 rounded-md border text-sm font-mono"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="button"
          onClick={commit}
          aria-label={t('common.add')}
          className="p-2 rounded-md border"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          <Plus size={14} />
        </button>
        {def.generator && (
          <button
            type="button"
            // Appending never overwrites, so no confirmation is needed here —
            // unlike the single-value secret field.
            onClick={() => onChange([...tags, generateByKind(def.generator as ServerGenerator)])}
            aria-label={t('server.fields.generateEntry')}
            title={t('server.fields.generateEntry')}
            className="p-2 rounded-md border"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Dices size={14} />
          </button>
        )}
      </div>
    </FieldShell>
  );
}
