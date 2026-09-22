import { motion } from 'motion/react';
import { Trash2, Edit, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProxyNode } from '../../core/ir';
import { getProtocolDisplayName } from '../../data/protocols';
import * as anim from '../../animation/tokens';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ProxyCardProps {
  proxy: ProxyNode;
  onEdit: () => void;
  onDelete: () => void;
}

// Protocols that run over a transport, and so have one worth naming on the card.
//
// hysteria2 and tuic are missing on purpose: they are QUIC all the way down and
// have nothing to choose. A tag on those would be a label with one possible
// value, which tells the reader nothing and costs them a glance on every row.
const TRANSPORTED = new Set(['vless', 'trojan', 'vmess']);

const NETWORK_LABELS: Record<string, string> = {
  tcp: 'TCP',
  ws: 'WS',
  grpc: 'gRPC',
  h2: 'HTTP/2',
  xhttp: 'XHTTP',
};

// What to put on the tag, or null for a node that has no transport to speak of.
//
// An absent `network` on a protocol that has one reads as TCP, which is what
// mihomo assumes and what the form fills in — not as "unknown". A value this app
// does not recognise is shown as it was written rather than hidden or corrected:
// an imported node speaking something unusual is exactly when the reader most
// wants to be told.
function networkLabel(proxy: ProxyNode): string | null {
  const raw = proxy.config?.network;
  const network = typeof raw === 'string' ? raw.trim() : '';

  if (!network) return TRANSPORTED.has(proxy.type) ? NETWORK_LABELS.tcp : null;
  return NETWORK_LABELS[network] ?? network.toUpperCase();
}

export function ProxyCard({ proxy, onEdit, onDelete }: ProxyCardProps) {
  const { t } = useTranslation();

  const network = networkLabel(proxy);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: proxy.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      className="p-4 rounded-lg border mb-3"
      style={{
        ...style,
        backgroundColor: 'var(--bg-primary)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex items-center gap-3">
        <button
          className="cursor-grab active:cursor-grabbing"
          style={{ color: 'var(--text-secondary)' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="font-medium text-sm truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {proxy.name}
            </h3>
            {/* Beside the name rather than in the line below it: the transport is
                the thing you scan a list of nodes for, and the line below is
                where the address lives — long, and the first thing to be
                truncated on a narrow pane. `shrink-0` keeps the tag whole while
                the name gives way. */}
            {network && (
              <span
                className="shrink-0 px-2 py-0.5 text-xs font-medium rounded"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                }}
                title={t('proxy.transport')}
              >
                {network}
              </span>
            )}
          </div>
          <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
            {getProtocolDisplayName(proxy.type)}
            {proxy.server ? ` · ${proxy.server}:${proxy.port}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {/* The card itself gets no hover transform: dnd-kit owns this row's
              transform while it is being dragged, and two writers of the same
              property is a fight neither wins. The buttons are outside that
              arrangement, so they can move. */}
          <motion.button
            onClick={onEdit}
            className="p-2 rounded"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
            aria-label={t('proxy.edit')}
            title={t('proxy.edit')}
            whileHover={{ scale: 1.1, opacity: 0.85 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <Edit size={16} />
          </motion.button>
          <motion.button
            onClick={onDelete}
            className="p-2 rounded"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: '#ef4444',
            }}
            aria-label={t('proxy.delete')}
            title={t('proxy.delete')}
            whileHover={{ scale: 1.1, opacity: 0.85 }}
            whileTap={{ scale: 0.92 }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <Trash2 size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
