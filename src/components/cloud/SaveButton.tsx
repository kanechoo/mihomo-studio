import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconSwap } from '../../animation/IconSwap';
import * as anim from '../../animation/tokens';
import { useAuthStore } from '../../store/authStore';
import { useCloudStore } from '../../store/cloudStore';
import { SaveConfigDialog } from './SaveConfigDialog';
import { ErrorNote } from './ErrorNote';

// The editor header's save control, and the dialog a first save needs.
//
// It sits beside the document name rather than over with the account menu and
// the switchers, because those say who you are and how the app looks, while
// this one acts on the thing the title names — the same reason the dirty dot is
// on that side. Signing in stays in the right-hand group: it is not an edit to
// the document, and it is the one control that has to be reachable before there
// is a document to save.
export function SaveButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);

  const currentId = useCloudStore((state) => state.currentId);
  const dirty = useCloudStore((state) => state.dirty);
  const saving = useCloudStore((state) => state.saving);
  const saveError = useCloudStore((state) => state.saveError);
  const save = useCloudStore((state) => state.save);
  const clearErrors = useCloudStore((state) => state.clearErrors);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Nothing to offer until there is an account to save into. Signed out, the
  // header's right-hand side is asking to sign in, and a Save that opened the
  // same prompt would be a second door onto one room.
  if (status !== 'authenticated') return null;

  const handleSave = async () => {
    // No linked config means there is nothing to update, so this is a first
    // save and it needs a name.
    if (currentId === null) {
      setSaveDialogOpen(true);
      return;
    }
    if (await save()) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  // A document that has just been saved for the first time is a saved config,
  // and this tab should say so — /editor/17 rather than /editor. Replace rather
  // than push: "back" belongs to the home page the tab was opened from, not to
  // the state this same document was in ten seconds ago.
  const handleSavedAsNew = (id: number) => {
    navigate(`/client-config-editor/${id}`, { replace: true });
  };

  // Save, saving, just saved. Named because the icon animation keys on it: the
  // three are one control changing state, not three controls taking turns.
  const phase = saving ? 'saving' : justSaved ? 'saved' : 'idle';

  return (
    <div className="relative shrink-0">
      <motion.button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium
                   disabled:cursor-not-allowed"
        style={{
          backgroundColor: dirty || currentId === null ? 'var(--accent)' : 'var(--bg-tertiary)',
          color: dirty || currentId === null ? '#ffffff' : 'var(--text-primary)',
        }}
        // Opacity is animated rather than left to the disabled: class, so it
        // dims on the way into the request and comes back on the way out
        // instead of blinking at both ends.
        animate={{ opacity: saving ? 0.6 : 1 }}
        whileHover={saving ? undefined : { scale: 1.03 }}
        whileTap={saving ? undefined : { scale: 0.97 }}
        transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
      >
        {/* Only the icon swaps. The label beside it changes width with the
            wording and with the language, and a button that resizes mid-fade
            draws the eye to the resizing rather than to the tick. */}
        <IconSwap swapKey={phase}>
          {phase === 'saving' ? (
            <motion.span
              className="flex"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }}
            >
              <Loader2 size={16} />
            </motion.span>
          ) : phase === 'saved' ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
        </IconSwap>
        {saving ? t('cloud.save.saving') : justSaved ? t('cloud.save.saved') : t('common.save')}
      </motion.button>

      {/* Hangs off the button it belongs to, so it unfolds from there rather
          than appearing over the header. Anchored left now that the button is
          on the left: a panel wider than its button has to grow into the header
          rather than off the edge of it. */}
      <AnimatePresence>
        {saveError && (
          <motion.div
            className="absolute left-0 top-full mt-2 z-40 w-80 p-2 rounded-lg border shadow-lg"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              transformOrigin: 'top left',
            }}
            variants={anim.menu}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <ErrorNote error={saveError} />
            <motion.button
              type="button"
              onClick={clearErrors}
              className="mt-2 w-full px-2 py-1 rounded text-xs"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {t('common.confirm')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <SaveConfigDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSaved={handleSavedAsNew}
      />
    </div>
  );
}
