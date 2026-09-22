import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, GripVertical, Lock, AlertTriangle } from 'lucide-react';
import { ListRow } from '../../animation/ListRow';
import * as anim from '../../animation/tokens';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useIRStore } from '../../store/irStore';
import { RuleEditModal } from './RuleEditModal';
import { isMatchRule } from '../../core/ir/rules';
import { policyResolves, ruleSetResolves } from '../../core/ir/references';
import type { Rule } from '../../core/ir/types';
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

// `pinned` marks the MATCH rule, which the store keeps at the end of the list.
// Disabling the sortable both takes away its drag handle and stops it acting as
// a drop target, so nothing can be dropped below it either.
//
// Deleting is asked about by the list rather than here: a row on its way out
// animates with a `scale`, and a transform on an ancestor is what a fixed
// position resolves against — a dialog owned by the row would slide with it.
function SortableRuleCard({
  rule,
  pinned,
  onDelete,
}: {
  rule: Rule;
  pinned: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  // Both ends of what this rule points at. Read here rather than passed down,
  // because a row is the only place with room to explain which end is broken.
  const proxies = useIRStore((state) => state.ir.proxies);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);
  const ruleProviders = useIRStore((state) => state.ir.ruleProviders);

  const policyMissing = !policyResolves(proxies, proxyGroups, rule.policy);
  const providerMissing = !ruleSetResolves(ruleProviders, rule);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id, disabled: pinned });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Type badge styling
  const getTypeBadgeClass = (type: string) => {
    const baseClass = 'px-2 py-0.5 text-xs font-medium rounded';
    switch (type) {
      case 'DOMAIN':
      case 'DOMAIN-SUFFIX':
      case 'DOMAIN-KEYWORD':
        return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
      case 'IP-CIDR':
      case 'IP-CIDR6':
      case 'GEOIP':
        return `${baseClass} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`;
      case 'GEOSITE':
      case 'RULE-SET':
        return `${baseClass} bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`;
      case 'MATCH':
        return `${baseClass} bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300`;
      default:
        return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300`;
    }
  };

  const getPolicyBadgeClass = (policy: string) => {
    const baseClass = 'px-2 py-0.5 text-xs font-medium rounded';
    // A policy naming something the config no longer has outranks the usual
    // colour: the rule looks ordinary otherwise, and mihomo will not start.
    if (policyMissing) {
      return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
    }
    if (policy === 'DIRECT') {
      return `${baseClass} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`;
    } else if (policy === 'REJECT') {
      return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
    } else {
      return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-3">
          {/* Drag handle, or a lock for the rule that cannot move */}
          {pinned ? (
            <span
              className="text-gray-400 dark:text-gray-500 cursor-not-allowed"
              title={t('rule.matchPinned')}
            >
              <Lock className="w-5 h-5" />
            </span>
          ) : (
            <button
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-5 h-5" />
            </button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={getTypeBadgeClass(rule.type)}>{rule.type}</span>
              <span
                className={getPolicyBadgeClass(rule.policy)}
                title={
                  policyMissing
                    ? t('rule.dangling.policy', { name: rule.policy })
                    : undefined
                }
              >
                {policyMissing && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />}
                {rule.policy}
              </span>
              {rule['no-resolve'] && (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                  no-resolve
                </span>
              )}
            </div>
            {/* MATCH takes no payload, so the row explains its role instead. */}
            {pinned ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {t('rule.matchHint')}
              </div>
            ) : (
              <div
                className={`text-sm truncate font-mono ${
                  providerMissing
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
                title={
                  providerMissing
                    ? t('rule.dangling.provider', { name: rule.payload })
                    : undefined
                }
              >
                {providerMissing && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                {rule.payload || <span className="text-gray-400 italic">{t('rule.noPayload')}</span>}
              </div>
            )}
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

      <RuleEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        rule={rule}
      />
    </>
  );
}

export function RuleList() {
  const { t } = useTranslation();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const rules = useIRStore((state) => state.ir.rules);
  const removeRule = useIRStore((state) => state.removeRule);
  const reorderRules = useIRStore((state) => state.reorderRules);
  // One dialog for the whole list: only a single deletion can be pending at a
  // time, so the id being asked about lives here rather than in every row.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const confirmDelete = () => {
    if (pendingDelete) removeRule(pendingDelete);
    setPendingDelete(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = rules.findIndex((r) => r.id === active.id);
      const newIndex = rules.findIndex((r) => r.id === over.id);
      // No clamping needed: MATCH is disabled as a drop target, so `over` is
      // always a movable rule and the move lands above it. The store re-pins it
      // regardless, which covers any drag the UI did not anticipate.
      const newOrder = arrayMove(rules, oldIndex, newIndex);
      reorderRules(newOrder);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('rule.title')}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('rule.description')}
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
          {t('rule.add')}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {rules.length === 0 && (
          <motion.div
            key="empty"
            className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <p className="text-gray-500 dark:text-gray-400">
              {t('rule.empty')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {rules.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rules.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {rules.map((rule) => (
                  <ListRow key={rule.id}>
                    <SortableRuleCard
                      rule={rule}
                      pinned={isMatchRule(rule)}
                      onDelete={() => setPendingDelete(rule.id)}
                    />
                  </ListRow>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      <RuleEditModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t('rule.deleteTitle')}
        message={t('rule.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
