import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Server } from 'lucide-react';
import * as anim from '../../animation/tokens';

// The server-side designer's entry on the landing page. Same contract as
// NewConfigCard: an ordinary link opening in its own tab, so the client and
// server designers live in separate tabs with separate drafts — the state
// isolation is the address bar, not a store flag.
export function NewServerConfigCard() {
  const { t } = useTranslation();
  return (
    <motion.a
      href="/server-config-editor"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-5 rounded-xl border transition-colors"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
      variants={{
        ...anim.fadeUp,
        // Same lift-and-shadow as NewConfigCard, so both entry cards answer
        // the pointer identically.
        hover: { y: -2, boxShadow: '0 12px 24px -14px rgb(0 0 0 / 0.35)' },
      }}
      // Named rather than inline, so the badge below can react to the same
      // gesture: a child listens for the parent's "hover" state by defining a
      // variant of that name, which an inline object could not address.
      whileHover="hover"
      whileTap={{ scale: 0.99 }}
      transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
    >
      <motion.span
        className="shrink-0 p-3 rounded-lg text-white"
        style={{ backgroundColor: '#16a34a' }}
        variants={{ hover: { scale: 1.05 } }}
        transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
      >
        <Server size={28} />
      </motion.span>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('home.newServerConfig')}
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('home.opensInNewTab')}
        </p>
      </div>
    </motion.a>
  );
}
