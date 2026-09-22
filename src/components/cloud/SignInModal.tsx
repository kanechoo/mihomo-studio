import { Github, LogIn, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { isGithubLoginConfigured } from '../../api';
import { useAuthStore } from '../../store/authStore';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// The sign-in screen.
//
// It is a dialog rather than a gate in front of the app on purpose. This editor
// worked without a server before there was one, and it still does: the document
// lives in localStorage and every export runs in the browser. An account adds
// two things — configs that survive a different machine, and subscription URLs
// for devices that cannot run this UI — so it is offered where those are asked
// for, not demanded at the door.
export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const { t } = useTranslation();
  const signIn = useAuthStore((state) => state.signIn);
  const error = useAuthStore((state) => state.error);
  const configured = isGithubLoginConfigured();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('auth.signIn.title')}
      icon={<LogIn size={18} />}
      widthClass="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('auth.signIn.intro')}
        </p>

        <ul className="space-y-2 text-sm" style={{ color: 'var(--text-primary)' }}>
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
          className="flex items-start gap-2 p-3 rounded-lg text-sm"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
        >
          <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <p>{t('auth.signIn.privacy')}</p>
        </div>

        {error && (
          <p className="text-sm" role="alert" style={{ color: '#dc2626' }}>
            {t(error)}
          </p>
        )}

        {!configured && (
          <p className="text-sm" style={{ color: '#d97706' }}>
            {t('auth.error.notConfigured')}
          </p>
        )}

        <button
          type="button"
          onClick={signIn}
          disabled={!configured}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                     text-sm font-medium text-white transition-opacity
                     disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Github size={16} />
          {t('auth.signIn.action')}
        </button>
      </div>
    </Modal>
  );
}
