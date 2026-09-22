import { useTranslation } from 'react-i18next';
import { Trash2, Info } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Select } from '../common/Select';
import { useServerStore } from '../../store/serverStore';
import type { ServerOutboundKind } from '../../core/server/types';
import { useState } from 'react';

// The outbound kinds offered for new entries. mihomo's `proxies:` list has no
// separate "outbounds" key and no built-in direct/reject *entries* — DIRECT
// and REJECT resolve as policies without being defined. What a server config
// actually defines here is an upstream hop (http / socks5) or a named direct
// egress; those three cover the runnable scenarios.
const OUTBOUND_KIND_OPTIONS: { value: ServerOutboundKind; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'http', label: 'HTTP' },
  { value: 'socks5', label: 'SOCKS5' },
];

// Shown read-only above the list: the names every rule target and listener
// proxy resolves against even when the list below is empty.
const BUILT_IN_POLICIES = ['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'PASS-RULE', 'COMPATIBLE'];

export function OutboundTab() {
  const { t } = useTranslation();
  const outbounds = useServerStore((s) => s.config.outbounds ?? []);
  const addOutbound = useServerStore((s) => s.addOutbound);
  const removeOutbound = useServerStore((s) => s.removeOutbound);
  const updateOutboundField = useServerStore((s) => s.updateOutboundField);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete = pendingDeleteId
    ? outbounds.find((o) => o.id === pendingDeleteId) ?? null
    : null;

  const inputStyle = {
    backgroundColor: 'var(--bg-primary)',
    borderColor: 'var(--border-color)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3 pb-2 border-b" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
          {t('server.outbound.builtInTitle')}
        </h3>
        <p className="text-xs mb-2 flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <Info size={13} className="shrink-0 mt-0.5" />
          {t('server.outbound.builtInNote')}
        </p>
        <div className="flex flex-wrap gap-2">
          {BUILT_IN_POLICIES.map((name) => (
            <span
              key={name}
              className="px-2 py-1 rounded text-xs font-mono"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('server.outbound.listTitle')}
          </h3>
          <div className="flex items-center gap-2">
            <Select
              id="outbound-kind-select"
              value="direct"
              onChange={(value) => addOutbound(value as ServerOutboundKind)}
              items={OUTBOUND_KIND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              placeholder={t('server.outbound.pickKind') ?? undefined}
            />
            <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {t('server.outbound.pickHint')}
            </span>
          </div>
        </div>

        {outbounds.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--text-secondary)' }}>
            {t('server.outbound.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {outbounds.map((outbound) => {
              const needsEndpoint = outbound.type === 'http' || outbound.type === 'socks5';
              return (
                <li
                  key={outbound.id}
                  className="p-3 rounded-lg border space-y-2"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium shrink-0"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                    >
                      {outbound.type.toUpperCase()}
                    </span>
                    <input
                      type="text"
                      value={outbound.name}
                      onChange={(e) =>
                        updateOutboundField(outbound.id, 'name', e.target.value)
                      }
                      placeholder={t('server.outbound.namePlaceholder')}
                      className="w-44 px-2 py-1.5 rounded-md border text-sm"
                      style={inputStyle}
                      aria-label={t('server.outbound.name')}
                    />
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(outbound.id)}
                      className="p-2 rounded transition-colors"
                      style={{ color: '#ef4444' }}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {needsEndpoint && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={outbound.server ?? ''}
                        onChange={(e) =>
                          updateOutboundField(outbound.id, 'server', e.target.value)
                        }
                        placeholder={t('server.outbound.server')}
                        className="flex-1 min-w-36 px-2 py-1.5 rounded-md border text-sm"
                        style={inputStyle}
                        aria-label={t('server.outbound.server')}
                      />
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={outbound.port ?? ''}
                        onChange={(e) =>
                          updateOutboundField(
                            outbound.id,
                            'port',
                            e.target.value === '' ? undefined : Number(e.target.value)
                          )
                        }
                        placeholder={t('server.outbound.port')}
                        className="w-24 px-2 py-1.5 rounded-md border text-sm"
                        style={inputStyle}
                        aria-label={t('server.outbound.port')}
                      />
                      <input
                        type="text"
                        value={outbound.username ?? ''}
                        onChange={(e) =>
                          updateOutboundField(outbound.id, 'username', e.target.value)
                        }
                        placeholder={t('server.outbound.username')}
                        className="w-32 px-2 py-1.5 rounded-md border text-sm"
                        style={inputStyle}
                        aria-label={t('server.outbound.username')}
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={outbound.password ?? ''}
                        onChange={(e) =>
                          updateOutboundField(outbound.id, 'password', e.target.value)
                        }
                        placeholder={t('server.outbound.password')}
                        className="w-32 px-2 py-1.5 rounded-md border text-sm"
                        style={inputStyle}
                        aria-label={t('server.outbound.password')}
                      />
                    </div>
                  )}

                  {outbound.type === 'socks5' && (
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={outbound.udp ?? false}
                          onChange={(e) => updateOutboundField(outbound.id, 'udp', e.target.checked)}
                        />
                        UDP
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={outbound.tls ?? false}
                          onChange={(e) => updateOutboundField(outbound.id, 'tls', e.target.checked)}
                        />
                        TLS
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t('server.outbound.deleteTitle')}
        message={
          pendingDelete
            ? t('server.outbound.deleteConfirm', { name: pendingDelete.name })
            : ''
        }
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (pendingDelete) removeOutbound(pendingDelete.id);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
