import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  AlertTriangle,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ListRow } from '../../animation/ListRow';
import * as anim from '../../animation/tokens';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { GeositeSelectField } from '../form/fields/GeositeSelectField';
import { useServerStore } from '../../store/serverStore';
import { generateId } from '../../core/ir/factory';
import { RULE_TYPE_HINTS } from '../../schemas/modules/rules';
import { BUILT_IN_OUTBOUNDS } from '../../core/ir/references';
import {
  SERVER_RULE_TYPES,
  type ServerRuleIR,
} from '../../core/server/types';

// Rule types that resolve an IP and therefore accept no-resolve (official
// additional parameter).
const NO_RESOLVE_TYPES = new Set([
  'IP-CIDR',
  'IP-CIDR6',
  'IP-SUFFIX',
  'IP-ASN',
  'GEOIP',
]);

// MATCH is a pure fallback: no payload, and it only makes sense last.
const PAYLOADLESS_TYPES = new Set(['MATCH']);

// Same colour families as the client rule list, so a rule reads the same way
// in either editor: domain rules blue, IP rules green, site collections
// purple, the catch-all orange.
function getTypeBadgeClass(type: string): string {
  const baseClass = 'px-2 py-0.5 text-xs font-medium rounded shrink-0';
  if (type.startsWith('DOMAIN')) return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
  if (type === 'IP-CIDR' || type === 'IP-CIDR6' || type === 'SRC-IP-CIDR' || type === 'GEOIP')
    return `${baseClass} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`;
  if (type === 'GEOSITE') return `${baseClass} bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`;
  if (type === 'MATCH') return `${baseClass} bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300`;
  return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300`;
}

function getTargetBadgeClass(target: string, missing: boolean): string {
  const baseClass = 'px-2 py-0.5 text-xs font-medium rounded shrink-0';
  // A target naming nothing on the Outbound tab outranks the usual colour:
  // mihomo will not start with a rule pointing into the void.
  if (missing) return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
  if (target === 'DIRECT') return `${baseClass} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300`;
  if (target === 'REJECT') return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300`;
  return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`;
}

// One row on its way out animates with a transform, and a transform on an
// ancestor is what fixed positioning resolves against — dialogs are therefore
// owned by the list, never by a row.
function SortableRuleCard({
  rule,
  onDelete,
  onEdit,
}: {
  rule: ServerRuleIR;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const outbounds = useServerStore((s) => s.config.outbounds ?? []);
  const knownTargets = new Set([
    ...BUILT_IN_OUTBOUNDS,
    ...outbounds.map((o) => o.name.trim()).filter(Boolean),
  ]);
  const targetMissing = !knownTargets.has(rule.target);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
          aria-label={t('server.list.dragHandle')}
        >
          <GripVertical className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={getTypeBadgeClass(rule.type)}>{rule.type}</span>
            <span
              className={getTargetBadgeClass(rule.target, targetMissing)}
              title={
                targetMissing
                  ? t('server.rule.danglingTarget', { name: rule.target })
                  : undefined
              }
            >
              {targetMissing && (
                <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />
              )}
              {rule.target || <span className="italic">?</span>}
            </span>
            {rule.noResolve && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                no-resolve
              </span>
            )}
          </div>
          {/* MATCH takes no payload, so the row explains its role instead. */}
          {PAYLOADLESS_TYPES.has(rule.type) ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('server.rule.matchHint')}
            </div>
          ) : (
            <div className="text-sm truncate font-mono text-gray-700 dark:text-gray-300">
              {rule.payload || (
                <span className="text-gray-400 italic">{t('server.rule.noPayload')}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={onEdit}
            className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label={t('common.edit')}
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
            aria-label={t('common.delete')}
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

interface RuleDraft {
  id?: string;
  type: string;
  // GEOSITE holds several categories while the form is open (the client's
  // picker semantics); every other type keeps a plain string.
  payload: string | string[];
  target: string;
  noResolve?: boolean;
}

// The synthetic schema the geosite picker reads its label from — it renders
// its own field shell, unlike the raw payload input. Same label/description
// keys as the client editor's geosite field.
const GEOSITE_PAYLOAD_FIELD = {
  fieldKey: 'payload',
  label: 'rule.geosite.label',
  type: 'geosite-select',
  required: true,
  description: 'rule.geosite.description',
} as const;

function toCategories(payload: RuleDraft['payload']): string[] {
  return (Array.isArray(payload) ? payload : [payload])
    .map((entry) => (entry ?? '').trim())
    .filter((entry) => entry !== '');
}

// The whole form lives in one component seeded from `draft`. The parent keys
// it by rule id, so opening a different rule rebuilds it from scratch while
// typing inside one open never fights a re-seed.
function RuleFormFields({
  draft,
  onChange,
}: {
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
}) {
  const { t } = useTranslation();
  const outbounds = useServerStore((s) => s.config.outbounds ?? []);
  const local = draft;

  // Targets resolve built-in policies first, then Outbound-tab names — the
  // same order mihomo does. A stored target nothing defines stays visible
  // rather than silently switching, and the save guard blocks it.
  const targetItems = [
    ...BUILT_IN_OUTBOUNDS.map((name) => ({ value: name, label: name })),
    ...outbounds
      .filter((o) => o.name.trim())
      .map((o) => ({ value: o.name.trim(), label: o.name.trim() })),
  ];

  const hint = RULE_TYPE_HINTS[local.type];
  const hasPayload = !PAYLOADLESS_TYPES.has(local.type);
  const isGeosite = local.type === 'GEOSITE';
  const inputStyle = {
    backgroundColor: 'var(--bg-primary)',
    borderColor: 'var(--border-color)',
    color: 'var(--text-primary)',
  };

  const changeType = (nextType: string) => {
    // Leaving GEOSITE collapses a multi-selection so the single-value input
    // for the new type isn't handed an array.
    let payload = local.payload;
    if (local.type === 'GEOSITE' && nextType !== 'GEOSITE') {
      payload = Array.isArray(local.payload) ? local.payload[0] ?? '' : local.payload;
    }
    onChange({ ...local, type: nextType, payload });
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="server-rule-type"
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('server.rule.type')}
        </label>
        <Select
          id="server-rule-type"
          value={local.type}
          onChange={(value) => changeType(String(value))}
          items={SERVER_RULE_TYPES.map((type) => ({ value: type, label: type }))}
        />
      </div>

      {hasPayload && isGeosite && (
        // Same picker the client rules editor uses: searchable dropdown over
        // the live geosite database. Several categories may be picked; saving
        // fans them out into one rule per category.
        <GeositeSelectField
          field={GEOSITE_PAYLOAD_FIELD}
          value={local.payload}
          onChange={(categories) => onChange({ ...local, payload: categories })}
        />
      )}

      {hasPayload && !isGeosite && (
        <div>
          <label
            htmlFor="server-rule-payload"
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {t('server.rule.payload')}
          </label>
          <input
            id="server-rule-payload"
            type="text"
            value={Array.isArray(local.payload) ? local.payload[0] ?? '' : local.payload}
            onChange={(e) => onChange({ ...local, payload: e.target.value })}
            placeholder={hint?.placeholder ?? t('server.rule.payloadPlaceholder')}
            pattern={hint?.pattern}
            title={hint ? t(hint.descriptionKey) : undefined}
            spellCheck={false}
            className="w-full px-3 py-2 rounded-md border text-sm font-mono"
            style={inputStyle}
          />
          {hint && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {t(hint.descriptionKey)}
            </p>
          )}
        </div>
      )}

      <div>
        <label
          htmlFor="server-rule-target"
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          {t('server.rule.target')}
        </label>
        <Select
          id="server-rule-target"
          value={local.target}
          onChange={(value) => onChange({ ...local, target: String(value) })}
          items={
            targetItems.some((item) => item.value === local.target)
              ? targetItems
              : [...targetItems, { value: local.target, label: local.target }]
          }
        />
      </div>

      {NO_RESOLVE_TYPES.has(local.type) && (
        <label
          className="flex items-center gap-2 text-sm cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <input
            type="checkbox"
            checked={local.noResolve ?? false}
            onChange={(e) => onChange({ ...local, noResolve: e.target.checked })}
          />
          no-resolve
        </label>
      )}
    </div>
  );
}

function ServerRuleEditModal({
  isOpen,
  onClose,
  draft,
  onDraftChange,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  draft: RuleDraft | null;
  onDraftChange: (draft: RuleDraft) => void;
  onSave: (draft: RuleDraft) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  if (!draft && !isOpen) return null;

  const handleSave = () => {
    if (!draft) return;
    if (!draft.target.trim()) {
      setError(t('server.rule.validation.targetRequired'));
      return;
    }
    if (toCategories(draft.payload).length === 0 && !PAYLOADLESS_TYPES.has(draft.type)) {
      setError(t('server.rule.validation.payloadRequired'));
      return;
    }
    setError('');
    onSave({
      ...draft,
      payload: Array.isArray(draft.payload)
        ? draft.payload.map((entry) => entry.trim())
        : draft.payload.trim(),
      target: draft.target.trim(),
    });
  };

  return (
    <Modal
      isOpen={isOpen && draft !== null}
      onClose={() => {
        setError('');
        onClose();
      }}
      title={draft?.id ? t('server.rule.edit') : t('server.rule.add')}
      widthClass="max-w-xl"
      footer={
        <>
          <CancelButton
            onClick={() => {
              setError('');
              onClose();
            }}
          >
            {t('common.cancel')}
          </CancelButton>
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
        </>
      }
    >
      {draft && (
        <>
          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-md bg-red-500 bg-opacity-10 text-red-500 text-sm"
            >
              {error}
            </div>
          )}
          <RuleFormFields key={draft.id ?? 'new'} draft={draft} onChange={onDraftChange} />
          {/* Only a GEOSITE selection can hold more than one payload — same
              receipt as the client's edit modal. */}
          {toCategories(draft.payload).length > 1 && (
            <p className="mt-3 text-sm" style={{ color: 'var(--accent)' }}>
              {t('rule.geosite.expand', { total: toCategories(draft.payload).length })}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}


export function RuleTab() {
  const { t } = useTranslation();
  const rules = useServerStore((s) => s.config.rules ?? []);
  const addRule = useServerStore((s) => s.addRule);
  const removeRule = useServerStore((s) => s.removeRule);
  const updateRuleField = useServerStore((s) => s.updateRuleField);
  const insertRulesAfter = useServerStore((s) => s.insertRulesAfter);
  const reorderRules = useServerStore((s) => s.reorderRules);

  // The create/edit form lives in one dialog: `draft` carries what it edits,
  // null when nothing is open.
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDelete = pendingDeleteId
    ? rules.find((r) => r.id === pendingDeleteId) ?? null
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rules.findIndex((r) => r.id === active.id);
    const newIndex = rules.findIndex((r) => r.id === over.id);
    reorderRules(arrayMove(rules, oldIndex, newIndex).map((r) => r.id));
  };

  const handleCreate = () => {
    setDraft({ type: 'DOMAIN-SUFFIX', payload: '', target: 'DIRECT' });
  };

  const handleSave = (next: RuleDraft) => {
    // A GEOSITE selection with several categories fans out into one rule per
    // category — the edited rule keeps its position, extras land right after
    // it so match order stays where the user put it.
    const categories = Array.isArray(next.payload)
      ? next.payload.filter((entry) => entry !== '')
      : [next.payload];

    if (next.id) {
      updateRuleField(next.id, 'type', next.type);
      updateRuleField(next.id, 'payload', categories[0] ?? '');
      updateRuleField(next.id, 'target', next.target);
      updateRuleField(next.id, 'noResolve', next.noResolve ?? false);
      insertExtrasAfter(next.id, next, categories.slice(1));
    } else {
      const id = addRule();
      updateRuleField(id, 'type', next.type);
      updateRuleField(id, 'payload', categories[0] ?? '');
      updateRuleField(id, 'target', next.target);
      updateRuleField(id, 'noResolve', next.noResolve ?? false);
      insertExtrasAfter(id, next, categories.slice(1));
    }
    setDraft(null);
  };

  // Builds the extra rules a multi-category GEOSITE save needs and inserts
  // them after `anchorId`.
  const insertExtrasAfter = (anchorId: string, source: RuleDraft, payloads: string[]) => {
    if (payloads.length === 0) return;
    insertRulesAfter(
      anchorId,
      payloads.map((payload) => ({
        id: generateId(),
        type: source.type,
        payload,
        target: source.target,
        noResolve: source.noResolve ?? false,
      }))
    );
  };

  return (
    <div className="p-6 overflow-y-auto h-full space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {t('server.rule.title')}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('server.rule.description')}
          </p>
        </div>
        <motion.button
          type="button"
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white shrink-0"
          style={{ backgroundColor: 'var(--accent)' }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Plus size={16} />
          {t('server.rule.add')}
        </motion.button>
      </div>

      {rules.length === 0 && (
        <div
          className="text-center py-12 rounded-lg border-2 border-dashed"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('server.rule.empty')}
          </p>
        </div>
      )}

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
                      onEdit={() =>
                        setDraft({
                          id: rule.id,
                          type: rule.type,
                          payload: rule.payload,
                          target: rule.target,
                          noResolve: rule.noResolve,
                        })
                      }
                      onDelete={() => setPendingDeleteId(rule.id)}
                    />
                  </ListRow>
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ServerRuleEditModal
        isOpen={draft !== null}
        onClose={() => setDraft(null)}
        draft={draft}
        onDraftChange={setDraft}
        onSave={handleSave}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t('server.rule.deleteTitle')}
        message={
          pendingDelete
            ? `${pendingDelete.type}${pendingDelete.payload ? `,${pendingDelete.payload}` : ''} → ${pendingDelete.target}`
            : ''
        }
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (pendingDelete) removeRule(pendingDelete.id);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
