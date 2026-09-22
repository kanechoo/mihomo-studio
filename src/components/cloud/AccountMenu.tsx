import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Github, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';
import { useAuthStore } from '../../store/authStore';

interface AccountMenuProps {
  login: string;
  avatarUrl?: string;
  // The home page's header is roomier than the editor's, and the avatar is the
  // only thing identifying the session on either.
  size?: 'sm' | 'lg';
}

// The signed-in avatar and what hangs off it. Lives on both pages, which is why
// it is its own file rather than a helper inside the editor's header.
export function AccountMenu({ login, avatarUrl, size = 'sm' }: AccountMenuProps) {
  const { t } = useTranslation();
  const signOut = useAuthStore((state) => state.signOut);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const box = size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={login}
        title={login}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className={`${box} object-cover`} />
        ) : (
          <span
            className={`${box} flex items-center justify-center`}
            style={{ color: 'var(--text-primary)' }}
          >
            <Github size={size === 'lg' ? 18 : 16} />
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            className="absolute right-0 top-full mt-1 z-30 min-w-44 rounded-md border shadow-lg overflow-hidden"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
              transformOrigin: 'top right',
            }}
            variants={anim.menu}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div
              className="px-3 py-2 text-xs border-b"
              style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
            >
              {t('auth.signedInAs', { login })}
            </div>
            <motion.button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
              style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              whileHover={{ backgroundColor: 'var(--bg-tertiary)' }}
              transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
            >
              <LogOut size={14} />
              {t('auth.signOut')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
