import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, X } from 'lucide-react';
import { Link as LinkIcon } from 'lucide-react';
import { IconSwap } from '../../animation/IconSwap';
import { Modal } from '../common/Modal';
import type { ListenerIR, UserEntry } from '../../core/server/types';
import {
  generateProxyShare,
  shareableUsers,
  type ProxyShareResult,
} from '../../core/server/share';
import { userLabel } from '../../core/server/share/common';
import { useServerStore } from '../../store/serverStore';

interface ListenerShareModalProps {
  listener: ListenerIR;
  onClose: () => void;
}

interface ShareRow {
  key: string;
  server: string;
  user?: UserEntry;
  result: ProxyShareResult;
}

// One row per Server address on the document — and per identity on protocols
// whose auth list holds several users (VLESS, VMess, Trojan, Hysteria2,
// TUIC v5, AnyTLS, Mieru, ShadowQUIC, TrustTunnel). Each row carries the
// client `proxies:` fragment for that address and identity; a tip line under
// it names both, so rows are telling apart at a glance.
export function ListenerShareModal({ listener, onClose }: ListenerShareModalProps) {
  const { t } = useTranslation();
  const servers = useServerStore((s) => s.config.servers ?? []);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const users = useMemo(() => shareableUsers(listener), [listener]);

  const rows = useMemo<ShareRow[]>(() => {
    const identities: (UserEntry | undefined)[] =
      users.length > 0 ? users : [undefined];
    return servers.flatMap((server) =>
      identities.map((user) => ({
        key: `${server}|${userLabel(user)}`,
        server,
        user,
        result: generateProxyShare(listener, server, user),
      }))
    );
  }, [listener, servers, users]);

  const first = rows[0]?.result;
  const supported = rows.length > 0 && (first?.supported ?? false);

  const warnings = useMemo(() => {
    if (!supported) return [];
    const seen = new Set<string>();
    for (const { result } of rows) {
      for (const warning of result.warnings ?? []) seen.add(warning);
    }
    return Array.from(seen);
  }, [rows, supported]);

  const copy = async (key: string, yaml?: string) => {
    if (!yaml) return;
    try {
      await navigator.clipboard.writeText(yaml);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Clipboard permission denials used to fail silently, which reads as a
      // broken button. A moment of red is the receipt that it did not happen.
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 1500);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={listener.name}
      icon={<LinkIcon size={18} />}
      widthClass="max-w-2xl"
    >
      <div className="space-y-3">
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('server.share.perServerHint')}
        </p>

        {!supported && rows.length > 0 && (
          <p
            className="text-sm p-2 rounded border"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
            role="status"
          >
            {t('server.share.unsupportedPrefix')}
            {first?.reasonCode ? t(first.reasonCode) : ''}
          </p>
        )}

        {servers.length === 0 && (
          <p
            className="text-sm p-2 rounded border"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
            role="status"
          >
            {t('server.share.noServers')}
          </p>
        )}

        {supported &&
          rows.map(({ key, server, user, result }) => (
            <div key={key}>
              <div className="flex items-start gap-2">
                <textarea
                  readOnly
                  value={result.yaml ?? ''}
                  rows={Math.min(12, (result.yaml?.split('\n').length ?? 1))}
                  aria-label={`${t('server.list.share')} ${server}`}
                  className="flex-1 min-w-0 px-3 py-2 rounded-md border text-xs font-mono resize-y"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => copy(key, result.yaml)}
                  disabled={!result.yaml}
                  aria-label={t('common.copy')}
                  title={copyFailed ? t('server.share.copyFailed') : t('common.copy')}
                  className="p-2 rounded-md border disabled:opacity-40 shrink-0"
                  style={{
                    borderColor:
                      copiedKey === key || copyFailed
                        ? copiedKey === key
                          ? 'var(--accent)'
                          : '#ef4444'
                        : 'var(--border-color)',
                    color:
                      copiedKey === key
                        ? 'var(--accent)'
                        : copyFailed
                          ? '#ef4444'
                          : 'var(--text-secondary)',
                  }}
                >
                  <IconSwap swapKey={copiedKey === key || copyFailed ? 'done' : 'copy'} size={14}>
                    {copiedKey === key ? <Check size={14} /> : copyFailed ? <X size={14} /> : <Copy size={14} />}
                  </IconSwap>
                </button>
              </div>

              {/* What this fragment points at and who it lets in — the two
                  things that differ between otherwise identical-looking rows. */}
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {user
                  ? t('server.share.linkTipUser', {
                      server,
                      user: userLabel(user),
                    })
                  : t('server.share.linkTip', { server })}
              </p>
            </div>
          ))}

        {warnings.length > 0 && (
          <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
            {warnings.map((warning) => (
              <li key={warning}>· {t(warning)}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
