import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Edit2, Trash2, GripVertical, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ListRow } from '../../animation/ListRow';
import * as anim from '../../animation/tokens';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { referenceWarning } from '../common/referenceWarning';
import { useIRStore } from '../../store/irStore';
import { RuleProviderEditModal } from './RuleProviderEditModal';
import { dependentsOfProvider, nameResolvesIn } from '../../core/ir';
import type { RuleProvider } from '../../core/ir';
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

const badge = 'px-2 py-0.5 text-xs font-medium rounded';

function typeBadgeClass(type: RuleProvider['type']) {
  switch (type) {
    case 'http':
      return `${badge} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
    case 'file':
      return `${badge} bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`;
    default:
      return `${badge} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`;
  }
}

function SortableProviderCard({
  name,
  provider,
  proxyMissing,
  onEdit,
  onDelete,
}: {
  name: string;
  provider: RuleProvider;
  // The proxy this downloads through names nothing in the config any more.
  proxyMissing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const source =
    provider.type === 'http'
      ? provider.url
      : provider.type === 'file'
      ? provider.path
      : t('ruleProvider.inlineRules', { count: provider.payload?.length || 0 });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center gap-3">
        <button
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {name}
            </span>
            <span className={typeBadgeClass(provider.type)}>
              {provider.type.toUpperCase()}
            </span>
            <span className={`${badge} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`}>
              {provider.behavior}
            </span>
            {provider.format && (
              <span className={`${badge} bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300`}>
                {provider.format}
              </span>
            )}
            {provider.proxy && (
              <span
                className={
                  proxyMissing
                    ? `${badge} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`
                    : `${badge} bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300`
                }
                title={
                  proxyMissing
                    ? t('common.nameMissing', { name: provider.proxy })
                    : undefined
                }
              >
                {proxyMissing && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                via {provider.proxy}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 truncate font-mono">
            {source}
          </div>
          {provider.interval !== undefined && (
            <div className="text-xs text-gray-400 mt-0.5">{provider.interval}s</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={onEdit}
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
  );
}

export function RuleProviderList() {
  const { t } = useTranslation();
  const ruleProviders = useIRStore((state) => state.ir.ruleProviders);
  const updateRuleProviders = useIRStore((state) => state.updateRuleProviders);
  // Read to answer two questions the list has to show: which rules a delete
  // would break, and whether the proxy a provider downloads through still
  // exists.
  const rules = useIRStore((state) => state.ir.rules);
  const proxies = useIRStore((state) => state.ir.proxies);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);

  const [editingProvider, setEditingProvider] = useState<{
    name: string;
    provider: RuleProvider;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Providers are keyed by name, so the name is the pending deletion's identity
  // as well as the thing the dialog quotes back.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const names = Object.keys(ruleProviders || {});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Providers are a YAML mapping, so their order is just object key order.
  // Reordering rebuilds the object with the keys inserted in the new sequence.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = names.indexOf(active.id as string);
    const newIndex = names.indexOf(over.id as string);
    const newNames = arrayMove(names, oldIndex, newIndex);

    const reordered: Record<string, RuleProvider> = {};
    newNames.forEach((n) => {
      reordered[n] = ruleProviders[n];
    });
    updateRuleProviders(reordered);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      const next = { ...ruleProviders };
      delete next[pendingDelete];
      updateRuleProviders(next);
    }
    setPendingDelete(null);
  };

  const pendingWarning = referenceWarning(t, {
    rules: pendingDelete ? dependentsOfProvider(rules, pendingDelete).length : 0,
  });

  const handleSave = (name: string, provider: RuleProvider) => {
    updateRuleProviders({ ...ruleProviders, [name]: provider });
    setEditingProvider(null);
    setIsCreating(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('ruleProvider.title')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('ruleProvider.description')}
          </p>
        </div>
        <motion.button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Plus className="w-4 h-4" />
          {t('ruleProvider.add')}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {names.length === 0 && (
          <motion.div
            key="empty"
            className="text-center py-10 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <p className="text-gray-500 dark:text-gray-400">{t('ruleProvider.empty')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {names.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={names} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {names.map((name) => (
                  <ListRow key={name}>
                    <SortableProviderCard
                      name={name}
                      provider={ruleProviders[name]}
                      proxyMissing={
                        !!ruleProviders[name].proxy &&
                        ruleProviders[name].proxy !== 'DIRECT' &&
                        !nameResolvesIn(proxies, proxyGroups, ruleProviders[name].proxy!)
                      }
                      onEdit={() =>
                        setEditingProvider({ name, provider: ruleProviders[name] })
                      }
                      onDelete={() => setPendingDelete(name)}
                    />
                  </ListRow>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isCreating && (
        <RuleProviderEditModal onClose={() => setIsCreating(false)} onSave={handleSave} />
      )}

      {editingProvider && (
        <RuleProviderEditModal
          name={editingProvider.name}
          provider={editingProvider.provider}
          onClose={() => setEditingProvider(null)}
          onSave={handleSave}
        />
      )}

      {/* The fallback name is never seen. Once `pendingDelete` clears, `isOpen`
          is false and the dialog renders nothing new — AnimatePresence fades out
          the element it last rendered, which still carries the real name. */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t('ruleProvider.deleteTitle')}
        message={
          <>
            {t('ruleProvider.deleteConfirm', { name: pendingDelete ?? '' })}
            {/* RULE-SET rules are left alone rather than deleted with the
                provider — a rule carries a payload and a policy the user wrote,
                where a group member entry carries only a name. So the dialog
                says what will be left broken, and the rule list marks it. */}
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
