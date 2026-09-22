import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FormPane } from './FormPane';
import { EditorPane } from './EditorPane';
import { HeaderTools } from './HeaderTools';
import * as anim from '../../animation/tokens';
import { SaveButton } from '../cloud/SaveButton';
import { ConfigDetailsDialog } from '../cloud/ConfigDetailsDialog';
import { useCloudStore } from '../../store/cloudStore';

export function AppLayout() {
  const { t } = useTranslation();
  const currentId = useCloudStore((state) => state.currentId);
  const currentName = useCloudStore((state) => state.currentName);
  const dirty = useCloudStore((state) => state.dirty);

  const [detailsOpen, setDetailsOpen] = useState(false);

  // The header names the document rather than the app, because a tab per config
  // is the point of this layout: the title bar and the browser tab are how you
  // tell three open editors apart.
  const name = currentId !== null && currentName ? currentName : t('editor.newConfigName');
  // Keyed on what the state *is* rather than on the sentence, so switching
  // language does not read as the document having changed.
  const stateKey = currentId === null ? 'new' : dirty ? 'dirty' : 'saved';
  const state = currentId === null
    ? t('editor.notSavedYet')
    : dirty
      ? t('cloud.unsaved')
      : t('cloud.save.saved');

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Top Header */}
      <header
        className="flex items-center justify-between gap-4 px-6 py-4 border-b"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* An ordinary link, so the config library is one click and one
              browser-back away rather than a modal stacked on the editor. The
              arrow backs up a step on hover, in the direction the link goes. */}
          <motion.div whileHover="hover" whileTap={{ scale: 0.97 }} className="shrink-0">
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
            >
              <motion.span
                className="flex"
                variants={{ hover: { x: -3 } }}
                transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
              >
                <ArrowLeft size={16} />
              </motion.span>
              <span className="hidden sm:inline">{t('nav.home')}</span>
            </Link>
          </motion.div>

          <div
            className="w-px h-8 shrink-0"
            style={{ backgroundColor: 'var(--border-color)' }}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <h1
              className="flex items-center gap-2 text-xl font-bold"
              style={{ color: 'var(--text-primary)' }}
              title={name}
            >
              <span className="truncate">{name}</span>
              {/* Appears the moment the document diverges from what is saved.
                  It pops in once and then holds still — a dot that pulsed
                  forever would be the only moving thing on a screen people
                  read for minutes at a time. */}
              <AnimatePresence>
                {dirty && (
                  <motion.span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: '#d97706' }}
                    title={t('cloud.unsaved')}
                    aria-label={t('cloud.unsaved')}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  />
                )}
              </AnimatePresence>

              {/* Only for a config that exists in the account. A document that
                  has never been saved is named by the dialog that saves it, and
                  a second way to name it beforehand would be a field whose value
                  that dialog then asks for again. */}
              {currentId !== null && (
                <motion.button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="shrink-0 p-1 rounded"
                  style={{ color: 'var(--text-secondary)' }}
                  title={t('cloud.details.action')}
                  aria-label={t('cloud.details.action')}
                  whileHover={{ scale: 1.15, opacity: 0.75 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                >
                  <Pencil size={15} />
                </motion.button>
              )}
            </h1>
            <div className="relative h-5 mt-0.5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={stateKey}
                  className="absolute inset-x-0 text-sm truncate"
                  style={{ color: 'var(--text-secondary)' }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12, ease: anim.EASE_OUT }}
                >
                  {state}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Save sits at this end because it acts on the document the title
              names — near the name and the dirty dot that says it needs doing,
              rather than across the header among the controls that only change
              how the app looks. It renders nothing while signed out, so the
              title keeps the left edge to itself. */}
          <SaveButton />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <HeaderTools />
        </div>
      </header>

      {/* Main Content - Dual Pane, stacking below lg */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Pane - Form */}
        <div
          className="flex flex-col min-w-0 min-h-0 basis-1/2 lg:basis-auto lg:w-1/2 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <FormPane />
        </div>

        {/* Right Pane - Editor */}
        <div className="flex flex-col min-w-0 min-h-0 basis-1/2 lg:basis-auto lg:w-1/2">
          <EditorPane />
        </div>
      </div>

      <ConfigDetailsDialog isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </div>
  );
}
