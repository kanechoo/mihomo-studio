import { useEffect, useRef, type WheelEvent } from 'react';

/**
 * Wheel-driven tab switching with the active tab kept inside a horizontally
 * scrollable strip. `onWheel` moves one tab per wheel click (with a short
 * hold-off) and the strip scrolls itself so the active tab stays visible.
 */
export function useWheelTabSwitcher<T extends string>(
  order: readonly T[],
  active: T,
  setActive: (tab: T) => void
) {
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const lastSwitch = useRef(0);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;

    const now = event.timeStamp;
    if (now - lastSwitch.current < 160) return;

    event.preventDefault();
    const currentIndex = order.indexOf(active);
    if (currentIndex === -1) return;

    const step = event.deltaY > 0 ? 1 : -1;
    const nextIndex = (currentIndex + step + order.length) % order.length;
    lastSwitch.current = now;
    setActive(order[nextIndex]);
  };

  const registerTabButton = (key: T) => (node: HTMLButtonElement | null) => {
    tabButtonRefs.current[key] = node;
  };

  useEffect(() => {
    const strip = tabStripRef.current;
    const button = tabButtonRefs.current[active];
    if (!strip || !button) return;

    const stripRect = strip.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const left = buttonRect.left - stripRect.left + strip.scrollLeft;
    const right = left + buttonRect.width;

    let target = strip.scrollLeft;
    if (left < strip.scrollLeft) {
      target = left;
    } else if (right > strip.scrollLeft + strip.clientWidth) {
      target = right - strip.clientWidth;
    }

    if (target !== strip.scrollLeft) {
      strip.scrollTo({ left: target, behavior: 'smooth' });
    }
  }, [active]);

  return { tabStripRef, registerTabButton, handleWheel };
}
