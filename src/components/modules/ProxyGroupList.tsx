import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import { ListRow } from '../../animation/ListRow';
import * as anim from '../../animation/tokens';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { referenceWarning } from '../common/referenceWarning';
import { useIRStore } from '../../store/irStore';
import { ProxyGroupEditModal } from './ProxyGroupEditModal';
import { dependentsOfOutbound, nameResolvesIn } from '../../core/ir';
import type { ProxyGroup } from '../../core/ir/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Deleting is asked about by the list rather than here: a row on its way out
// animates with a `scale`, and a transform on an ancestor is what a fixed
// position resolves against — a dialog owned by the row would slide with it.
function SortableProxyGroupCard({
  group,
  onDelete,
}: {
  group: ProxyGroup;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Type badge styling
  const getTypeBadgeClass = (type: string) => {
    const baseClass = 'px-2 py-0.5 text-xs font-medium rounded-full';
    switch (type) {
      case 'select':
        return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
      case 'url-test':
        return `${baseClass} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`;
      case 'fallback':
        return `${baseClass} bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300`;
      case 'load-balance':
        return `${baseClass} bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`;
      case 'relay':
        return `${baseClass} bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300`;
      default:
        return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300`;
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
      >
        <div className="flex items-start gap-3">
          {/* Drag handle */}
          <button
            className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {group.name}
              </h3>
              <span className={getTypeBadgeClass(group.type)}>
                {t(`proxyGroup.type.${group.type}`)}
              </span>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {group.config.proxies && group.config.proxies.length > 0 && (
                <div>
                  <span className="font-medium">{t('proxyGroup.proxies')}:</span>{' '}
                  {group.config.proxies.join(', ')}
                </div>
              )}
              {/* Without this, a group backed entirely by a subscription would
                  show a name, a type and nothing else — reading as a group
                  with no members, which is the one state mihomo refuses. */}
              {group.config.use && group.config.use.length > 0 && (
                <div>
                  <span className="font-medium">{t('proxyGroup.use.label')}:</span>{' '}
                  {group.config.use.join(', ')}
                </div>
              )}
              {group.config.url && (
                <div>
                  <span className="font-medium">{t('proxyGroup.testUrl')}:</span>{' '}
                  {group.config.url}
                </div>
              )}
              {group.config.interval && (
                <div>
                  <span className="font-medium">{t('proxyGroup.interval')}:</span>{' '}
                  {group.config.interval}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setIsEditModalOpen(true)}
              className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('common.edit')}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
            >
              <Edit2 className="w-4 h-4" />
            </motion.button>
            <motion.button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={t('common.delete')}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
            >
              <Trash2 className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </div>

      <ProxyGroupEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        group={group}
      />
    </>
  );
}

export function ProxyGroupList() {
  const { t } = useTranslation();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);
  const removeProxyGroup = useIRStore((state) => state.removeProxyGroup);
  const reorderProxyGroups = useIRStore((state) => state.reorderProxyGroups);
  // Read only to work out what a delete would leave dangling.
  const proxies = useIRStore((state) => state.ir.proxies);
  const rules = useIRStore((state) => state.ir.rules);
  const ruleProviders = useIRStore((state) => state.ir.ruleProviders);
  const proxyProviders = useIRStore((state) => state.ir.proxyProviders);
  // One dialog for the whole list: only a single deletion can be pending at a
  // time, so the id being asked about lives here rather than in every row.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const confirmDelete = () => {
    if (pendingDelete) removeProxyGroup(pendingDelete);
    setPendingDelete(null);
  };

  // What deleting the pending group would leave pointing at a name that is
  // gone. Other groups' member lists are not counted — the store drops those
  // with the group itself — and nothing is counted when a proxy or another
  // group answers to the same name, since then the name still resolves.
  const pendingWarning = (() => {
    const group = proxyGroups.find((g) => g.id === pendingDelete);
    if (!group) return '';
    const remaining = proxyGroups.filter((g) => g.id !== group.id);
    if (nameResolvesIn(proxies, remaining, group.name)) return '';

    const dangling = dependentsOfOutbound(rules, ruleProviders, group.name, proxyProviders);
    return referenceWarning(t, {
      rules: dangling.rules.length,
      providers: dangling.providers.length,
      proxyProviders: dangling.proxyProviders.length,
    });
  })();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = proxyGroups.findIndex((g) => g.id === active.id);
      const newIndex = proxyGroups.findIndex((g) => g.id === over.id);
      const newOrder = arrayMove(proxyGroups, oldIndex, newIndex);
      reorderProxyGroups(newOrder);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('proxyGroup.title')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('proxyGroup.description')}
          </p>
        </div>
        <motion.button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Plus className="w-4 h-4" />
          {t('proxyGroup.add')}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {proxyGroups.length === 0 && (
          <motion.div
            key="empty"
            className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <p className="text-gray-500 dark:text-gray-400">
              {t('proxyGroup.empty')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {proxyGroups.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={proxyGroups.map((g) => g.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {proxyGroups.map((group) => (
                  <ListRow key={group.id}>
                    <SortableProxyGroupCard
                      group={group}
                      onDelete={() => setPendingDelete(group.id)}
                    />
                  </ListRow>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ProxyGroupEditModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t('proxyGroup.deleteTitle')}
        message={
          <>
            {t('proxyGroup.deleteConfirm')}
            {pendingWarning && (
              <span className="block mt-2 text-amber-600 dark:text-amber-400">
                {pendingWarning}
              </span>
            )}
          </>
        }
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
