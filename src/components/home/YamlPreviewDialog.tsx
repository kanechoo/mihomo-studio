import { useMemo, useState } from 'react';
import { Editor } from '@monaco-editor/react';
import { Check, Copy, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { downloadTextFile, yamlFilename } from '../common/download';
import { useUIStore } from '../../store/uiStore';

interface YamlPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  yaml: string;
  configName: string;
}

// Read-only YAML preview with copy and download. Monaco is configured exactly
// as the editor preview panes are (same theme pair, same options), so the text
// looks the same everywhere it appears.
export function YamlPreviewDialog({ isOpen, onClose, yaml, configName }: YamlPreviewDialogProps) {
  const { t } = useTranslation();
  const resolvedTheme = useUIStore((state) => state.resolvedTheme);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const filename = useMemo(() => yamlFilename(configName), [configName]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(yaml);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 1500);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${configName || t('server.title')} · YAML`}
      widthClass="max-w-4xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? t('home.server.copied') : copyFailed ? t('home.server.copyFailed') : t('home.server.copy')}
          </button>
          <button
            type="button"
            onClick={() => downloadTextFile(yaml, filename)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Download size={15} />
            {t('home.server.download')}
          </button>
        </>
      }
    >
      <div className="h-[60vh] rounded-md overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
        <Editor
          height="100%"
          defaultLanguage="yaml"
          language="yaml"
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
          value={yaml}
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
    </Modal>
  );
}
