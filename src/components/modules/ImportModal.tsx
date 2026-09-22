import { useRef, useState } from 'react';
import { X, Upload, Link as LinkIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseBatchURIs } from '../../core/parsers';
import { useIRStore } from '../../store/irStore';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { t } = useTranslation();
  const addProxy = useIRStore((state) => state.addProxy);

  const [importText, setImportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Set synchronously, unlike isProcessing: state reaches the button's
  // disabled attribute only on the next render, so a fast double-click lands
  // twice before that flag could stop it — and every node was added twice.
  const busyRef = useRef(false);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (busyRef.current) return;

    if (!importText.trim()) {
      setResult({
        success: false,
        message: t('import.error.empty'),
      });
      return;
    }

    busyRef.current = true;
    setIsProcessing(true);
    setResult(null);

    try {
      const parseResult = await parseBatchURIs(importText);

      if (parseResult.success && parseResult.nodes.length > 0) {
        // Add all nodes to the store
        parseResult.nodes.forEach((node) => {
          addProxy(node);
        });

        // Empty the input now rather than when the modal closes: the success
        // message lingers for a moment, and an enabled button sitting over
        // unchanged text is one click away from importing it all again.
        setImportText('');
        setResult({
          success: true,
          message: t('import.success', { count: parseResult.nodes.length }),
        });

        // Close after a short delay, so the success message is seen.
        setTimeout(() => {
          setResult(null);
          onClose();
        }, 1500);
      } else {
        setResult({
          success: false,
          message: parseResult.errors?.join(', ') || t('import.error.parse'),
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : t('import.error.unknown'),
      });
    } finally {
      busyRef.current = false;
      setIsProcessing(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setImportText(text);
      setResult(null);
    } catch (error) {
      setResult({
        success: false,
        message: t('import.error.clipboard'),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('import.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            {/* Description */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <LinkIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">{t('import.description')}</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-300">
                  <li>{t('import.formats.vless')}</li>
                  <li>{t('import.formats.hysteria2')}</li>
                  <li>{t('import.formats.tuic')}</li>
                  <li>{t('import.formats.trojan')}</li>
                </ul>
              </div>
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('import.label')}
              </label>
              <textarea
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  setResult(null);
                }}
                placeholder={t('import.placeholder')}
                className="w-full h-64 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         font-mono text-sm resize-none"
              />
            </div>

            {/* Paste from Clipboard Button */}
            <button
              onClick={handlePaste}
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1"
            >
              <Upload className="w-4 h-4" />
              {t('import.pasteFromClipboard')}
            </button>

            {/* Result Message */}
            {result && (
              <div
                className={`flex items-start gap-2 p-3 rounded-lg ${
                  result.success
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : 'bg-red-50 dark:bg-red-900/20'
                }`}
              >
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                )}
                <p
                  className={`text-sm ${
                    result.success
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}
                >
                  {result.message}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton
            onClick={handleImport}
            disabled={isProcessing || !importText.trim()}
            className="flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('import.processing')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {t('import.import')}
              </>
            )}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
