import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, ExternalLink, Eye, Link2, Server, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServerConfigSummary } from '../../api';
import * as anim from '../../animation/tokens';
import { useServerCloudStore } from '../../store/serverCloudStore';
import { formatDateTime } from '../cloud/format';

interface ServerConfigCardProps {
  config: ServerConfigSummary;
  onPreview: (config: ServerConfigSummary) => void;
  /** Opens the share dialog for this config — one link per payload type. */
  onShare: (config: ServerConfigSummary) => void;
  /** Called after the server confirmed the delete, so the owning list can
      drop the row at once instead of waiting for a manual refresh. */
  onDeleted?: (id: number) => void;
}

// One saved server config in the home library. The twin of ConfigCard: the
// name opens /server/:id in a new tab, the corner holds preview, share and
// delete, and deletion asks once because there is no undo.
export function ServerConfigCard({ config, onPreview, onShare, onDeleted }: ServerConfigCardProps) {
  const { t, i18n } = useTranslation();
  const remove = useServerCloudStore((state) => state.remove);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <motion.div layout variants={anim.listRow} exit="exit" transition={{ layout: anim.layoutSpring }}>
      <motion.div
        className="flex items-start justify-between gap-4 p-5 rounded-xl border"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
        whileHover={{ y: -2, boxShadow: '0 12px 24px -14px rgb(0 0 0 / 0.35)' }}
        transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
      >
        <a
          href={`/server-config-editor/${config.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={t('home.opensInNewTab')}
          className="group flex items-start gap-4 min-w-0 flex-1"
        >
          <span
            className="shrink-0 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: '#16a34a' }}
          >
            <Server size={28} />
          </span>

          <div className="min-w-0">
            <h3
              className="flex items-center gap-2 text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="truncate group-hover:underline">{config.name}</span>
              <ExternalLink
                size={15}
                className="shrink-0 opacity-50 transition-opacity duration-200 group-hover:opacity-100"
                style={{ color: 'var(--text-secondary)' }}
                aria-hidden="true"
              />
            </h3>

            {config.description && (
              <p className="mt-1 text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
                {config.description}
              </p>
            )}

            <p
              className="mt-2 flex items-center gap-1.5 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Clock size={14} className="shrink-0" />
              {t('home.server.updated', {
                at: formatDateTime(config.updated_at, i18n.language),
              })}
            </p>
          </div>
        </a>

        <div className="flex items-center gap-1 shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {confirmDelete ? (
              <motion.div
                key="confirm"
                className="flex items-center gap-1"
                variants={anim.fade}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <span className="text-sm mr-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('home.server.confirmDelete')}
                </span>
                <motion.button
                  type="button"
                  onClick={async () => {
                    const ok = await remove(config.id);
                    // Only drop the row once the server agreed; a failed
                    // delete keeps the card (and its confirm) on screen.
                    if (ok) onDeleted?.(config.id);
                    setConfirmDelete(false);
                  }}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
                  style={{ backgroundColor: '#dc2626' }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  {t('common.confirm')}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-md text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  {t('common.cancel')}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="actions"
                className="flex items-center gap-1"
                variants={anim.fade}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <motion.button
                  type="button"
                  onClick={() => onPreview(config)}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  title={t('home.server.preview')}
                  aria-label={t('home.server.preview')}
                  whileHover={{ scale: 1.08, opacity: 0.8 }}
                  whileTap={{ scale: 0.94 }}
                >
                  <Eye size={18} />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => onShare(config)}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  title={t('home.server.share')}
                  aria-label={t('home.server.share')}
                  whileHover={{ scale: 1.08, opacity: 0.8 }}
                  whileTap={{ scale: 0.94 }}
                >
                  <Link2 size={18} />
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: '#dc2626' }}
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                  whileHover={{ scale: 1.08, opacity: 0.8 }}
                  whileTap={{ scale: 0.94 }}
                >
                  <Trash2 size={18} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
