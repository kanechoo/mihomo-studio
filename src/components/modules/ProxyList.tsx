import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Upload, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ListRow } from '../../animation/ListRow';
import * as anim from '../../animation/tokens';
import { Select } from '../common/Select';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { referenceWarning } from '../common/referenceWarning';
import { useIRStore } from '../../store/irStore';
import { getProtocolDisplayName } from '../../data/protocols';
import {
  createDefaultProxyByType,
  dependentsOfOutbound,
  nameResolvesIn,
} from '../../core/ir';
import { getAvailableProtocols } from '../../schemas/modules/proxies';
import { ProxyCard } from './ProxyCard';
import { ProxyEditModal } from './ProxyEditModal';
import { ImportModal } from './ImportModal';
import { SubscriptionModal } from './SubscriptionModal';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export function ProxyList() {
  const { t } = useTranslation();
  const proxies = useIRStore((state) => state.ir.proxies);
  const addProxy = useIRStore((state) => state.addProxy);
  const removeProxy = useIRStore((state) => state.removeProxy);
  const reorderProxies = useIRStore((state) => state.reorderProxies);
  // Read only to work out what a delete would leave dangling.
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);
  const rules = useIRStore((state) => state.ir.rules);
  const ruleProviders = useIRStore((state) => state.ir.ruleProviders);
  const proxyProviders = useIRStore((state) => state.ir.proxyProviders);

  const [editingProxyId, setEditingProxyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<string>('vless');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  // One dialog for the whole list rather than one per row: only a single
  // deletion can be pending at a time, so the id being asked about lives here.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const availableProtocols = getAvailableProtocols();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = proxies.findIndex((p) => p.id === active.id);
      const newIndex = proxies.findIndex((p) => p.id === over.id);
      const newOrder = arrayMove(proxies, oldIndex, newIndex);
      reorderProxies(newOrder);
    }
  };

  const handleAdd = () => {
    setIsCreating(true);
  };

  const handleCreate = () => {
    const newProxy = createDefaultProxyByType(selectedProtocol);
    addProxy(newProxy);
    setIsCreating(false);
    setEditingProxyId(newProxy.id);
  };

  const confirmDelete = () => {
    if (pendingDelete) removeProxy(pendingDelete);
    setPendingDelete(null);
  };

  // What deleting the pending node would leave pointing at a name that is gone.
  //
  // Group membership is not counted: the store drops those references with the
  // node itself. Nor is anything counted when a second node or a group answers
  // to the same name, since then the name still resolves and nothing breaks.
  const pendingWarning = (() => {
    const proxy = proxies.find((p) => p.id === pendingDelete);
    if (!proxy) return '';
    const remaining = proxies.filter((p) => p.id !== proxy.id);
    if (nameResolvesIn(remaining, proxyGroups, proxy.name)) return '';

    const dangling = dependentsOfOutbound(rules, ruleProviders, proxy.name, proxyProviders);
    return referenceWarning(t, {
      rules: dangling.rules.length,
      providers: dangling.providers.length,
      proxyProviders: dangling.proxyProviders.length,
    });
  })();

  const editingProxy = proxies.find((p) => p.id === editingProxyId);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <motion.button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
          whileHover={{ scale: 1.03, opacity: 0.92 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Plus size={16} />
          {t('proxy.add')}
        </motion.button>
        <motion.button
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
          whileHover={{ scale: 1.03, opacity: 0.92 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Upload size={16} />
          {t('proxy.import')}
        </motion.button>
        <motion.button
          onClick={() => setIsSubscriptionModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ backgroundColor: 'var(--accent)' }}
          whileHover={{ scale: 1.03, opacity: 0.92 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          <Download size={16} />
          {t('proxy.subscription')}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {proxies.length === 0 && (
          <motion.div
            key="empty"
            className="text-center py-8 rounded-lg border"
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderColor: 'var(--border-color)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('proxy.empty')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {proxies.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={proxies.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            {/* initial={false}: the rows that are already here when the tab
                opens should simply be here. Only a proxy that is genuinely
                added or deleted while you are watching has anything to say. */}
            <AnimatePresence initial={false}>
              {proxies.map((proxy) => (
                <ListRow key={proxy.id}>
                  <ProxyCard
                    proxy={proxy}
                    onEdit={() => setEditingProxyId(proxy.id)}
                    onDelete={() => setPendingDelete(proxy.id)}
                  />
                </ListRow>
              ))}
            </AnimatePresence>
          </SortableContext>
        </DndContext>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            variants={anim.backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div
              className="p-6 rounded-lg max-w-md w-full mx-4"
              style={{ backgroundColor: 'var(--bg-primary)' }}
              variants={anim.dialog}
            >
              <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
                {t('proxy.add')}
              </h3>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  {t('proxy.selectProtocol')}
                </label>
                <Select
                  value={selectedProtocol}
                  onChange={setSelectedProtocol}
                  items={availableProtocols.map((protocol) => ({
                    value: protocol,
                    label: getProtocolDisplayName(protocol),
                  }))}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <CancelButton onClick={() => setIsCreating(false)}>
                  {t('common.cancel')}
                </CancelButton>
                <PrimaryButton onClick={handleCreate}>{t('common.confirm')}</PrimaryButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      {editingProxy && (
        <ProxyEditModal
          proxy={editingProxy}
          onClose={() => setEditingProxyId(null)}
        />
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={isSubscriptionModalOpen}
        onClose={() => setIsSubscriptionModalOpen(false)}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title={t('proxy.deleteTitle')}
        message={
          <>
            {t('proxy.deleteConfirm')}
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
