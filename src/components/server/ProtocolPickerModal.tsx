import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Search, X, ChevronRight } from 'lucide-react';
import * as anim from '../../animation/tokens';
import { Modal } from '../common/Modal';
import {
  availableListenerSchemas,
} from '../../schemas/listeners';
import type { ListenerCategory, ListenerSchema } from '../../schemas/listeners/dsl';
import type { TuicVersion } from '../../core/server/types';

interface ProtocolPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (kind: ListenerSchema['kind'], version?: TuicVersion) => void;
}

const CATEGORY_ORDER: ListenerCategory[] = [
  'app-proxy',
  'encrypted',
  'quic',
  'transparent',
  'other',
];

function capabilityDots(schema: ListenerSchema): string[] {
  const dots: string[] = [];
  if (schema.capability.tls) dots.push('TLS');
  if (schema.capability.reality) dots.push('Reality');
  if (schema.capability.quic) dots.push('QUIC');
  if (schema.capability.xhttp) dots.push('XHTTP');
  if (schema.capability.udp) dots.push('UDP');
  return dots;
}

// The protocol chooser behind "Add listener": search across names and kinds,
// then one card per protocol grouped by category. Picking a card creates the
// listener immediately and opens its editor — the modal never needs a
// selected-in-waiting state.
export function ProtocolPickerModal({ open, onClose, onPick }: ProtocolPickerModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const all = availableListenerSchemas();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? all.filter(
          (schema) =>
            t(schema.labelKey).toLowerCase().includes(q) ||
            schema.kind.toLowerCase().includes(q)
        )
      : all;
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: filtered.filter((schema) => schema.category === category),
    })).filter((group) => group.items.length > 0);
  }, [query, t]);

  const totalResults = grouped.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <Modal isOpen={open} onClose={onClose} title={t('server.picker.title')} widthClass="max-w-3xl">
      <div className="space-y-4">
        {/* Search — sticky to the dialog top so it stays reachable while the
            protocol list scrolls beneath it. */}
        <div className="sticky -top-4 -mx-1 px-1 pt-1 pb-1 z-10" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-secondary)' }}
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('server.picker.search')}
              aria-label={t('server.picker.search')}
              className="w-full pl-9 pr-9 py-2.5 rounded-md border text-sm"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('common.cancel')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* The scroll box clips its children on every axis, so without inner
            padding the hover shadow and the scaled card edges would be sliced
            off at the left/right. The padding gives them paint room; the
            negative margin keeps the grid aligned with the search field. */}
        <div className="max-h-[55vh] overflow-y-auto space-y-5 p-2 -mx-2">
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                {t(`server.category.${category}`)}
                <span
                  className="px-1.5 py-px rounded-full text-[10px] font-medium normal-case"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  {items.length}
                </span>
              </p>
              {/* One column on phones, two from tablet up: cards keep a
                  readable width instead of being squeezed into slivers. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((schema) => {
                  const supportedShare = schema.shareUri === 'supported';
                  return (
                    <motion.button
                      key={schema.kind + (schema.tuicVersion ?? '')}
                      type="button"
                      onClick={() => onPick(schema.kind, schema.tuicVersion)}
                      className="text-left p-3.5 rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 group"
                      style={{
                        borderColor: 'var(--border-color)',
                        backgroundColor: 'var(--bg-primary)',
                      }}
                      whileHover={{
                        // Same lift-shadow-scale treatment as the home page's
                        // entry cards, so picking a protocol feels like the
                        // rest of the app.
                        y: -2,
                        scale: 1.02,
                        borderColor: 'var(--accent)',
                        boxShadow: '0 12px 24px -14px rgb(0 0 0 / 0.35)',
                        transition: { duration: anim.DURATION.base, ease: anim.EASE_OUT },
                      }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {t(schema.labelKey)}
                        </span>
                        <ChevronRight
                          size={15}
                          className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--accent)' }}
                        />
                      </span>
                      <span className="block text-xs mt-1 line-clamp-2 min-h-[2em]" style={{ color: 'var(--text-secondary)' }}>
                        {t(schema.descriptionKey)}
                      </span>
                      <span className="flex flex-wrap gap-1 mt-2.5">
                        {capabilityDots(schema).map((dot) => (
                          <span
                            key={dot}
                            className="px-1.5 py-0.5 rounded text-[10px] border font-mono"
                            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                          >
                            {dot}
                          </span>
                        ))}
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] border font-mono"
                          style={{
                            borderColor: supportedShare ? 'var(--accent)' : 'var(--border-color)',
                            color: supportedShare ? 'var(--accent)' : 'var(--text-secondary)',
                          }}
                        >
                          {t('server.share.badgeLabel')}:{t(`server.share.badge.${schema.shareUri}`)}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))}

          {totalResults === 0 && (
            <div className="py-12 text-center rounded-lg border-2 border-dashed" style={{ borderColor: 'var(--border-color)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('server.picker.noMatch')}
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
