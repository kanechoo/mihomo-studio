import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useServerStore } from '../../store/serverStore';
import { ListenerCard } from './ListenerCard';
import { ListenerShareModal } from './ListenerShareModal';
import { ProtocolPickerModal } from './ProtocolPickerModal';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ListenerListTabProps {
  problemsByListener: Map<string, number>;
  editingId: string | null;
  onEdit: (id: string | null) => void;
}

export function ListenerListTab({
  problemsByListener,
  editingId,
  onEdit,
}: ListenerListTabProps) {
  const { t } = useTranslation();
  const listeners = useServerStore((state) => state.config.listeners);
  const servers = useServerStore((state) => state.config.servers ?? []);
  const addListener = useServerStore((state) => state.addListener);
  const duplicateListener = useServerStore((state) => state.duplicateListener);
  const removeListener = useServerStore((state) => state.removeListener);
  const reorderListeners = useServerStore((state) => state.reorderListeners);
  const toggleEnabled = useServerStore((state) => state.toggleEnabled);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Which listener's share modal is open; the icon on its card is disabled
  // until the document names at least one Server address and the listener
  // itself passes validation — a link to something broken helps nobody.
  const [sharingId, setSharingId] = useState<string | null>(null);
  // `find` yields `undefined` — not null — when nothing is pending, and the
  // dialog below opens on `!== null`; normalising here keeps the empty case
  // closed. (This really did pop the confirm on every visit to the tab.)
  const pendingDelete = pendingDeleteId
    ? listeners.find((l) => l.id === pendingDeleteId) ?? null
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = listeners.findIndex((l) => l.id === active.id);
    const newIndex = listeners.findIndex((l) => l.id === over.id);
    reorderListeners(arrayMove(listeners, oldIndex, newIndex).map((l) => l.id));
  };

  return (
    <div className="p-4 overflow-y-auto h-full">
      {/* Right-aligned, matching where the add buttons sit on the other tabs. */}
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Plus size={14} />
          {t('server.list.add')}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={listeners.map((l) => l.id)}
          strategy={verticalListSortingStrategy}
        >
          {listeners.map((listener) => {
            const errorCount = problemsByListener.get(listener.id) ?? 0;
            const shareBlockedReason =
              servers.length === 0
                ? t('server.share.needsServer')
                : errorCount > 0
                  ? t('server.share.hasErrors')
                  : undefined;
            return (
              <ListenerCard
                key={listener.id}
                listener={listener}
                errorCount={errorCount}
                shareBlockedReason={shareBlockedReason}
                onEdit={() => onEdit(listener.id)}
                onDuplicate={() => void duplicateListener(listener.id)}
                onDelete={() => setPendingDeleteId(listener.id)}
                onToggle={() => toggleEnabled(listener.id)}
                onShare={() => setSharingId(listener.id)}
              />
            );
          })}
        </SortableContext>
      </DndContext>

      {listeners.length === 0 && (
        <p className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('server.list.empty')}
        </p>
      )}

      <ProtocolPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(kind, version) => {
          const id = addListener(kind, version);
          setPickerOpen(false);
          onEdit(id);
        }}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) removeListener(pendingDeleteId);
          if (editingId === pendingDeleteId) onEdit(null);
          setPendingDeleteId(null);
        }}
        title={t('server.list.deleteTitle')}
        message={t('server.list.deleteMessage', {
          name: pendingDelete?.name ?? '',
        })}
      />

      {sharingId !== null &&
        (() => {
          const sharing = listeners.find((l) => l.id === sharingId);
          if (!sharing) return null;
          return <ListenerShareModal listener={sharing} onClose={() => setSharingId(null)} />;
        })()}
    </div>
  );
}
