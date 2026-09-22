import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { X, Search, RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import * as anim from '../../../animation/tokens';
import type { FieldSchema } from '../../../schemas/types';
import { useGeositeStore } from '../../../store/geositeStore';
import { isGeositeCategory } from '../../../data/geosite';

// The database carries ~1500 entries; painting them all makes the list janky
// and is useless to scroll anyway. The search box is how you reach the rest.
const MAX_VISIBLE = 100;

interface GeositeSelectFieldProps {
  field: FieldSchema;
  value: string | string[] | undefined;
  onChange: (value: string[]) => void;
}

// Picks geosite categories from the live database. Selection only — a name
// typed by hand can't be committed, so a misremembered category can never
// become a rule that silently never matches. Always emits a string[]; callers
// that store a single value collapse it themselves.
export function GeositeSelectField({ field, value, onChange }: GeositeSelectFieldProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const names = useGeositeStore((state) => state.names);
  const status = useGeositeStore((state) => state.status);
  const error = useGeositeStore((state) => state.error);
  const load = useGeositeStore((state) => state.load);

  // The store caches and de-duplicates, so every mounted field can ask.
  useEffect(() => {
    load();
  }, [load]);

  // Set when focus opens the list, so the same click that triggered the focus
  // cannot then read the list as open and close it again. Without this, the
  // first click into an unfocused field ran focus → open → click → close, and
  // the list flashed open and shut. Only a genuine closed→open transition arms
  // it: focus landing while the list is already open (coming back from an
  // option click) must leave the very next click free to collapse.
  const focusOpenedRef = useRef(false);

  const close = () => {
    setIsOpen(false);
    setQuery('');
    focusOpenedRef.current = false;
  };

  // Dismiss on a click anywhere else, the way a native select behaves.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // A rule saved before this field existed holds a bare string.
  const selected = useMemo(
    () => (Array.isArray(value) ? value : value ? [String(value)] : []),
    [value]
  );

  const trimmedQuery = query.trim();

  const matches = useMemo(() => {
    const pool = names.filter((name) => !selected.includes(name));
    if (trimmedQuery === '') return pool;
    const needle = trimmedQuery.toLowerCase();
    return pool.filter((name) => name.toLowerCase().includes(needle));
  }, [names, selected, trimmedQuery]);

  const visible = matches.slice(0, MAX_VISIBLE);
  const hiddenCount = matches.length - visible.length;
  const hasList = names.length > 0;

  // Only ever called with a name that came out of the list.
  const add = (name: string) => {
    if (!selected.includes(name)) onChange([...selected, name]);
    // Stay open so several categories can be picked in one go.
    setQuery('');
    inputRef.current?.focus();
  };

  const remove = (name: string) => onChange(selected.filter((entry) => entry !== name));

  // Clicking the field again collapses it, the way a native select toggles.
  // The dismiss-on-outside-click handler ignores everything inside the
  // container, so without this an open list had no way to be closed from the
  // input itself. The click that focused the input is absorbed — opening
  // already happened in handleInputFocus — and close() also clears the query,
  // matching every other way the list is dismissed.
  const handleInputFocus = () => {
    if (!isOpen) focusOpenedRef.current = true;
    setIsOpen(true);
  };

  const handleInputClick = () => {
    if (focusOpenedRef.current) {
      focusOpenedRef.current = false;
      return;
    }
    if (isOpen) {
      close();
    } else {
      setIsOpen(true);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Don't let the surrounding modal treat this as a request to close.
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Enter') {
      // Enter would otherwise submit the surrounding form. It picks the top
      // match — never the raw text, which is not a valid value on its own.
      event.preventDefault();
      if (visible.length > 0) add(visible[0]);
    }
  };

  return (
    <div className="mb-4" ref={containerRef}>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
        {t(field.label)}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.description && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t(field.description)}
        </p>
      )}

      {/* Selected entries */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((name) => {
            // Only flag strays once a list exists to compare against. These can
            // only arrive from an imported config, never from this field.
            const isUnknown = hasList && !names.includes(name);
            return (
              <span
                key={name}
                className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: isUnknown ? '#ef4444' : 'var(--text-primary)',
                }}
                title={isUnknown ? t('geosite.unknown', { name }) : undefined}
              >
                {name}
                <button
                  type="button"
                  onClick={() => remove(name)}
                  className="p-0.5 rounded-full hover:opacity-70"
                  aria-label={t('geosite.remove', { name })}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t('geosite.none')}
        </p>
      )}

      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-secondary)' }}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          onKeyDown={handleKeyDown}
          placeholder={t('geosite.search')}
          className="w-full pl-9 pr-9 py-2 rounded-md border text-sm cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: isOpen ? 'var(--accent)' : 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
        <motion.span
          className="absolute right-3 top-1/2 -translate-y-1/2 flex pointer-events-none"
          style={{ color: 'var(--text-secondary)' }}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <ChevronDown size={14} />
        </motion.span>

        {/* Options — overlaid so opening the list doesn't push the form around */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              role="listbox"
              className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-md border shadow-lg"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
                transformOrigin: 'top left',
              }}
              variants={anim.menu}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {visible.map((name) => (
                <motion.button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => add(name)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2"
                  style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  whileHover={{ backgroundColor: 'var(--bg-tertiary)' }}
                  transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                >
                  <span className="truncate">{name}</span>
                  {isGeositeCategory(name) && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {t('geosite.category')}
                    </span>
                  )}
                </motion.button>
              ))}

              {hiddenCount > 0 && (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t('geosite.more', { remaining: hiddenCount })}
                </p>
              )}

              {visible.length === 0 && (
                <p className="px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {!hasList
                    ? status === 'loading'
                      ? t('geosite.loading')
                      : t('geosite.unavailable')
                    : trimmedQuery !== ''
                      ? t('geosite.noMatches', { query: trimmedQuery })
                      : t('geosite.allSelected')}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Service state — kept outside the dropdown so a broken picker is
          visible without having to open it. */}
      {status === 'loading' && !hasList && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
          <RefreshCw size={12} className="animate-spin" />
          {t('geosite.loading')}
        </p>
      )}
      {status === 'error' && (
        <div className="text-xs mt-2 flex items-start gap-1 text-red-500">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>
            {hasList
              ? t('geosite.errorCached', { message: error })
              : t('geosite.error', { message: error })}{' '}
            <button type="button" onClick={() => load(true)} className="underline hover:opacity-80">
              {t('geosite.retry')}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
