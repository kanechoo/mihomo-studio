import { forwardRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import * as anim from '../../animation/tokens';

// The two footer buttons every dialog shares. They exist so that "Cancel" looks
// and behaves the same in every dialog in the app — same padding, same corner,
// same hover lift and press dip — because a button that changes personality
// between two dialogs read as two different buttons doing two different things.
//
// The look is the one the listener editor settled on: theme variables rather
// than fixed Tailwind grays, so both color schemes come from one place, and a
// small scale on hover/tap (the interaction the shared Modal shell already
// uses for its close button) instead of a background swap that some of the
// older footers had and others did not.
const BUTTON_CLASSES =
  'px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';

const TRANSITION = { duration: anim.DURATION.fast, ease: anim.EASE_OUT };

interface CancelButtonProps {
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

export const CancelButton = forwardRef<HTMLButtonElement, CancelButtonProps>(
  function CancelButton({ onClick, children, className }, ref) {
    return (
      <motion.button
        ref={ref}
        type="button"
        onClick={onClick}
        className={className ? `${BUTTON_CLASSES} ${className}` : BUTTON_CLASSES}
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={TRANSITION}
      >
        {children}
      </motion.button>
    );
  }
);

interface PrimaryButtonProps {
  onClick: () => void;
  children: ReactNode;
  // Disabled while the dialog's own validation or an in-flight save says so;
  // a disabled primary neither lifts nor dips under the cursor.
  disabled?: boolean;
  // Paints the button red. Destructive confirmations use this; form dialogs
  // never do.
  destructive?: boolean;
  className?: string;
}

export function PrimaryButton({
  onClick,
  children,
  disabled = false,
  destructive = false,
  className,
}: PrimaryButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || undefined}
      className={className ? `${BUTTON_CLASSES} ${className}` : BUTTON_CLASSES}
      style={{
        backgroundColor: destructive ? '#dc2626' : 'var(--accent)',
        color: '#ffffff',
      }}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={TRANSITION}
    >
      {children}
    </motion.button>
  );
}
