import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, ExternalLink, FileText, Link2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ConfigSummary } from '../../api';
import * as anim from '../../animation/tokens';
import { useCloudStore } from '../../store/cloudStore';
import { formatDateTime } from '../cloud/format';

interface ConfigCardProps {
  config: ConfigSummary;
  onLinks: (config: ConfigSummary) => void;
}

// One saved config in the home page's library.
//
// The name is an anchor rather than a div with an onClick, so the browser's own
// ways of opening things — middle click, ⌘-click, "open in new window", copying
// the address — all keep working. target="_blank" is what makes an ordinary
// click open a tab too.
export function ConfigCard({ config, onLinks }: ConfigCardProps) {
  const { t, i18n } = useTranslation();
  const remove = useCloudStore((state) => state.remove);
  // Deleting a config takes its subscription URLs with it and there is no undo,
  // so the button asks once.
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    // Two elements, and the split is not cosmetic. `layout` animates this card
    // to its new position when a card above it is deleted, and it does that by
    // writing a transform — so the hover lift, which is also a transform, goes
    // on a separate child where the two cannot overwrite each other.
    //
    // The spring is scoped to `layout` alone so it does not also take over the
    // fade the variants describe.
    <motion.div layout variants={anim.listRow} exit="exit" transition={{ layout: anim.layoutSpring }}>
      <motion.div
        className="flex items-start justify-between gap-4 p-5 rounded-xl border"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
        whileHover={{ y: -2, boxShadow: '0 12px 24px -14px rgb(0 0 0 / 0.35)' }}
        transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
      >
        <a
          href={`/client-config-editor/${config.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={t('home.opensInNewTab')}
          className="group flex items-start gap-4 min-w-0 flex-1"
        >
          <span
            className="shrink-0 p-3 rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
          >
            <FileText size={28} />
          </span>

          <div className="min-w-0">
            <h3
              className="flex items-center gap-2 text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="truncate group-hover:underline">{config.name}</span>
              {/* Fades up to full strength on hover, so the card admits what it
                  is going to do — open a tab — before you click it. */}
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
              {t('cloud.configs.updated', {
                at: formatDateTime(config.updated_at, i18n.language),
              })}
            </p>
          </div>
        </a>

        {/* The two buttons and the confirmation occupy the same corner, so they
            cross-fade in place. mode="wait" keeps them from overlapping while
            they do — this corner is narrow and two sets of controls briefly
            stacked would look like a rendering fault. */}
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
                  {t('cloud.configs.confirmDelete')}
                </span>
                <motion.button
                  type="button"
                  onClick={async () => {
                    await remove(config.id);
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
                  onClick={() => onLinks(config)}
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                  title={t('cloud.links.title')}
                  aria-label={t('cloud.links.title')}
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
