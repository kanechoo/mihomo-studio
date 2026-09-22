import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Info, XCircle, Plus } from 'lucide-react';
import { useServerStore } from '../../store/serverStore';
import { useServerProblems } from '../../hooks/useServerValidation';
import { isValidServerAddress } from '../../core/server/validation/syntax';

function isWildcard(listen: string): boolean {
  const v = listen.trim();
  return v === '0.0.0.0' || v === '::' || v === '*';
}

export function OverviewTab({ onGoTo }: { onGoTo: (tab: 'listeners' | 'validation') => void }) {
  const { t } = useTranslation();
  const config = useServerStore((s) => s.config);
  const setServers = useServerStore((s) => s.setServers);
  const problems = useServerProblems();
  // The draft for a new Server address; committed to the list on Enter or +.
  const [serverDraft, setServerDraft] = useState('');
  // Set when the draft was refused for not parsing as a domain or IP — the
  // list is where share links point, so a typo here must not slip in quietly.
  const [serverInvalid, setServerInvalid] = useState(false);
  const servers = config.servers ?? [];

  const commitServer = () => {
    const entry = serverDraft.trim();
    setServerInvalid(false);
    if (entry === '' || servers.includes(entry)) {
      setServerDraft('');
      return;
    }
    if (!isValidServerAddress(entry)) {
      setServerInvalid(true);
      return;
    }
    setServers([...servers, entry]);
    setServerDraft('');
  };

  const active = config.listeners.filter((l) => l.enabled);
  const quicKinds = new Set(['tuic', 'hysteria2', 'hysteria2-realm', 'shadowquic']);

  const stats = {
    total: config.listeners.length,
    enabled: active.length,
    udp: active.filter((l) => quicKinds.has(l.type) || l.protocol.udp === true).length,
    tls: active.filter((l) => l.tls.mode !== 'none').length,
    public: active.filter((l) => isWildcard(l.listen)).length,
  };

  const counts = {
    error: problems.filter((p) => p.severity === 'error').length,
    warning: problems.filter((p) => p.severity === 'warning').length,
    info: problems.filter((p) => p.severity === 'info').length,
  };

  const cards: { label: string; value: number | string }[] = [
    { label: t('server.overview.listeners'), value: `${stats.enabled}/${stats.total}` },
    { label: t('server.overview.udp'), value: stats.udp },
    { label: t('server.overview.tls'), value: stats.tls },
    { label: t('server.overview.publicBind'), value: stats.public },
  ];

  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="grid grid-cols-2 gap-3 mb-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="p-3 rounded-md border"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {card.label}
            </p>
            <p className="text-xl font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* The Server list — where share links point. It names the machine that
          will run this config, not the bind address of any one listener, so it
          lives on the document rather than in a listener's own settings. */}
      <div
        className="p-3 rounded-md border mb-4"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <label
          htmlFor="overview-server-draft"
          className="block text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('server.overview.servers')}
        </label>
        <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t('server.overview.serversTip')}
        </p>

        <div className="flex flex-wrap gap-2 mb-2">
          {servers.map((server) => (
            <span
              key={server}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-sm font-mono"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {server}
              <button
                type="button"
                aria-label={`${t('common.delete')} ${server}`}
                onClick={() => setServers(servers.filter((entry) => entry !== server))}
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <XCircle size={12} />
              </button>
            </span>
          ))}
          {servers.length === 0 && (
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('server.share.noServers')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="overview-server-draft"
            type="text"
            value={serverDraft}
            onChange={(e) => {
              setServerDraft(e.target.value);
              setServerInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitServer();
              }
            }}
            placeholder={t('server.overview.serversPlaceholder')}
            spellCheck={false}
            aria-invalid={serverInvalid || undefined}
            className="flex-1 px-3 py-1.5 rounded-md border text-sm font-mono"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: serverInvalid ? '#ef4444' : 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            onClick={commitServer}
            aria-label={t('common.add')}
            className="p-2 rounded-md border"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <Plus size={14} />
          </button>
        </div>

        {serverInvalid && (
          <p className="text-xs mt-1 text-red-500" role="alert">
            {t('server.overview.serversInvalid', { value: serverDraft.trim() })}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onGoTo('validation')}
        className="w-full p-3 rounded-md border text-left"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
          {t('server.overview.validation')}
        </p>
        <p className="flex items-center gap-3 text-sm font-mono">
          <span className="flex items-center gap-1" style={{ color: counts.error > 0 ? '#ef4444' : 'var(--accent)' }}>
            <XCircle size={13} />
            {counts.error}
          </span>
          <span className="flex items-center gap-1" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={13} />
            {counts.warning}
          </span>
          <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Info size={13} />
            {counts.info}
          </span>
          {counts.error === 0 && counts.warning === 0 && (
            <CheckCircle2 size={13} style={{ color: 'var(--accent)' }} />
          )}
        </p>
      </button>
    </div>
  );
}
