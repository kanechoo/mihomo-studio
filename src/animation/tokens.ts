// The app's movement vocabulary, in one file.
//
// Animation goes wrong the same way colour does: every component picks its own
// duration, and the result reads as a dozen unrelated widgets rather than one
// program. These are the equivalent of the CSS variables in globals.css — a
// component should reach for a token here, not invent 0.3s of its own.
//
// The durations are short on purpose. Motion in a tool like this exists to say
// *where a thing came from*, so that a deleted row does not simply blink out of
// existence and leave you wondering what moved. Anything long enough to notice
// as an animation is long enough to wait for, and you wait for it every time.

import type { Transition, Variants } from 'motion/react';

export const DURATION = {
  // Menus and other things that appear directly under the cursor. They are
  // already where the eye is, so they only need to not be instant.
  fast: 0.15,
  // The default: cards, dialogs, panes.
  base: 0.22,
  // Reserved for things that cross a lot of the screen.
  slow: 0.32,
} as const;

// Decelerating: fast at the start, settling at the end. Entrances use it
// because the arrival is the part worth seeing.
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Accelerating, for exits. A leaving element should get out of the way rather
// than linger, so exits are also shorter than entrances everywhere below.
export const EASE_IN: [number, number, number, number] = [0.64, 0, 0.78, 0];

export const enter: Transition = { duration: DURATION.base, ease: EASE_OUT };
export const exit: Transition = { duration: DURATION.fast, ease: EASE_IN };

// For `layout` animations — a list closing the gap left by a deleted row.
// A spring rather than a duration because the distance varies with how tall the
// removed row was, and a fixed duration makes short moves look slow and long
// ones look hurried.
export const layoutSpring: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 40,
  mass: 0.9,
};

// The standard entrance: from slightly below, because content arriving from
// below is the convention for "this was just added to a list you are reading".
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: enter },
  exit: { opacity: 0, y: -4, transition: exit },
};

// Same idea with no travel, for things whose position is already meaningful.
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: enter },
  exit: { opacity: 0, transition: exit },
};

// A row arriving in or leaving a list.
//
// It leaves by shrinking in place rather than sliding, because the rows below
// it are about to move up into the space it frees. Two things travelling in
// different directions at the same moment reads as the list rearranging itself
// at random, which is the opposite of what the animation is for: showing that
// the row you deleted is the row that went away.
export const listRow: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: enter },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

// Applied to a list so its children arrive in sequence instead of all at once.
// The gap is deliberately small: 0.05s reads as one gesture with texture, while
// anything near 0.15s turns a six-item list into a performance.
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};

export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE_IN } },
};

// Dialogs grow very slightly into place. The scale starts at 0.97 and not, say,
// 0.8: a dialog that visibly zooms draws attention to the animation instead of
// to the text it is asking you to read.
export const dialog: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: enter },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: exit },
};

// Menus unfold from their trigger. Every menu in this app is right-aligned and
// hangs below its button, so the origin is set to match in the component —
// scaling from the centre would have it grow out of the wrong corner.
export const menu: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.12, ease: EASE_IN } },
};
