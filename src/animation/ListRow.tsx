import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { DURATION, EASE_OUT } from './tokens';

// A row that grows into a list and collapses out of it.
//
// Wraps rather than replaces the row it is given, because every list this is
// used in is a dnd-kit sortable: the card itself carries a drag transform, and
// motion writes transforms too. Keeping them on separate elements is what stops
// a drag and an entrance animation from overwriting each other.
//
// Height rather than opacity alone, because a row vanishing leaves a hole that
// the rows below snap into. Animating the height means they travel instead —
// which is the difference between "the row I deleted went away" and "the list
// changed while I was looking at it".
export function ListRow({ children }: { children: ReactNode }) {
  return (
    <motion.div
      // overflow is set by the animation rather than by a class, and handed
      // back at the end of the entrance. A permanently clipped wrapper would
      // cut the card off the moment it was dragged out of its own bounds —
      // which is most of a drag.
      initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
      animate={{ opacity: 1, height: 'auto', transitionEnd: { overflow: 'visible' } }}
      // marginTop as well as height: the gap between rows comes from the
      // parent's space-y-*, and a collapsed row that keeps its margin leaves
      // the very gap this is closing.
      exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
