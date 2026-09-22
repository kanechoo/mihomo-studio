import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import * as anim from '../../animation/tokens';

// The app's dropdown. A native `<select>` is painted by the OS, so a Mihomo
// config editor in dark mode still gets a white Windows listbox with system
// fonts and a system blue highlight — the one control in the app that ignores
// the theme. This is the replacement, and everything that used to be a
// `<select>` goes through it.
//
// The cost of leaving the platform is that the platform's keyboard handling
// leaves with it, so it is reimplemented below: arrows, Home/End, Enter,
// Escape and type-to-jump. A dropdown you cannot drive from the keyboard is a
// worse control than the ugly one it replaced.

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  // Listed but not choosable, for a value that exists in the format and is
  // unavailable in this particular combination — `mrs` under some behaviours.
  // Hiding it entirely would leave people hunting for an option that the
  // documentation says exists.
  disabled?: boolean;
}

export interface SelectGroup<T extends string = string> {
  label: string;
  options: Array<SelectOption<T>>;
}

export type SelectItem<T extends string = string> = SelectOption<T> | SelectGroup<T>;

const isGroup = <T extends string>(item: SelectItem<T>): item is SelectGroup<T> =>
  'options' in item;

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: Array<SelectItem<T>>;
  // Shown when `value` matches no option. Most lists here carry their own
  // empty entry; this is the backstop for a value that arrived from an
  // imported config and no longer resolves.
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  // Paints the border red. The explanation stays with the caller, which is the
  // one that knows whether the value is dangling, unknown or merely missing.
  invalid?: boolean;
  // Sizing only. Colours and border belong to the control, so that every
  // dropdown in the app is recognisably the same control.
  className?: string;
  'aria-label'?: string;
}

const TRIGGER = 'w-full px-3 py-2 rounded-md border text-sm';

// Where the menu sits, in viewport coordinates. Fixed rather than absolute
// because the menu is portalled out of whatever scroll container the trigger
// lives in.
interface MenuRect {
  left: number;
  top: number;
  minWidth: number;
  maxHeight: number;
  above: boolean;
}

// Breathing room between the menu and the edge of the window.
const VIEWPORT_MARGIN = 8;
const MENU_GAP = 4;
const MAX_MENU_HEIGHT = 256;

// A keystroke this long after the last one starts a new word rather than
// extending the old one. Matches the platform convention closely enough that
// typing "sing" then pausing then "m" jumps to Mihomo rather than searching
// for "singm".
const TYPEAHEAD_RESET_MS = 800;

export function Select<T extends string>({
  value,
  onChange,
  items,
  placeholder,
  id,
  disabled = false,
  invalid = false,
  className = TRIGGER,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: '', at: 0 });
  const listId = useId();

  // Groups are flattened once into the rows the menu paints and the flat list
  // the keyboard walks, so an index means the same thing to both.
  const rows: Array<
    { kind: 'group'; label: string } | { kind: 'option'; option: SelectOption<T>; index: number }
  > = [];
  const options: Array<SelectOption<T>> = [];
  for (const item of items) {
    if (isGroup(item)) {
      rows.push({ kind: 'group', label: item.label });
      for (const option of item.options) {
        rows.push({ kind: 'option', option, index: options.length });
        options.push(option);
      }
    } else {
      rows.push({ kind: 'option', option: item, index: options.length });
      options.push(item);
    }
  }

  const selected = options.find((option) => option.value === value);

  // Clamps at the ends rather than wrapping: in a list of two hundred country
  // codes, jumping from the last entry back to the first reads as the list
  // having moved, not the cursor.
  const step = (from: number, delta: number) => {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) {
      if (!options[i].disabled) return i;
    }
    return from;
  };

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const below = window.innerHeight - box.bottom - MENU_GAP - VIEWPORT_MARGIN;
    const above = box.top - MENU_GAP - VIEWPORT_MARGIN;
    // Open upwards only when below genuinely cannot hold the menu and above
    // can do better. Flipping on a near-tie makes the direction feel random.
    const flip = below < Math.min(MAX_MENU_HEIGHT, above) && above > below;
    setRect({
      left: box.left,
      top: flip ? box.top - MENU_GAP : box.bottom + MENU_GAP,
      minWidth: box.width,
      maxHeight: Math.max(96, Math.min(MAX_MENU_HEIGHT, flip ? above : below)),
      above: flip,
    });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const open = () => {
    if (disabled || options.length === 0) return;
    measure();
    const current = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(current >= 0 ? current : step(-1, 1));
    setIsOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  };

  // Dismiss on a click anywhere else, the way a native select does. The menu
  // is portalled, so it is not inside the trigger's subtree and has to be
  // asked about separately.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, close]);

  // Being portalled also means the menu no longer travels with the scroll
  // container it was opened from, so it is re-measured against the trigger.
  // Capture phase, because the scroll happens on some ancestor div — a modal
  // body or the form pane — and not on the window.
  useEffect(() => {
    if (!isOpen) return;
    const handle = () => measure();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [isOpen, measure]);

  // Keep the highlighted option in view. Done by hand rather than with
  // scrollIntoView, which also scrolls every ancestor and would drag the form
  // underneath the menu around.
  useLayoutEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const list = listRef.current;
    const node = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !node) return;
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [isOpen, activeIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) open();
        else setActiveIndex((i) => step(i, event.key === 'ArrowDown' ? 1 : -1));
        return;
      case 'Home':
      case 'End':
        if (!isOpen) return;
        event.preventDefault();
        setActiveIndex(event.key === 'Home' ? step(-1, 1) : step(options.length, -1));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!isOpen) open();
        else commit(activeIndex);
        return;
      case 'Escape':
        if (!isOpen) return;
        // Don't let a surrounding modal read this as a request to close: the
        // first Escape belongs to the dropdown that is actually open.
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        if (isOpen) close();
        return;
      default:
        break;
    }

    // Type-to-jump. Unlike a native select this only moves the highlight and
    // never commits: a stray keystroke on a focused control should not quietly
    // rewrite the config behind it.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    const buffer =
      now - typeahead.current.at > TYPEAHEAD_RESET_MS
        ? event.key
        : typeahead.current.buffer + event.key;
    typeahead.current = { buffer, at: now };
    const needle = buffer.toLowerCase();
    const match = options.findIndex(
      (option) => !option.disabled && option.label.toLowerCase().startsWith(needle)
    );
    if (match < 0) return;
    event.preventDefault();
    if (!isOpen) open();
    setActiveIndex(match);
  };

  const menu = rect && (
    <motion.div
      id={listId}
      ref={listRef}
      role="listbox"
      tabIndex={-1}
      aria-label={ariaLabel}
      className="fixed z-[60] overflow-y-auto rounded-md border shadow-lg"
      style={{
        left: rect.left,
        // Anchored by whichever edge meets the trigger, so a menu that opens
        // upwards grows away from the button instead of over it.
        ...(rect.above
          ? { bottom: window.innerHeight - rect.top }
          : { top: rect.top }),
        minWidth: rect.minWidth,
        maxWidth: `min(24rem, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
        maxHeight: rect.maxHeight,
        width: 'max-content',
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
        transformOrigin: rect.above ? 'bottom left' : 'top left',
      }}
      variants={anim.menu}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {rows.map((row, rowIndex) =>
        row.kind === 'group' ? (
          <p
            key={`group-${rowIndex}`}
            className="px-3 py-1.5 text-xs font-medium"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            {row.label}
          </p>
        ) : (
          <button
            key={`option-${row.index}`}
            type="button"
            role="option"
            id={`${listId}-${row.index}`}
            data-index={row.index}
            aria-selected={row.option.value === value}
            aria-disabled={row.option.disabled || undefined}
            // Keeps focus on the trigger for the whole interaction. Without
            // this, clicking an option focuses a button that unmounts a moment
            // later, and focus lands back on the document body — so the next
            // Tab starts from the top of the page rather than from the control
            // that was just used.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit(row.index)}
            // Pointer and keyboard drive the same highlight, so the list never
            // shows two options looking chosen at once. mousemove rather than
            // mouseenter: arrowing through a long list scrolls entries under a
            // stationary cursor, and mouseenter would let the mouse steal the
            // highlight back from the key that was just pressed.
            onMouseMove={() => {
              if (!row.option.disabled) setActiveIndex(row.index);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
            style={{
              // The idle colour is the menu's own rather than `transparent`,
              // so the highlight interpolates between two opaque colours
              // instead of fading up through transparent black.
              backgroundColor:
                row.index === activeIndex ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
              color: row.option.disabled
                ? 'var(--text-secondary)'
                : row.option.value === value
                  ? 'var(--accent)'
                  : 'var(--text-primary)',
              opacity: row.option.disabled ? 0.5 : 1,
              cursor: row.option.disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <span className="flex-1 truncate">{row.option.label}</span>
            {row.option.value === value && <Check size={14} className="shrink-0" />}
          </button>
        )
      )}
    </motion.div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between gap-2 text-left ${className} ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        style={{
          backgroundColor: 'var(--bg-primary)',
          // Red for a value the config cannot resolve; the accent while open,
          // so an open dropdown looks as active as a focused native one did.
          borderColor: invalid
            ? '#ef4444'
            : isOpen
              ? 'var(--accent)'
              : 'var(--border-color)',
          color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        <span className="truncate">{selected ? selected.label : (placeholder ?? '')}</span>
        <motion.span
          className="flex shrink-0"
          style={{ color: 'var(--text-secondary)' }}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      {/* Out to the body, past the `overflow-y-auto` on the form pane and on
          every modal body. Left in place, a menu opened from a control near
          the bottom of a dialog would be cut off at the dialog's edge — which
          is the one thing a native select was still doing better. */}
      {createPortal(<AnimatePresence>{isOpen && menu}</AnimatePresence>, document.body)}
    </div>
  );
}
