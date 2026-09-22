import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { X, ChevronDown, Check } from 'lucide-react';
import * as anim from '../../../animation/tokens';
import type { FieldSchema } from '../../../schemas/types';
import {
  DNS_PROVIDERS,
  dnsServersByProvider,
  findDnsServer,
  normalizeDnsUrl,
} from '../../../data/dns';

interface DnsMultiSelectFieldProps {
  field: FieldSchema;
  value: string[] | undefined;
  onChange: (value: string[]) => void;
}

// Picks DNS servers from the bundled provider list. Selection only — no search
// box, since the list is short and already grouped by provider.
export function DnsMultiSelectField({ field, value, onChange }: DnsMultiSelectFieldProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tolerates a bare string from a config that stored one server unwrapped.
  const selected = useMemo(
    () => (Array.isArray(value) ? value : value ? [String(value)] : []),
    [value]
  );

  // Compared on the normalized key, so a config that spells a server
  // `223.5.5.5` still lights up the `udp://223.5.5.5` entry as selected.
  const selectedKeys = useMemo(
    () => new Set(selected.map(normalizeDnsUrl)),
    [selected]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const toggle = (url: string) => {
    const key = normalizeDnsUrl(url);
    if (selectedKeys.has(key)) {
      // Drops whichever spelling is actually stored, not just an exact match.
      onChange(selected.filter((entry) => normalizeDnsUrl(entry) !== key));
    } else {
      onChange([...selected, url]);
    }
  };

  // By index: the same server can legitimately appear twice in an imported list.
  const removeAt = (index: number) => onChange(selected.filter((_, i) => i !== index));

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

      {/* Selected servers, in query order */}
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((entry, index) => {
            const known = findDnsServer(entry);
            return (
              <span
                key={`${entry}:${index}`}
                className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                {/* The stored spelling is shown as-is; an imported `223.5.5.5`
                    stays `223.5.5.5` rather than being rewritten. */}
                <span className="font-mono">{entry}</span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {/* Not in the bundled list is perfectly valid, just unlabelled. */}
                  {known ? known.provider : t('dns.servers.custom')}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  className="p-0.5 rounded-full hover:opacity-70"
                  aria-label={t('dns.servers.remove', { server: entry })}
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t('dns.servers.none')}
        </p>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: isOpen ? 'var(--accent)' : 'var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          {t('dns.servers.add')}
          <motion.span
            className="flex shrink-0"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <ChevronDown size={14} />
          </motion.span>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              role="listbox"
              aria-multiselectable
              className="absolute left-0 right-0 top-full mt-1 z-20 max-h-64 overflow-y-auto rounded-md border shadow-lg"
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
              {DNS_PROVIDERS.map((provider) => (
                <div key={provider}>
                  <p
                    className="sticky top-0 px-3 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {provider}
                  </p>
                  {dnsServersByProvider(provider).map((server) => {
                    const isSelected = selectedKeys.has(normalizeDnsUrl(server.url));
                    return (
                      <motion.button
                        key={server.url}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => toggle(server.url)}
                        className="w-full text-left px-3 py-2 text-sm font-mono flex items-center justify-between gap-2"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        }}
                        whileHover={{ backgroundColor: 'var(--bg-tertiary)' }}
                        transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                      >
                        <span className="truncate">{server.url}</span>
                        {isSelected && <Check size={14} className="shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
