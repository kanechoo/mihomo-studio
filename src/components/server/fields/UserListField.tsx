import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Dices } from 'lucide-react';
import type { ServerFieldDef, ServerFieldDef as ItemDef } from '../../../schemas/listeners/dsl';
import {
  generateByKind,
  type SecretGeneratorKind,
} from '../../../core/server/generators/crypto';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { FieldShell, serverInputClass, serverInputStyle } from './FieldShell';

interface UserListFieldProps {
  def: ServerFieldDef;
  value: Record<string, unknown>[] | undefined;
  onChange: (value: Record<string, unknown>[]) => void;
}

function emptyRow(itemFields: ItemDef[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const item of itemFields) {
    row[item.key] = item.type === 'number' ? item.default ?? 0 : item.default ?? '';
  }
  return row;
}

// One user row's secret cell: same affordances as the standalone secret field
// — reveal for sensitive values, a dice that produces protocol-correct random
// material, and an overwrite question before replacing something already typed.
function SecretCell({
  item,
  rowKey,
  value,
  onCommit,
}: {
  item: ItemDef;
  rowKey: string;
  value: string;
  onCommit: (next: string) => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const generator = item.generator as SecretGeneratorKind | undefined;

  const requestGenerate = () => {
    if (value) setConfirmOverwrite(true);
    else onCommit(generateByKind(generator!));
  };

  return (
    <>
      <div className="flex items-center gap-1 w-full">
        <input
          id={rowKey}
          type={item.sensitive && !revealed ? 'password' : 'text'}
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onCommit(e.target.value)}
          className={`${serverInputClass} font-mono flex-1 min-w-0`}
          style={serverInputStyle()}
        />
        {item.sensitive && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={t(revealed ? 'server.fields.hide' : 'server.fields.show')}
            title={t(revealed ? 'server.fields.hide' : 'server.fields.show')}
            className="p-2 rounded-md border shrink-0"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        {generator && (
          <button
            type="button"
            onClick={requestGenerate}
            aria-label={t('server.fields.generate')}
            title={t('server.fields.generate')}
            className="p-2 rounded-md border shrink-0"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Dices size={13} />
          </button>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmOverwrite}
        destructive={false}
        title={t('server.fields.generateOverwriteTitle')}
        message={t('server.fields.generateOverwriteBody')}
        confirmLabel={t('server.fields.generateReplace')}
        onConfirm={() => {
          setConfirmOverwrite(false);
          onCommit(generateByKind(generator!));
        }}
        onCancel={() => setConfirmOverwrite(false)}
      />
    </>
  );
}

export function UserListField({ def, value, onChange }: UserListFieldProps) {
  const { t } = useTranslation();
  const rows = value ?? [];
  const itemFields = def.itemFields ?? [];
  const inputStyle = serverInputStyle();

  const update = (index: number, key: string, v: unknown) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: v } : row)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <FieldShell def={def}>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex items-end gap-2 p-2 rounded-md border"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                aria-label={t('server.fields.moveUp')}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="p-1 rounded border disabled:opacity-30"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                <ArrowUp size={12} />
              </button>
              <button
                type="button"
                aria-label={t('server.fields.moveDown')}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
                className="p-1 rounded border disabled:opacity-30"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
              >
                <ArrowDown size={12} />
              </button>
            </div>

            {itemFields.map((item) => (
              <div key={item.key} className="flex-1 min-w-0">
                <label
                  htmlFor={`${def.key}-${index}-${item.key}`}
                  className="block text-xs mb-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t(item.labelKey)}
                </label>
                {item.type === 'number' ? (
                  <input
                    id={`${def.key}-${index}-${item.key}`}
                    type="number"
                    value={typeof row[item.key] === 'number' ? (row[item.key] as number) : ''}
                    onChange={(e) =>
                      update(index, item.key, e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    className={serverInputClass}
                    style={inputStyle}
                  />
                ) : item.generator || item.sensitive ? (
                  <SecretCell
                    item={item}
                    rowKey={`${def.key}-${index}-${item.key}`}
                    value={typeof row[item.key] === 'string' ? (row[item.key] as string) : ''}
                    onCommit={(next) => update(index, item.key, next)}
                  />
                ) : (
                  <input
                    id={`${def.key}-${index}-${item.key}`}
                    type="text"
                    value={typeof row[item.key] === 'string' ? (row[item.key] as string) : ''}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => update(index, item.key, e.target.value)}
                    className={`${serverInputClass} font-mono`}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}

            <button
              type="button"
              aria-label={t('common.delete')}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
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
        onClick={() => onChange([...rows, emptyRow(itemFields)])}
        className="mt-2 flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
      >
        <Plus size={14} />
        {t('server.fields.addUser')}
      </button>
    </FieldShell>
  );
}
