import { AnimatePresence, motion } from 'motion/react';
import { Github, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isGithubLoginConfigured } from '../../api';
import * as anim from '../../animation/tokens';
import { useAuthStore } from '../../store/authStore';

// The home page's sign-in half.
//
// It sits beside the "new config" card rather than in front of the app, because
// this editor worked without a server before there was one and still does: the
// document lives in this browser and every export runs in it. An account adds
// two things — configs that survive a different machine, and subscription URLs
// for devices that cannot run this UI — so it is offered, not demanded.
export function SignInPanel() {
  const { t } = useTranslation();
  const signIn = useAuthStore((state) => state.signIn);
  const error = useAuthStore((state) => state.error);
  const configured = isGithubLoginConfigured();

  return (
    // No initial/animate of its own: this panel arrives as part of the home
    // page's signed-out pair, and the parent decides when.
    <motion.div
      className="p-5 rounded-xl border"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
      variants={anim.fadeUp}
    >
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        {t('auth.signIn.title')}
      </h2>

      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        {t('auth.signIn.intro')}
      </p>

      <ul className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        <li className="flex gap-2">
          <span style={{ color: 'var(--accent)' }}>•</span>
          {t('auth.signIn.benefitSave')}
        </li>
        <li className="flex gap-2">
          <span style={{ color: 'var(--accent)' }}>•</span>
          {t('auth.signIn.benefitSubscribe')}
        </li>
      </ul>

      <div
        className="mt-4 flex items-start gap-2 p-3 rounded-lg text-sm"
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
      >
        <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
        <p>{t('auth.signIn.privacy')}</p>
      </div>

      {/* Both of these appear in response to something the user just did — a
          sign-in that failed, or a page that was never configured for one. They
          slide in rather than appear so it is clear they are new. */}
      <AnimatePresence>
        {error && (
          <motion.p
            key="error"
            className="mt-3 text-sm"
            role="alert"
            style={{ color: '#dc2626' }}
            variants={anim.fadeUp}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {t(error)}
          </motion.p>
        )}
      </AnimatePresence>

      {!configured && (
        <p className="mt-3 text-sm" style={{ color: '#d97706' }}>
          {t('auth.error.notConfigured')}
        </p>
      )}

      <motion.button
        type="button"
        onClick={signIn}
        disabled={!configured}
        className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg
                   text-base font-medium text-white
                   disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: 'var(--accent)' }}
        // A disabled button that still reacts to the cursor is a lie about what
        // clicking it will do, so both gestures are withheld when it cannot run.
        whileHover={configured ? { scale: 1.02, opacity: 0.92 } : undefined}
        whileTap={configured ? { scale: 0.98 } : undefined}
        transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
      >
        <Github size={18} />
        {t('auth.signIn.action')}
      </motion.button>
    </motion.div>
  );
}
