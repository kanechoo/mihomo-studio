import { useState } from 'react';
import { motion } from 'motion/react';
import { Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';
import { useAuthStore } from '../../store/authStore';
import { AccountMenu } from './AccountMenu';
import { SignInModal } from './SignInModal';

// The editor header's account controls: sign in, or who is signed in.
//
// Saving used to live here too and has moved to the other end of the header,
// next to the document it acts on — see SaveButton.
//
// The config library is not here either. It is the home page now, and every
// config is opened into its own tab from there — so an "open" button in this
// header would be a second, quieter way to replace the document this tab is
// named after.
export function CloudBar() {
  const { t } = useTranslation();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const [signInOpen, setSignInOpen] = useState(false);

  // The exchange happens on a page load carrying ?code=, so it is worth its own
  // state: the header would otherwise say "sign in" for the second or two the
  // round trip takes, right after the user just did.
  if (status === 'exchanging' || status === 'restoring') {
    return (
      <span className="text-sm px-3" style={{ color: 'var(--text-secondary)' }}>
        {status === 'exchanging' ? t('auth.signingIn') : t('auth.restoring')}
      </span>
    );
  }

  if (status !== 'authenticated') {
    return (
      <>
        <motion.button
          type="button"
          onClick={() => setSignInOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          whileHover={{ scale: 1.03, opacity: 0.9 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Github size={16} />
          {t('auth.signIn.action')}
        </motion.button>
        <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
      </>
    );
  }

  return <AccountMenu login={user?.login ?? ''} avatarUrl={user?.avatar_url} />;
}
