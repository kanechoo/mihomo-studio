import { useMemo, useState } from 'react';
import {
  X,
  Download,
  Link as LinkIcon,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseSubscription } from '../../core/parsers';
import type { IgnoredSections } from '../../core/parsers';
import type { ProxyNode } from '../../core/ir';
import { getProtocolDisplayName } from '../../data/protocols';
import { useIRStore } from '../../store/irStore';
import { useRemoteFetch } from '../../hooks/useRemoteFetch';
import { Toggle } from '../common/Toggle';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// What a fetch produced, held while the user decides what to keep.
interface Candidates {
  nodes: ProxyNode[];
  // Entries that could not be read, and sections of a Clash config that this
  // import deliberately leaves behind.
  warnings: string[];
  ignored?: IgnoredSections;
}

interface Feedback {
  success: boolean;
  message: string;
  details?: string[];
}

export function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { t } = useTranslation();
  const addProxies = useIRStore((state) => state.addProxies);
  const existingProxies = useIRStore((state) => state.ir.proxies);
  const { viaServer, setViaServer, canUseServer, download, describeFailure } = useRemoteFetch();

  const [subscriptionUrl, setSubscriptionUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<Feedback | null>(null);
  // Non-null once a fetch has produced something: the modal is then showing the
  // list rather than the URL field.
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Matched by name, which is what a proxy is identified by in an exported
  // config — the ids here are internal to this editor and a re-fetch mints new
  // ones, so they cannot answer "do I already have this node".
  const existingNames = useMemo(
    () => new Set(existingProxies.map((p) => p.name)),
    [existingProxies]
  );

  if (!isOpen) return null;

  const reset = () => {
    setSubscriptionUrl('');
    setResult(null);
    setCandidates(null);
    setSelectedIds(new Set());
  };

  const closeAndReset = () => {
    reset();
    onClose();
  };

  // Reads the subscription, from wherever the switch says.
  const handleFetch = async () => {
    const url = subscriptionUrl.trim();

    if (!url) {
      setResult({ success: false, message: t('subscription.error.empty') });
      return;
    }
    try {
      new URL(url);
    } catch {
      setResult({ success: false, message: t('subscription.error.invalidUrl') });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const content = await download(url);
      const parsed = await parseSubscription(content);

      if (!parsed.success || parsed.nodes.length === 0) {
        setResult({
          success: false,
          message: t('subscription.error.parse'),
          // Already collapsed and capped by the parser: an unrecognised document
          // used to yield one complaint per line, which arrived here as a wall.
          details: parsed.errors,
        });
        return;
      }

      // A Clash configuration carries far more than proxies. Only the proxies
      // are taken — replacing someone's groups and rules is what the editor
      // pane's YAML import is for, and it asks first.
      const ignored = 'ignored' in parsed ? (parsed.ignored as IgnoredSections) : undefined;
      setCandidates({ nodes: parsed.nodes, warnings: parsed.errors ?? [], ignored });

      // Everything not already in the configuration starts ticked, so the common
      // case — a first import, or a subscription that has grown a node — is one
      // click. Duplicates start unticked rather than hidden: a provider that
      // reissues a node under the same name is something to see, not to guess at.
      setSelectedIds(
        new Set(parsed.nodes.filter((n) => !existingNames.has(n.name)).map((n) => n.id))
      );
    } catch (error) {
      setResult({ success: false, message: describeFailure(error) });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    if (!candidates) return;

    const chosen = candidates.nodes.filter((node) => selectedIds.has(node.id));
    if (chosen.length === 0) return;

    addProxies(chosen);
    setCandidates(null);
    setResult({ success: true, message: t('subscription.success', { count: chosen.length }) });
    setTimeout(closeAndReset, 1500);
  };

  const total = candidates?.nodes.length ?? 0;
  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {candidates ? t('subscription.selectTitle') : t('subscription.title')}
            </h2>
          </div>
          <button
            onClick={closeAndReset}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {candidates ? (
            <div className="space-y-4">
              {/* What was left behind, and why */}
              {candidates.ignored &&
                (candidates.ignored.proxyGroups > 0 ||
                  candidates.ignored.rules > 0 ||
                  candidates.ignored.ruleProviders > 0 ||
                  candidates.ignored.proxyProviders > 0) && (
                  <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <LinkIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {t('subscription.clashDetected', {
                        groups: candidates.ignored.proxyGroups,
                        rules: candidates.ignored.rules,
                      })}
                      {/* Said separately because it explains a different thing:
                          a config whose nodes all sit behind providers has an
                          empty `proxies:`, and the list below would otherwise
                          be empty for no visible reason. */}
                      {candidates.ignored.proxyProviders > 0 && (
                        <>
                          {' '}
                          {t('subscription.clashProviders', {
                            count: candidates.ignored.proxyProviders,
                          })}
                        </>
                      )}
                    </p>
                  </div>
                )}

              {/* Select all / none */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('subscription.selectedCount', { count: selectedCount, total })}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedIds(new Set(candidates.nodes.map((n) => n.id)))}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                  >
                    {t('subscription.selectAll')}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                  >
                    {t('subscription.selectNone')}
                  </button>
                </div>
              </div>

              {/* The nodes */}
              <ul className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700 max-h-72 overflow-y-auto">
                {candidates.nodes.map((node) => {
                  const duplicate = existingNames.has(node.name);
                  return (
                    <li key={node.id}>
                      <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(node.id)}
                          onChange={() => toggleOne(node.id)}
                          className="w-4 h-4 flex-shrink-0"
                        />
                        <span className="text-sm text-gray-900 dark:text-white truncate flex-1">
                          {node.name}
                        </span>
                        {duplicate && (
                          <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200 flex-shrink-0">
                            {t('subscription.alreadyExists')}
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 flex-shrink-0">
                          {getProtocolDisplayName(node.type)}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
                          {node.server ? `${node.server}${node.port ? `:${node.port}` : ''}` : '—'}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              {/* Entries the parser refused */}
              {candidates.warnings.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('subscription.skippedTitle')}
                  </p>
                  {candidates.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">{warning}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Description */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <LinkIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium mb-1">{t('subscription.description')}</p>
                  <p className="text-blue-700 dark:text-blue-300">{t('subscription.note')}</p>
                </div>
              </div>

              {/* URL Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('subscription.label')}
                </label>
                <input
                  type="text"
                  value={subscriptionUrl}
                  onChange={(e) => {
                    setSubscriptionUrl(e.target.value);
                    setResult(null);
                  }}
                  placeholder={t('subscription.placeholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           text-sm"
                />
              </div>

              {/* Where the request is made from */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('remoteFetch.viaServer')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {canUseServer
                      ? t('remoteFetch.viaServerHint')
                      : t('remoteFetch.signInForServer')}
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
          )}

          {/* Result Message */}
          {result && (
            <div
              className={`mt-4 flex items-start gap-2 p-3 rounded-lg ${
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
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    result.success
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}
                >
                  {result.message}
                </p>
                {result.details && result.details.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {result.details.map((detail, idx) => (
                      <li key={idx} className="text-xs text-red-700 dark:text-red-300">
                        {detail}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          {candidates ? (
            <>
              <button
                onClick={() => {
                  setCandidates(null);
                  setSelectedIds(new Set());
                }}
                className="mr-auto px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-300
                         hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors
                         flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('subscription.back')}
              </button>
              <CancelButton onClick={closeAndReset}>{t('common.cancel')}</CancelButton>
              <PrimaryButton
                onClick={handleImport}
                disabled={selectedCount === 0}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t('subscription.importSelected', { count: selectedCount })}
              </PrimaryButton>
            </>
          ) : (
            <>
              <CancelButton onClick={closeAndReset}>{t('common.cancel')}</CancelButton>
              <PrimaryButton
                onClick={handleFetch}
                disabled={isProcessing || !subscriptionUrl.trim()}
                className="flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('subscription.fetching')}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    {t('subscription.fetch')}
                  </>
                )}
              </PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
