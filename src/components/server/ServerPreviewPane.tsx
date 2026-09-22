import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { useUIStore } from '../../store/uiStore';
import { useServerExporter } from '../../hooks/useServerExporter';
import { IconSwap } from '../../animation/IconSwap';
import * as anim from '../../animation/tokens';
import { Check, Copy } from 'lucide-react';

// The right pane: the generated document under a Config Preview header,
// mirroring the client EditorPane — same Monaco options, same theme pair, same
// button treatment — because the two previews are the same control looking at
// two documents.
export function ServerPreviewPane() {
  const { t } = useTranslation();
  const exported = useServerExporter();
  const resolvedTheme = useUIStore((state) => state.resolvedTheme);

  return (
    <div className="flex flex-col min-w-0 min-h-0 basis-1/2 lg:basis-auto lg:w-1/2 lg:border-l" style={{ borderColor: 'var(--border-color)' }}>
      <div
        className="flex items-center justify-between p-4 border-b shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
          {t('server.preview.title')}
        </h2>
        <div className="flex items-center gap-2">
          {exported.error && (
            <span className="text-xs" style={{ color: '#ef4444' }} role="alert">
              {t('server.preview.error')}
            </span>
          )}
          <CopyButton text={exported.yaml} />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          language="yaml"
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
          value={exported.yaml}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={copy}
      disabled={!text.trim()}
      aria-label={t('common.copy')}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        color: copied ? 'var(--accent)' : 'var(--text-primary)',
      }}
      whileHover={text.trim() ? { scale: 1.04, opacity: 0.9 } : undefined}
      whileTap={text.trim() ? { scale: 0.96 } : undefined}
      transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
    >
      {/* Same confirmation as the client preview's copy: the tick is the whole receipt. */}
      <IconSwap swapKey={copied ? 'copied' : 'copy'} size={16}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </IconSwap>
      {copied ? t('common.copied') : t('common.copy')}
    </motion.button>
  );
}
