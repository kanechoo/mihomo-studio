import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dices, Copy } from 'lucide-react';
import type { FieldSchema } from '../../../schemas/types';
import { generateByKind, type SecretGeneratorKind } from '../../../core/shared/generators/crypto';
import { generateRealityKeypair } from '../../../core/shared/generators/reality';
import { ConfirmDialog } from '../../common/ConfirmDialog';

interface TextFieldProps {
  field: FieldSchema;
  value: string;
  onChange: (value: string) => void;
  /** The module's values; needed to resolve a `generatorByOption` mapping. */
  allValues?: Record<string, unknown>;
}

// The watched field's current value picks the generator kind — e.g. a
// Shadowsocks password becomes SS2022 key material when a 2022 cipher is
// selected. Falls back to the static `generator` when nothing matches.
function resolveGenerator(field: FieldSchema, allValues: Record<string, unknown> | undefined) {
  if (field.generatorByOption && allValues) {
    const watched = field.generatorByOption.field
      .split('.')
      .reduce<unknown>(
        (node, key) =>
          node !== null && typeof node === 'object'
            ? (node as Record<string, unknown>)[key]
            : undefined,
        allValues
      );
    const kind = field.generatorByOption.kinds[String(watched)];
    if (kind) return kind;
  }
  return field.generator;
}

export function TextField({ field, value, onChange, allValues }: TextFieldProps) {
  const { t } = useTranslation();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  // Set after an x25519 keypair generation: the public half derived from the
  // private key now in the field, shown so it can be handed to the peer.
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const generator = resolveGenerator(field, allValues);

  const requestGenerate = () => {
    // Whatever is already in the box may be live credentials; regenerating is
    // destructive, so it asks first.
    if (value) setConfirmOverwrite(true);
    else doGenerate();
  };

  const doGenerate = () => {
    if (field.keypair === 'x25519') {
      const pair = generateRealityKeypair();
      onChange(pair.privateKey);
      setPublicKey(pair.publicKey);
      return;
    }
    onChange(generateByKind(generator as SecretGeneratorKind));
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
      <div className="flex items-center gap-2">
        <input
          id={field.fieldKey}
          type="text"
          value={value || ''}
          onChange={(e) => {
            setPublicKey(null);
            onChange(e.target.value);
          }}
          placeholder={field.placeholder ? t(field.placeholder) : ''}
          className="w-full px-3 py-2 rounded-md border text-sm font-mono"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
          required={field.required}
          pattern={field.pattern}
        />
        {(generator || field.keypair === 'x25519') && (
          <button
            type="button"
            onClick={requestGenerate}
            title={field.keypair === 'x25519' ? t('editor.generateKeypair') : t('editor.generate')}
            aria-label={
              field.keypair === 'x25519' ? t('editor.generateKeypair') : t('editor.generate')
            }
            className="p-2 rounded-md border shrink-0"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Dices size={15} />
          </button>
        )}
      </div>

      {field.keypair === 'x25519' && publicKey && (
        <div
          className="mt-2 p-3 rounded-md border space-y-1.5"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-primary)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('editor.keypairPublicKey')}
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 min-w-0 text-xs font-mono truncate px-2 py-1 rounded"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              title={publicKey}
            >
              {publicKey}
            </code>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(publicKey)}
              aria-label={t('common.copy')}
              title={t('common.copy')}
              className="p-1.5 rounded-md border shrink-0"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <Copy size={13} />
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('editor.keypairPublicKeyHint')}
          </p>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOverwrite}
        destructive={false}
        title={t('editor.generateOverwriteTitle')}
        message={t('editor.generateOverwriteBody')}
        confirmLabel={t('common.replace')}
        onConfirm={() => {
          setConfirmOverwrite(false);
          doGenerate();
        }}
        onCancel={() => setConfirmOverwrite(false)}
      />
    </div>
  );
}
