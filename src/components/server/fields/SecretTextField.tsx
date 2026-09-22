import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Copy, Check, Dices } from 'lucide-react';
import { IconSwap } from '../../../animation/IconSwap';
import {
  generateByKind,
  type SecretGeneratorKind,
} from '../../../core/server/generators/crypto';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import { getNestedValue } from '../../../core/ir';
import { createRealityKeypair } from '../../../api/realityKeys';
import { generateRealityKeypair } from '../../../core/shared/generators/reality';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import { FieldShell, serverInputClass, serverInputStyle } from './FieldShell';

interface SecretTextFieldProps {
  def: ServerFieldDef;
  value: string | undefined;
  onChange: (value: string) => void;
  /** Sibling values, needed to resolve a `generatorByOption` mapping. */
  values?: Record<string, unknown>;
}

// The generator that applies right now. A plain `generator` is static; a
// `generatorByOption` picks its kind from the watched field's current value —
// e.g. the Shadowsocks password must be cipher-shaped SS2022 key material when
// a 2022 cipher is selected and an ordinary password otherwise.
function resolveGenerator(
  def: ServerFieldDef,
  values: Record<string, unknown> | undefined
): SecretGeneratorKind | undefined {
  if (def.generatorByOption && values) {
    const watched = getNestedValue(values, def.generatorByOption.field);
    const kind = def.generatorByOption.kinds[String(watched)];
    if (kind) return kind;
  }
  return def.generator;
}

export function SecretTextField({ def, value, onChange, values }: SecretTextFieldProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  // True while a server-side generation is in flight; the dice goes inert so
  // a slow backend cannot produce two pairs where one was asked for.
  const [generating, setGenerating] = useState(false);
  // Set when generation had to fall back to local: the note under the field
  // says where the pair came from instead of leaving it a mystery.
  const [generatedLocally, setGeneratedLocally] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  // The stored public half lives in the document next to the private key —
  // written by whoever persists the private side (see syncDerivedRealityKey),
  // which is why hand-edited keys get their counterpart too. Reading it here
  // keeps this box honest after save/reload rather than vanishing with state.
  const publicKey =
    def.keypair === 'reality'
      ? (getNestedValue(values ?? {}, 'tls.reality.publicKey') as string | undefined)
      : undefined;

  const canGenerate = Boolean(def.keypair === 'reality' || resolveGenerator(def, values));

  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const copyPublicKey = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the text stays selectable */
    }
  };

  const requestGenerate = () => {
    // A field that already carries a value usually holds working credentials:
    // regenerating breaks every client holding the old one. Ask first.
    if (value) setConfirmOverwrite(true);
    else void doGenerate();
  };

  const doGenerate = async () => {
    if (def.keypair === 'reality') {
      setGenerating(true);
      try {
        // Backend first: the account keeps the public key on file for
        // subscription rendering. Offline or before the service ships the
        // endpoint, the same pair is produced locally — X25519 is X25519.
        let pair;
        try {
          pair = await createRealityKeypair();
          setGeneratedLocally(false);
        } catch {
          const local = generateRealityKeypair();
          pair = { privateKey: local.privateKey, publicKey: local.publicKey };
          setGeneratedLocally(true);
        }
        onChange(pair.privateKey);
        setRevealed(true);
      } finally {
        setGenerating(false);
      }
      return;
    }
    const kind = resolveGenerator(def, values);
    if (!kind) return;
    onChange(generateByKind(kind));
  };

  return (
    <FieldShell def={def}>
      <div className="flex items-center gap-2">
        <input
          id={def.key}
          type={revealed ? 'text' : 'password'}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholderKey ? t(def.placeholderKey) : ''}
          autoComplete="off"
          spellCheck={false}
          className={`${serverInputClass} font-mono flex-1`}
          style={serverInputStyle()}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={t(revealed ? 'server.fields.hide' : 'server.fields.show')}
          className="p-2 rounded-md border"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          aria-label={t('common.copy')}
          className="p-2 rounded-md border disabled:opacity-40"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <IconSwap swapKey={copied ? 'copied' : 'copy'} size={14}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </IconSwap>
        </button>
        {canGenerate && (
          <button
            type="button"
            onClick={requestGenerate}
            disabled={generating}
            title={
              def.keypair === 'reality'
                ? t('server.fields.generateKeypair')
                : t('server.fields.generate')
            }
            aria-label={
              def.keypair === 'reality'
                ? t('server.fields.generateKeypair')
                : t('server.fields.generate')
            }
            className="p-2 rounded-md border disabled:opacity-40"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <IconSwap swapKey={generating ? 'busy' : 'idle'} size={14}>
              {generating ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Dices size={14} />
              )}
            </IconSwap>
          </button>
        )}
      </div>

      {def.keypair === 'reality' && publicKey && (
        <div
          className="mt-2 p-3 rounded-md border space-y-1.5"
          style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-primary)' }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('server.fields.realityPublicKey')}
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
              onClick={copyPublicKey}
              aria-label={t('common.copy')}
              title={t('common.copy')}
              className="p-1.5 rounded-md border shrink-0"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <Copy size={13} />
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('server.fields.realityPublicKeyHint')}
          </p>
        </div>
      )}

      {canGenerate && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {def.keypair === 'reality' && generatedLocally
            ? t('server.fields.generatedOffline')
            : t('server.fields.cryptoNote')}
        </p>
      )}

      <ConfirmDialog
        isOpen={confirmOverwrite}
        destructive={false}
        title={t('server.fields.generateOverwriteTitle')}
        message={t('server.fields.generateOverwriteBody')}
        confirmLabel={t('server.fields.generateReplace')}
        onConfirm={() => {
          setConfirmOverwrite(false);
          void doGenerate();
        }}
        onCancel={() => setConfirmOverwrite(false)}
      />
    </FieldShell>
  );
}
