import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowLeft, Loader2, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';

type NoticeTone = 'error' | 'loading' | 'locked';

// The full-page fallback both editor entry routes share: the config is
// loading, gone, or behind a sign-in.
//
// The message lives inside a card rather than as bare text on the page
// background. Bare text inherits whatever contrast the theme gives it, and the
// quiet tertiary Home button beside it all but disappeared in dark mode. The
// card is the same surface every other page puts content on (--bg-primary on
// --bg-secondary), so this state reads as part of the app rather than as an
// unstyled gap in it.
export function NoticeCard({
  tone,
  title,
  children,
}: {
  tone: NoticeTone;
  title: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  const Icon = tone === 'error' ? AlertCircle : tone === 'loading' ? Loader2 : Lock;
  // Error red is fixed rather than themed: it has to read as an error in both
  // color schemes, and the translucent wash behind it stays legible on the card
  // without a hard-coded panel. Loading borrows the accent; locked is neutral
  // because it is a state, not a failure.
  const iconStyle =
    tone === 'error'
      ? { backgroundColor: 'rgba(220, 38, 38, 0.12)', color: '#dc2626' }
      : tone === 'loading'
        ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }
        : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' };

  return (
    <div
      className="h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      <motion.div
        className="w-full max-w-md p-6 rounded-xl border text-center"
        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
        variants={anim.fadeUp}
        initial="hidden"
        animate="visible"
      >
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
          style={iconStyle}
        >
          <Icon size={22} className={tone === 'loading' ? 'animate-spin' : undefined} />
        </span>

        <h1 className="mt-4 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h1>

        {children && <div className="mt-4 text-left">{children}</div>}

        {/* Accent-filled, like every primary button in the app. The previous
            tertiary fill was near-invisible against the dark page background —
            the reason this card exists. */}
        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <ArrowLeft size={16} />
          {t('nav.home')}
        </Link>
      </motion.div>
    </div>
  );
}
