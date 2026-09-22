import { useState } from 'react';
import { motion } from 'motion/react';
import { Copy, Download, Check, FileUp, ShieldCheck, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { IconSwap } from '../../animation/IconSwap';
import { Select } from '../common/Select';
import * as anim from '../../animation/tokens';
import { useExporter, useCopyConfig, useDownloadConfig } from '../../hooks/useExporter';
import { useUIStore } from '../../store/uiStore';
import { YAMLImportModal } from '../modules/YAMLImportModal';
import { validateWithMihomo, formatDurationSeconds } from '../../api/mihomo';
import type { ValidateOutcome } from '../../api/mihomo';

// One real-binary validation run and what the UI should show for it. The
// state lives here rather than in a store: it is per-pane ephemera with no
// reason to outlive the component, let alone persist.
type ValidateState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; outcome: ValidateOutcome };

export function EditorPane() {
  const { t } = useTranslation();
  const output = useExporter();
  const copyConfig = useCopyConfig();
  const downloadConfig = useDownloadConfig();
  // The resolved theme, not the preference: Monaco needs a concrete palette,
  // and `system` is not one.
  const resolvedTheme = useUIStore((state) => state.resolvedTheme);
  const exportFormat = useUIStore((state) => state.exportFormat);
  const setExportFormat = useUIStore((state) => state.setExportFormat);

  const [copied, setCopied] = useState(false);
  const [isYAMLImportModalOpen, setIsYAMLImportModalOpen] = useState(false);
  const [validate, setValidate] = useState<ValidateState>({ phase: 'idle' });

  const handleCopy = async () => {
    const success = await copyConfig();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // No filename override: the hook derives one from the export format.
  const handleDownload = () => {
    downloadConfig();
  };

  // Only meaningful for the mihomo format — a Sing-Box document is not
  // something mihomo can parse, and pretending otherwise would produce a
  // verdict about nothing.
  const handleValidate = async () => {
    if (exportFormat !== 'mihomo' || validate.phase === 'running') return;
    setValidate({ phase: 'running' });
    const outcome = await validateWithMihomo(output);
    setValidate({ phase: 'done', outcome });
  };

  const validateBadge = () => {
    if (validate.phase === 'idle') return null;
    if (validate.phase === 'running') {
      return (
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 size={12} className="animate-spin" />
          {t('editor.validate.running')}
        </span>
      );
    }
    const { outcome } = validate;
    if (outcome.kind === 'unavailable') {
      return (
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }} title={outcome.reason}>
          {t('editor.validate.unavailable')}
        </span>
      );
    }
    if (outcome.kind === 'error') {
      return (
        <span className="text-xs" style={{ color: '#f59e0b' }}>
          {t('editor.validate.error', { message: outcome.message })}
        </span>
      );
    }
    // Invalid configs surface the structured diagnostics (capped) in the
    // tooltip — never the raw stderr, which can run to tens of kilobytes and
    // makes the browser tooltip unusable.
    const diagnostics = outcome.result.diagnostics;
    const shownDiagnostics = diagnostics.slice(0, 5).map((diagnostic) =>
      [diagnostic.section, diagnostic.line ? `L${diagnostic.line}` : null, diagnostic.message]
        .filter(Boolean)
        .join(' '),
    );
    const hiddenCount = diagnostics.length - shownDiagnostics.length;
    const invalidTitle =
      shownDiagnostics.length > 0
        ? [...shownDiagnostics, ...(hiddenCount > 0 ? [t('editor.validate.invalidMore', { count: hiddenCount })] : [])].join('\n')
        : outcome.result.stderr.slice(0, 300);
    return outcome.result.valid ? (
      <span
        className="flex items-center gap-1 text-xs"
        style={{ color: '#16a34a' }}
        title={t('editor.validate.validTitle')}
      >
        <ShieldCheck size={12} />
        {t('editor.validate.valid', { s: formatDurationSeconds(outcome.result.durationMs) })}
      </span>
    ) : (
      <span className="flex items-center gap-1 text-xs" style={{ color: '#ef4444' }} title={invalidTitle}>
        <X size={12} />
        {t('editor.validate.invalid', {
          count: diagnostics.length || 1,
        })}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 flex-wrap p-4 border-b"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('editor.title')}
          </h2>
          <Select<'mihomo' | 'singbox'>
            value={exportFormat}
            onChange={(v) => {
              setExportFormat(v);
              setValidate({ phase: 'idle' });
            }}
            className="px-3 py-1.5 rounded-md border text-sm"
            aria-label={t('editor.format')}
            items={[
              { value: 'mihomo', label: 'Mihomo (YAML)' },
              { value: 'singbox', label: 'Sing-Box (JSON)' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {validateBadge()}
          {exportFormat === 'mihomo' && (
            <motion.button
              onClick={handleValidate}
              disabled={validate.phase === 'running'}
              className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
              }}
              whileHover={{ scale: 1.04, opacity: 0.9 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
              title={t('editor.validate.title')}
            >
              <ShieldCheck size={16} />
              {t('editor.validate.button')}
            </motion.button>
          )}
          <motion.button
            onClick={() => setIsYAMLImportModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
            whileHover={{ scale: 1.04, opacity: 0.9 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <FileUp size={16} />
            {t('yamlImport.title')}
          </motion.button>
          <motion.button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
            whileHover={{ scale: 1.04, opacity: 0.9 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            {/* Copying puts nothing on screen — the whole confirmation is this
                tick, so it is worth the moment it takes to arrive. */}
            <IconSwap swapKey={copied ? 'copied' : 'idle'}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconSwap>
            {copied ? t('editor.copied') : t('editor.copy')}
          </motion.button>
          <motion.button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--accent)' }}
            whileHover={{ scale: 1.04, opacity: 0.92 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <Download size={16} />
            {t('editor.download')}
          </motion.button>
        </div>
      </div>

      {/* Monaco */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="yaml"
          language={exportFormat === 'mihomo' ? 'yaml' : 'json'}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
          value={output}
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

      <YAMLImportModal
        isOpen={isYAMLImportModalOpen}
        onClose={() => setIsYAMLImportModalOpen(false)}
      />
    </div>
  );
}
