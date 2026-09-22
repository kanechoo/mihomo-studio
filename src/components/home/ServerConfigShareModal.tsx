import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import type {
  ConfigSummary,
  ServerConfigShare,
  ServerConfigShareType,
  ServerConfigSummary,
} from '../../api';
import { isServerShareActive, useServerShareStore } from '../../store/serverShareStore';
import { ErrorNote } from '../cloud/ErrorNote';
import { formatDateTime } from '../cloud/format';

interface ServerConfigShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  // The two libraries hand this modal slightly different summary shapes; only
  // the fields below are read from either.
  config: (Pick<ConfigSummary, 'id' | 'name'> & Partial<ServerConfigSummary>) | null;
}

// The payload a new share would serve. Two entries by design — one link per
// meaning, so neither type can be talked into serving the other.
const SHARE_TYPES: ServerConfigShareType[] = ['full_server_yaml', 'server_to_client_proxies'];

type TypeKey = Record<ServerConfigShareType, { label: string; hint: string }>;

// The share links for one server config: pick a payload, create, copy, revoke.
//
// The interaction mirrors SubscriptionLinksModal deliberately — same create
// row, same URL rows with copy and revoke, revoked rows greyed but kept — so
// the server library's sharing reads as the same feature as the client
// library's, not as a second system to learn.
export function ServerConfigShareModal({ isOpen, onClose, config }: ServerConfigShareModalProps) {
  const { t, i18n } = useTranslation();
  const items = useServerShareStore((state) => state.items);
  const status = useServerShareStore((state) => state.status);
  const error = useServerShareStore((state) => state.error);
  const creating = useServerShareStore((state) => state.creating);
  const load = useServerShareStore((state) => state.load);
  const close = useServerShareStore((state) => state.close);
  const create = useServerShareStore((state) => state.create);

  const [shareType, setShareType] = useState<ServerConfigShareType>('full_server_yaml');

  const configId = config?.id ?? null;

  useEffect(() => {
    if (!isOpen || configId === null) return;
    void load(configId);
    return () => {
      // Clearing on close is what keeps one config's tokens from being on
      // screen under another config's name while the next request is in flight.
      close();
    };
  }, [isOpen, configId, load, close]);

  const handleCreate = async () => {
    await create(shareType);
  };

  const typeKeys: TypeKey = {
    full_server_yaml: {
      label: t('cloud.serverShares.typeFull'),
      hint: t('cloud.serverShares.typeFullHint'),
    },
    server_to_client_proxies: {
      label: t('cloud.serverShares.typeClient'),
      hint: t('cloud.serverShares.typeClientHint'),
    },
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config ? t('cloud.serverShares.titleFor', { name: config.name }) : t('cloud.serverShares.title')}
      icon={<Link2 size={18} />}
      widthClass="max-w-3xl"
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('cloud.serverShares.intro')}
        </p>

        {/* A config saved before rendered artifacts existed has nothing for its
            URLs to serve, and the server answers 409 rather than 404 precisely
            so this can be said plainly. The fix takes five seconds, so say what
            it is. */}
        {config && !config.rendered_at && (
          <p
            className="text-sm p-3 rounded-lg"
            style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}
          >
            {t('cloud.serverShares.notRendered')}
          </p>
        )}

        <div
          className="flex flex-wrap items-end gap-3 p-3 rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="min-w-60 flex-1">
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
              htmlFor="server-share-type"
            >
              {t('cloud.serverShares.typeLabel')}
            </label>
            {/* A plain select rather than two big cards: the choice is one bit,
                and the row layout stays identical to the subscription panel. */}
            <select
              id="server-share-type"
              value={shareType}
              onChange={(event) => setShareType(event.target.value as ServerConfigShareType)}
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {SHARE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeKeys[type].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              {typeKeys[shareType].hint}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || configId === null}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white
                       disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={16} />
            {creating ? t('cloud.serverShares.creating') : t('cloud.serverShares.create')}
          </button>
        </div>

        <ErrorNote error={error} />

        {status === 'loading' && items.length === 0 && (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            {t('cloud.loading')}
          </p>
        )}

        {status === 'ready' && items.length === 0 && (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            {t('cloud.serverShares.empty')}
          </p>
        )}

        <div className="space-y-3">
          {items.map((share) => (
            <ServerShareRow key={share.id} share={share} language={i18n.language} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ServerShareRow({ share, language }: { share: ServerConfigShare; language: string }) {
  const { t } = useTranslation();
  const revoke = useServerShareStore((state) => state.revoke);
  const busyId = useServerShareStore((state) => state.busyId);

  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const active = isServerShareActive(share);
  const busy = busyId === share.id;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access needs a secure context; the URL is in a readable
      // field either way, so this degrades to selecting it by hand.
    }
  };

  const handleRevoke = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await revoke(share.id);
    setConfirming(false);
  };

  const typeLabel =
    share.share_type === 'full_server_yaml'
      ? t('cloud.serverShares.typeFull')
      : t('cloud.serverShares.typeClient');

  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
        opacity: active ? 1 : 0.6,
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded text-xs shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            {typeLabel}
          </span>
          {!active && (
            <span
              className="px-1.5 py-0.5 rounded text-xs shrink-0"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.12)', color: '#dc2626' }}
            >
              {t('cloud.serverShares.revoked')}
            </span>
          )}
        </div>

        {active && (
          <div className="flex items-center gap-1 shrink-0">
            {confirming ? (
              <>
                <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('cloud.serverShares.confirmRevoke')}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRevoke()}
                  disabled={busy}
                  className="px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  {t('common.confirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="px-2 py-1 rounded text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleRevoke()}
                disabled={busy}
                className="p-1.5 rounded hover:opacity-70 disabled:opacity-50"
                style={{ color: '#dc2626' }}
                title={t('cloud.serverShares.revoke')}
                aria-label={t('cloud.serverShares.revoke')}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {active && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={share.url}
            onFocus={(event) => event.currentTarget.select()}
            className="flex-1 min-w-0 px-2 py-1.5 rounded border text-xs font-mono"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
            aria-label={t('cloud.serverShares.url')}
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium shrink-0"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t('editor.copied') : t('common.copy')}
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>{t('cloud.links.created', { at: formatDateTime(share.created_at, language) })}</span>
      </div>
    </div>
  );
}
