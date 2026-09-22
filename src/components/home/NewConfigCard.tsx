import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';

// Starts a document in its own tab, like every other card here.
// `/client-config-editor` with no id is the new-config route.
export function NewConfigCard() {
  const { t } = useTranslation();

  return (
    <motion.a
      href="/client-config-editor"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-5 rounded-xl border-2 border-dashed"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
      variants={{
        ...anim.fadeUp,
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
        style={{ backgroundColor: 'var(--accent)' }}
        // Grows a little under the cursor — enough to acknowledge the pointer
        // without claiming anything has happened yet.
        variants={{ hover: { scale: 1.05 } }}
        transition={{ duration: anim.DURATION.base, ease: anim.EASE_OUT }}
      >
        <Plus size={28} />
      </motion.span>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('home.newConfig')}
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('home.opensInNewTab')}
        </p>
      </div>
    </motion.a>
  );
}
