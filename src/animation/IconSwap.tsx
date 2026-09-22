import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT } from './tokens';

interface IconSwapProps {
  // Changing this is what triggers the swap. It names the state, not the icon:
  // "saved" rather than "check".
  swapKey: string;
  children: ReactNode;
  // Matches the icon's own size prop. The box is fixed so that the swap does
  // not resize whatever sits beside it.
  size?: number;
}

// An icon that changes to report what just happened — Save becoming a tick,
// Copy becoming a tick — without the change being a jump cut.
//
// The outgoing icon leaves before the incoming one arrives (mode="wait")
// because they occupy the same square: crossfading them in place would show a
// tick and a disk overlaid for a moment, which reads as a glitch rather than as
// a transition. Both are absolutely positioned inside a fixed box for the same
// reason the wait exists — nothing beside the icon should move.
export function IconSwap({ swapKey, children, size = 16 }: IconSwapProps) {
  return (
    <span
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={swapKey}
          className="absolute flex"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
