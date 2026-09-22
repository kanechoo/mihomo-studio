import { useState } from 'react';
import { FileUp, X, AlertCircle, CheckCircle, AlertTriangle, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIRStore } from '../../store/irStore';
import { useRemoteFetch } from '../../hooks/useRemoteFetch';
import { MihomoYAMLImporter } from '../../core/importers';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Toggle } from '../common/Toggle';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import type { MihomoIR } from '../../core/ir';

interface YAMLImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function YAMLImportModal({ isOpen, onClose }: YAMLImportModalProps) {
  const { t } = useTranslation();
  const importIR = useIRStore((state) => state.importIR);
  const { viaServer, setViaServer, canUseServer, download, describeFailure } = useRemoteFetch();

  const [yamlContent, setYamlContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // A document that parsed cleanly and is waiting to be allowed in. It is held
  // rather than applied because the confirmation is now a React dialog: unlike
  // `window.confirm` it cannot stop the world mid-function and hand back an
  // answer, so the parse and the decision are two separate steps.
  const [pendingImport, setPendingImport] = useState<{
    ir: MihomoIR;
    warnings?: string[];
  } | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    warnings?: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setYamlContent(content);
    };
    reader.readAsText(file);
  };

  // The third way in, alongside the file picker and the clipboard. It fills the
  // box rather than importing outright, for the same reason those two do: this
  // import replaces the whole configuration, and a document nobody has looked at
  // is a poor thing to replace it with.
  const handleFetchFromUrl = async () => {
    const url = sourceUrl.trim();

    if (!url) {
      setResult({ success: false, message: t('yamlImport.error.emptyUrl') });
      return;
    }
    try {
      new URL(url);
    } catch {
      setResult({ success: false, message: t('yamlImport.error.invalidUrl') });
      return;
    }

    setIsFetching(true);
    setResult(null);

    try {
      const content = await download(url);
      setYamlContent(content);

      // Said now rather than at Import, because the likely mistake is a specific
      // one worth naming: a node subscription pasted here, which is a different
      // button on a different tab.
      const importer = new MihomoYAMLImporter();
      setResult(
        importer.canImport(content)
          ? { success: true, message: t('yamlImport.fetched') }
          : { success: false, message: t('yamlImport.error.notAConfig') }
      );
    } catch (error) {
      setResult({ success: false, message: describeFailure(error) });
    } finally {
      setIsFetching(false);
    }
  };

  const handleImport = async () => {
    if (!yamlContent.trim()) {
      setResult({
        success: false,
        message: t('yamlImport.error.empty'),
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const importer = new MihomoYAMLImporter();

      if (!importer.canImport(yamlContent)) {
        setResult({
          success: false,
          message: t('yamlImport.error.invalidYaml'),
        });
        setIsProcessing(false);
        return;
      }

      const importResult = await importer.import(yamlContent);

      if (importResult.success && importResult.ir) {
        setPendingImport({ ir: importResult.ir, warnings: importResult.warnings });
      } else {
        setResult({
          success: false,
          message: importResult.errors?.join(', ') || t('yamlImport.error.parseFailed'),
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : t('yamlImport.error.unknown'),
      });
    }

    setIsProcessing(false);
  };

  // The other half of handleImport, reached once the replacement is agreed to.
  const applyImport = () => {
    if (!pendingImport) return;
    importIR(pendingImport.ir);
    setResult({
      success: true,
      message: t('yamlImport.success'),
      warnings: pendingImport.warnings,
    });
    setPendingImport(null);
    setTimeout(() => {
      onClose();
      setYamlContent('');
      setSourceUrl('');
      setResult(null);
    }, 2000);
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setYamlContent(text);
    } catch (error) {
      setResult({
        success: false,
        message: t('yamlImport.error.clipboard'),
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        className="p-6 rounded-lg max-w-3xl w-full mx-4 max-h-[80vh] overflow-auto"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('yamlImport.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-opacity-10 hover:bg-white"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {t('yamlImport.description')}
        </p>

        {/* File Upload */}
        <div className="mb-4">
          <label
            htmlFor="yaml-file-upload"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-md border-2 border-dashed cursor-pointer hover:border-opacity-60 transition-colors"
            style={{ borderColor: 'var(--border-color)' }}
          >
            <FileUp size={20} style={{ color: 'var(--text-secondary)' }} />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('yamlImport.clickToUpload')}
            </span>
          </label>
          <input
            id="yaml-file-upload"
            type="file"
            accept=".yaml,.yml"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* From a link */}
        <div className="mb-4">
          <label
            htmlFor="yaml-source-url"
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('yamlImport.fromUrl')}
          </label>
          <div className="flex gap-2">
            <input
              id="yaml-source-url"
              type="text"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                setResult(null);
              }}
              placeholder={t('yamlImport.urlPlaceholder')}
              className="flex-1 min-w-0 px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
            <PrimaryButton
              onClick={handleFetchFromUrl}
              disabled={isFetching || !sourceUrl.trim()}
              className="flex items-center gap-2 flex-shrink-0"
            >
              {isFetching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('yamlImport.fetching')}
                </>
              ) : (
                <>
                  <Download size={16} />
                  {t('yamlImport.fetch')}
                </>
              )}
            </PrimaryButton>
          </div>

          {/* Where the request is made from */}
          <div className="flex items-start justify-between gap-4 mt-3">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('remoteFetch.viaServer')}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {canUseServer ? t('remoteFetch.viaServerHint') : t('remoteFetch.signInForServer')}
              </p>
            </div>
            <Toggle
              checked={viaServer}
              onChange={setViaServer}
              disabled={!canUseServer}
              aria-label={t('remoteFetch.viaServer')}
            />
          </div>
        </div>

        {/* YAML Content Textarea */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            {t('yamlImport.label')}
          </label>
          <textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            placeholder={t('yamlImport.placeholder')}
            rows={12}
            className="w-full px-3 py-2 rounded-md border text-sm font-mono resize-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Result Message */}
        {result && (
          <div
            className={`mb-4 p-3 rounded-md ${
              result.success ? 'bg-green-500 bg-opacity-10' : 'bg-red-500 bg-opacity-10'
            }`}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p
                  className="text-sm"
                  style={{ color: result.success ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)' }}
                >
                  {result.message}
                </p>
                {result.warnings && result.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {result.warnings.map((warning, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-600 dark:text-yellow-400">{warning}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={handlePasteFromClipboard}
            className="px-4 py-2 rounded-md text-sm"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            {t('yamlImport.pasteFromClipboard')}
          </button>
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton
            onClick={handleImport}
            disabled={isProcessing || !yamlContent.trim()}
          >
            {isProcessing ? t('yamlImport.processing') : t('yamlImport.import')}
          </PrimaryButton>
        </div>
      </div>

      {/* A sibling of the panel, not a child of it: the panel is `overflow-auto`
          and this has to sit above it rather than scroll inside it. */}
      <ConfirmDialog
        isOpen={pendingImport !== null}
        title={t('yamlImport.replaceTitle')}
        message={t('yamlImport.confirmReplace')}
        confirmLabel={t('common.import')}
        onConfirm={applyImport}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
