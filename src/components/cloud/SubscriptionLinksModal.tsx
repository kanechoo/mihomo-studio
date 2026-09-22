import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import type { ConfigSummary, Subscription, SubscriptionFormat } from '../../api';
import { isActive, useSubscriptionStore } from '../../store/subscriptionStore';
import { ErrorNote } from './ErrorNote';
import { formatDateTime } from './format';

// Mirrors model.MaxLabelLen.
const MAX_LABEL = 100;

interface SubscriptionLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ConfigSummary | null;
}

type PendingAction = { id: number; action: 'rotate' | 'revoke' } | null;

// The subscription URLs for one config: create, copy, rotate, revoke.
export function SubscriptionLinksModal({ isOpen, onClose, config }: SubscriptionLinksModalProps) {
  const { t, i18n } = useTranslation();
  const items = useSubscriptionStore((state) => state.items);
  const status = useSubscriptionStore((state) => state.status);
  const error = useSubscriptionStore((state) => state.error);
  const binding = useSubscriptionStore((state) => state.binding);
  const load = useSubscriptionStore((state) => state.load);
  const close = useSubscriptionStore((state) => state.close);
  const bind = useSubscriptionStore((state) => state.bind);

  const [format, setFormat] = useState<SubscriptionFormat>('mihomo');
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);

  const configId = config?.id ?? null;

  useEffect(() => {
    if (!isOpen || configId === null) return;
    void load(configId);
    return () => {
      // Clearing on close is what keeps one config's tokens from being on screen
      // under another config's name while the next request is in flight.
      close();
      setPending(null);
      setLabel('');
    };
  }, [isOpen, configId, load, close]);

  const handleBind = async () => {
    if (await bind(format, label.trim())) setLabel('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={config ? t('cloud.links.titleFor', { name: config.name }) : t('cloud.links.title')}
      icon={<Link2 size={18} />}
      widthClass="max-w-3xl"
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('cloud.links.intro')}
        </p>

        {/* A config that has never been exported has nothing for the URL to
            serve, and the server answers 409 rather than 404 precisely so this
            can be said plainly. The fix takes five seconds, so say what it is. */}
        {config && !config.rendered_at && (
          <p
            className="text-sm p-3 rounded-lg"
            style={{ backgroundColor: 'rgba(217, 119, 6, 0.12)', color: '#d97706' }}
          >
            {t('cloud.links.notRendered')}
          </p>
        )}

        <div
          className="flex flex-wrap items-end gap-3 p-3 rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <div className="flex-1 min-w-40">
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
              htmlFor="subscription-label"
            >
              {t('cloud.links.label')}
            </label>
            <input
              id="subscription-label"
              type="text"
              value={label}
              maxLength={MAX_LABEL}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('cloud.links.labelPlaceholder')}
              className="w-full px-3 py-2 rounded-md border text-sm"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
              htmlFor="subscription-format"
            >
              {t('cloud.links.format')}
            </label>
            <Select<SubscriptionFormat>
              id="subscription-format"
              value={format}
              onChange={setFormat}
              className="px-3 py-2 rounded-md border text-sm"
              items={[
                { value: 'mihomo', label: 'Mihomo (YAML)' },
                { value: 'singbox', label: 'Sing-Box (JSON)' },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={handleBind}
            disabled={binding || configId === null}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white
                       disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <Plus size={16} />
            {binding ? t('cloud.links.creating') : t('cloud.links.create')}
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
            {t('cloud.links.empty')}
          </p>
        )}

        <div className="space-y-3">
          {items.map((subscription) => (
            <SubscriptionRow
              key={subscription.id}
              subscription={subscription}
              language={i18n.language}
              pending={pending}
              setPending={setPending}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

interface RowProps {
  subscription: Subscription;
  language: string;
  pending: PendingAction;
  setPending: (pending: PendingAction) => void;
}

function SubscriptionRow({ subscription, language, pending, setPending }: RowProps) {
  const { t } = useTranslation();
  const rotate = useSubscriptionStore((state) => state.rotate);
  const revoke = useSubscriptionStore((state) => state.revoke);
  const busyId = useSubscriptionStore((state) => state.busyId);

  const [copied, setCopied] = useState(false);
  const active = isActive(subscription);
  const busy = busyId === subscription.id;
  const confirming = pending?.id === subscription.id ? pending.action : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(subscription.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access needs a secure context, and an http:// deployment on
      // something other than localhost will not have one. The URL is in a
      // readable field either way, so this degrades to selecting it by hand.
    }
  };

  const confirm = async () => {
    if (confirming === 'rotate') await rotate(subscription.id);
    if (confirming === 'revoke') await revoke(subscription.id);
    setPending(null);
  };

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
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {subscription.label || t('cloud.links.unlabelled')}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-xs shrink-0"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {subscription.format === 'singbox' ? 'sing-box' : 'mihomo'}
          </span>
          {!active && (
            <span
              className="px-1.5 py-0.5 rounded text-xs shrink-0"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.12)', color: '#dc2626' }}
            >
              {t('cloud.links.revoked')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {confirming ? (
            <>
              <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>
                {confirming === 'rotate'
                  ? t('cloud.links.confirmRotate')
                  : t('cloud.links.confirmRevoke')}
              </span>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="px-2 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#dc2626' }}
              >
                {t('common.confirm')}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="px-2 py-1 rounded text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            active && (
              <>
                {/* Rotation is the answer to a leaked URL, so it is offered
                    beside revoke rather than buried: the label, the format and
                    the access history survive, and only the URL changes. */}
                <button
                  type="button"
                  onClick={() => setPending({ id: subscription.id, action: 'rotate' })}
                  className="p-1.5 rounded hover:opacity-70"
                  style={{ color: 'var(--text-secondary)' }}
                  title={t('cloud.links.rotate')}
                  aria-label={t('cloud.links.rotate')}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPending({ id: subscription.id, action: 'revoke' })}
                  className="p-1.5 rounded hover:opacity-70"
                  style={{ color: '#dc2626' }}
                  title={t('cloud.links.revoke')}
                  aria-label={t('cloud.links.revoke')}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )
          )}
        </div>
      </div>

      {active && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={subscription.url}
            onFocus={(event) => event.currentTarget.select()}
            className="flex-1 min-w-0 px-2 py-1.5 rounded border text-xs font-mono"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
            aria-label={t('cloud.links.url')}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium shrink-0"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t('editor.copied') : t('common.copy')}
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>{t('cloud.links.created', { at: formatDateTime(subscription.created_at, language) })}</span>
        {/* `n`, not `count`: passing `count` would put i18next into plural mode
            and require a _one/_other key per language, for a number that reads
            the same either way. */}
        <span>{t('cloud.links.fetchCount', { n: subscription.access_count })}</span>
        {subscription.last_access_at && (
          <span>
            {t('cloud.links.lastFetch', {
              at: formatDateTime(subscription.last_access_at, language),
            })}
          </span>
        )}
        {subscription.last_user_agent && (
          <span className="font-mono truncate max-w-full" title={subscription.last_user_agent}>
            {subscription.last_user_agent}
          </span>
        )}
      </div>
    </div>
  );
}
