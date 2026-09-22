import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { IconSwap } from '../../animation/IconSwap';
import * as anim from '../../animation/tokens';

export interface IconMenuOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface IconMenuProps<T extends string> {
  // Shown on the trigger. Usually reflects the current selection.
  icon: ReactNode;
  // Set this when `icon` changes with the selection, and the trigger will swap
  // icons rather than cut between them. Left unset for a menu whose trigger is
  // a fixed glyph — animating a swap between two identical icons is movement
  // that reports nothing.
  iconKey?: string;
  // Accessible name for the trigger, since it has no visible text.
  label: string;
  value: T;
  options: Array<IconMenuOption<T>>;
  onSelect: (value: T) => void;
}

// A single icon button that opens a short list of choices. The header has
// room for icons but not for a labelled button per option, which is what the
// language control used to be.
export function IconMenu<T extends string>({
  icon,
  iconKey,
  label,
  value,
  options,
  onSelect,
}: IconMenuProps<T>) {
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

  return (
    <div className="relative" ref={containerRef}>
      <motion.button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="p-2 rounded-md"
        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={label}
        whileHover={{ opacity: 0.8 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
      >
        {iconKey === undefined ? icon : <IconSwap swapKey={iconKey} size={20}>{icon}</IconSwap>}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            // Right-aligned: these controls sit at the end of the header, so a
            // left-aligned menu would hang off the edge of the window. The
            // transform origin follows from that — the menu should look like it
            // unfolded from the button above it, and a centre origin would have
            // it grow out of thin air an inch to the left.
            className="absolute right-0 top-full mt-1 z-30 min-w-36 rounded-md border shadow-lg overflow-hidden"
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
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <motion.button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                  whileHover={{ backgroundColor: 'var(--bg-tertiary)' }}
                  transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                >
                  {option.icon && <span className="shrink-0">{option.icon}</span>}
                  <span className="flex-1 whitespace-nowrap">{option.label}</span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
