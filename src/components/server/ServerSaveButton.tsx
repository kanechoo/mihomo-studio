import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconSwap } from '../../animation/IconSwap';
import * as anim from '../../animation/tokens';
import { useAuthStore } from '../../store/authStore';
import { useServerCloudStore } from '../../store/serverCloudStore';
import { ServerSaveConfigDialog } from './ServerSaveConfigDialog';
import { ErrorNote } from '../cloud/ErrorNote';

// The server editor's save control. Structurally the twin of the client
// SaveButton — idle / saving / saved phases, error popover, first-save dialog —
// pointed at serverCloudStore and /server-config-editor/:id instead of
// cloudStore and /client-config-editor/:id.
export function ServerSaveButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const status = useAuthStore((state) => state.status);

  const currentId = useServerCloudStore((state) => state.currentId);
  const dirty = useServerCloudStore((state) => state.dirty);
  const saving = useServerCloudStore((state) => state.saving);
  const saveError = useServerCloudStore((state) => state.saveError);
  const save = useServerCloudStore((state) => state.save);
  const clearErrors = useServerCloudStore((state) => state.clearErrors);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  if (status !== 'authenticated') return null;

  const handleSave = async () => {
    if (currentId === null) {
      setSaveDialogOpen(true);
      return;
    }
    if (await save()) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const handleSavedAsNew = (id: number) => {
    navigate(`/server-config-editor/${id}`, { replace: true });
  };

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
        animate={{ opacity: saving ? 0.6 : 1 }}
        whileHover={saving ? undefined : { scale: 1.03 }}
        whileTap={saving ? undefined : { scale: 0.97 }}
        transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
      >
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

      <ServerSaveConfigDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSaved={handleSavedAsNew}
      />
    </div>
  );
}
