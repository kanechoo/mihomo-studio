import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import yaml from 'js-yaml';
import * as anim from '../../animation/tokens';
import { Modal } from '../common/Modal';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { ServerSchemaForm } from './ServerSchemaForm';
import { useServerStore } from '../../store/serverStore';
import { getListenerSchema } from '../../schemas/listeners';
import { ensureRealitySection, syncDerivedRealityKey } from '../../core/server/factory';
import { deriveRealityPublicKey } from '../../core/shared/generators/reality';
import { listenerFromYamlNode } from '../../core/server/importers/serverYaml';
import { listenerToYamlNode } from '../../core/server/exporters/serverYaml';
import { setNestedValue } from '../../core/ir/factory';
import type { ListenerIR } from '../../core/server/types';

interface ListenerEditorPanelProps {
  listener: ListenerIR;
  onClose: () => void;
}

type EditorTab = 'fields' | 'raw';

// The listener editor buffers: every keystroke lands in a local draft and
// reaches the document only when Save is pressed. Closing by any other door —
// Cancel, ×, Escape, backdrop — throws the draft away, exactly like the client
// editor's edit dialogs.
export function ListenerEditorPanel({ listener, onClose }: ListenerEditorPanelProps) {
  const { t } = useTranslation();
  const replaceListener = useServerStore((s) => s.replaceListener);

  // Deep-cloned once at mount: setNestedValue mutates in place, and writing
  // through must not touch the stored listener until Save says so.
  const [draft, setDraft] = useState<ListenerIR>(() => structuredClone(listener));
  const [tab, setTab] = useState<EditorTab>('fields');
  const [rawText, setRawText] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  const schema = getListenerSchema(draft.type, draft.tuicVersion);
  const rawYaml = rawText ?? yaml.dump(listenerToYamlNode(draft), { lineWidth: -1 });

  const changeDraftField = (path: string, value: unknown) => {
    setDraft((prev) => {
      const next = { ...prev };
      // Typing into Reality before the section exists (or flipping the mode
      // onto it) scaffolds the whole block first — see ensureRealitySection.
      if ((path === 'tls.mode' && value === 'reality') || path.startsWith('tls.reality.')) {
        next.tls = ensureRealitySection(next.tls);
      }
      setNestedValue(next as unknown as Record<string, unknown>, path, value);
      // The public half is derived from whatever private key just landed, so
      // share links can read it out of the document later.
      syncDerivedRealityKey(next.tls, path, value);
      return next;
    });
  };

  // The raw tab's Apply merges into the draft too — it stays part of the same
  // unsaved session until Save commits everything at once.
  const applyRaw = () => {
    try {
      const parsed = yaml.load(rawYaml) as Record<string, unknown>;
      const result = listenerFromYamlNode(parsed ?? {});
      if (!result) {
        setRawError(t('server.import.notMapping'));
        return;
      }
      setDraft((prev) => {
        const merged: ListenerIR = {
          ...prev,
          ...result.listener,
          id: prev.id,
          enabled: prev.enabled,
        };
        // An imported private key arrives without its public half — derive it
        // here so the merged document is link-complete.
        if (merged.tls.reality) {
          merged.tls.reality.publicKey =
            deriveRealityPublicKey(merged.tls.reality.privateKey ?? '');
        }
        return merged;
      });
      setRawError(null);
      setRawText(null);
    } catch (error) {
      setRawError(error instanceof Error ? error.message : String(error));
    }
  };

  const tabs: { key: EditorTab; label: string }[] = [
    { key: 'fields', label: t('server.editor.fields') },
    { key: 'raw', label: t('server.editor.raw') },
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={draft.name}
      widthClass="max-w-3xl"
      footer={
        <>
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton
            onClick={() => {
              replaceListener(listener.id, draft);
              onClose();
            }}
          >
            {t('common.save')}
          </PrimaryButton>
        </>
      }
    >
      {/* No padding or scroll of its own: the modal body already pads and
          scrolls, and a second scroll container inside it read as two pages
          fighting over one wheel. */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex border-b -mb-px" style={{ borderColor: 'var(--border-color)' }}>
            {tabs.map(({ key, label }) => {
              const isActive = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className="relative px-3 py-2 text-sm font-medium shrink-0 transition-colors"
                  style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {label}
                  {isActive && (
                    <motion.span
                      layoutId="listener-editor-tab-underline"
                      className="absolute left-0 right-0 bottom-0 h-0.5"
                      style={{ backgroundColor: 'var(--accent)' }}
                      transition={anim.layoutSpring}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          {tab === 'fields' && schema && (
            <ServerSchemaForm fields={schema.fields} values={draft} onChange={changeDraftField} />
          )}

          {tab === 'raw' && (
            <div>
              <textarea
                rows={16}
                value={rawYaml}
                spellCheck={false}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full px-3 py-2 rounded-md border text-xs font-mono"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              />
              {rawError && (
                <p className="text-xs mt-1 text-red-500" role="alert">
                  {rawError}
                </p>
              )}
              <div className="flex justify-end mt-2">
                <motion.button
                  type="button"
                  onClick={applyRaw}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--accent)' }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                >
                  {t('server.editor.rawApply')}
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
