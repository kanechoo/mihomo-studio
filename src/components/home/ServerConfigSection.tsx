import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getServerConfig } from '../../api';
import type { ServerConfigSummary } from '../../api';
import * as anim from '../../animation/tokens';
import { ErrorNote } from '../cloud/ErrorNote';
import { NewServerConfigCard } from './NewServerConfigCard';
import { ServerConfigCard } from './ServerConfigCard';
import { ServerConfigShareModal } from './ServerConfigShareModal';
import { YamlPreviewDialog } from './YamlPreviewDialog';
import { ServerYamlExporter } from '../../core/server/exporters/serverYaml';

// One request at a time per mount; the section refetches whenever the page is
// revisited or told to, exactly like the client list beside it.
let inflight: Promise<void> | null = null;

const exporter = new ServerYamlExporter();

export function ServerConfigSection({ refreshToken = 0 }: { refreshToken?: number }) {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<ServerConfigSummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [previewId, setPreviewId] = useState<number | null>(null);
  // Which config's share dialog is open, if any. One modal for the whole
  // section, exactly like the preview dialog and the client list's links one.
  const [shareFor, setShareFor] = useState<ServerConfigSummary | null>(null);

  const refresh = useCallback(() => {
    if (inflight) return inflight;
    setStatus((current) => (current === 'ready' ? 'ready' : 'loading'));
    inflight = getServerConfigs()
      .then((configs) => {
        setConfigs(configs);
        setStatus('ready');
      })
      .catch(() => {
        // A previous good list stays on screen: a momentary API restart should
        // not read as "you have nothing".
        setStatus('error');
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  return (
    <section className="space-y-3 min-w-0">
      <motion.div variants={anim.fadeUp}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('home.server.title')}
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('home.server.intro')}
        </p>
      </motion.div>

      <NewServerConfigCard />

      {status === 'error' && (
        <div className="space-y-2">
          <ErrorNote error={{ key: 'server.cloud.error.list' }} />
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            <RotateCw size={14} />
            {t('cloud.configs.refresh')}
          </button>
        </div>
      )}

      {status === 'loading' && configs.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('cloud.loading')}
        </p>
      )}

      {status === 'ready' && configs.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('home.server.empty')}
        </p>
      )}

      <motion.div className="space-y-3" variants={anim.staggerContainer} initial="hidden" animate="visible">
        <AnimatePresence>
          {configs.map((config) => (
            <ServerConfigCard
              key={config.id}
              config={config}
              onPreview={(c) => setPreviewId(c.id)}
              onShare={setShareFor}
              // The list lives here, so the row leaves the moment the server
              // confirms the delete — no manual refresh needed.
              onDeleted={(id) =>
                setConfigs((current) => current.filter((entry) => entry.id !== id))
              }
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {previewId !== null && (
        <ServerYamlPreview
          configId={previewId}
          name={configs.find((c) => c.id === previewId)?.name ?? ''}
          onClose={() => setPreviewId(null)}
        />
      )}

      <ServerConfigShareModal
        isOpen={shareFor !== null}
        onClose={() => setShareFor(null)}
        config={shareFor}
      />
    </section>
  );
}

async function getServerConfigs(): Promise<ServerConfigSummary[]> {
  const { listServerConfigs } = await import('../../api/serverConfigs');
  return listServerConfigs();
}

// Renders the preview dialog once the IR has been fetched, exporting YAML in
// the browser with the same exporter the server editor previews through.
function ServerYamlPreview({
  configId,
  name,
  onClose,
}: {
  configId: number;
  name: string;
  onClose: () => void;
}) {
  const [yaml, setYaml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getServerConfig(configId)
      .then((detail) => {
        if (!cancelled) setYaml(exporter.export(detail.ir));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [configId]);

  if (failed || yaml === null) return null;
  return <YamlPreviewDialog isOpen onClose={onClose} yaml={yaml} configName={name} />;
}
