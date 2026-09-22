import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { Copy, Trash2, GripVertical, AlertTriangle, CheckCircle2, Link as LinkIcon } from 'lucide-react';
import { Toggle } from '../common/Toggle';
import type { ListenerIR } from '../../core/server/types';

interface ListenerCardProps {
  listener: ListenerIR;
  errorCount: number;
  /** Why sharing is blocked right now; undefined when it is allowed. */
  shareBlockedReason?: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onShare: () => void;
}

export function ListenerCard({
  listener,
  errorCount,
  shareBlockedReason,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
  onShare,
}: ListenerCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: listener.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        borderColor: errorCount > 0 ? 'var(--accent-danger, #ef4444)' : 'var(--border-color)',
        backgroundColor: listener.enabled ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
      }}
      className="p-5 rounded-md border mb-2"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="cursor-grab touch-none p-1"
          style={{ color: 'var(--text-secondary)' }}
          aria-label={t('server.list.dragHandle')}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} />
        </button>

        <Toggle
          checked={listener.enabled}
          onChange={onToggle}
          aria-label={t('server.list.toggleEnabled')}
        />

        <button
          type="button"
          onClick={onEdit}
          className="flex-1 min-w-0 text-left"
        >
          <span
            className="block text-sm font-medium truncate"
            style={{ color: listener.enabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {listener.name}
            <span className="ml-2 text-xs font-mono" style={{ color: 'var(--accent)' }}>
              {listener.type}
              {listener.tuicVersion ?? ''}
            </span>
          </span>
          <span className="block text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
            {listener.listen}
            {listener.port ? `:${listener.port}` : ''}
          </span>
        </button>

        {errorCount > 0 ? (
          <span
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
            style={{ color: '#ef4444' }}
            title={t('server.list.errorBadge', { count: errorCount })}
          >
            <AlertTriangle size={16} />
            {errorCount}
          </span>
        ) : (
          <CheckCircle2 size={18} style={{ color: 'var(--accent)' }} />
        )}

        {/* Sharing lives here rather than inside the editor: a link is
            something you hand out once a listener works, not another form
            field to fill in while you are still editing it. */}
        <button
          type="button"
          onClick={onShare}
          disabled={shareBlockedReason !== undefined}
          aria-label={t('server.list.share')}
          title={shareBlockedReason ?? t('server.list.share')}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: shareBlockedReason === undefined ? 'var(--accent)' : 'var(--text-secondary)' }}
        >
          <LinkIcon size={17} />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          aria-label={t('server.list.duplicate')}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Copy size={17} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)]"
          style={{ color: '#ef4444' }}
        >
          <Trash2 size={17} />
        </button>
      </div>
    </div>
  );
}
