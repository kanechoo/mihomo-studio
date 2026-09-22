import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useIRStore } from '../../store/irStore';
import { createDefaultProxyGroup } from '../../core/ir/factory';
import { isReservedName, nameResolvesIn } from '../../core/ir';
import { SchemaForm } from '../form/SchemaForm';
import { proxyGroupsSchema } from '../../schemas/modules/groups';
import type { ProxyGroup } from '../../core/ir/types';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';

interface ProxyGroupEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  group?: ProxyGroup;
}

export function ProxyGroupEditModal({
  isOpen,
  onClose,
  group,
}: ProxyGroupEditModalProps) {
  const { t } = useTranslation();
  const addProxyGroup = useIRStore((state) => state.addProxyGroup);
  const updateProxyGroup = useIRStore((state) => state.updateProxyGroup);
  const renameProxyGroup = useIRStore((state) => state.renameProxyGroup);
  const proxies = useIRStore((state) => state.ir.proxies);
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);

  const [localGroup, setLocalGroup] = useState<ProxyGroup>(
    group || createDefaultProxyGroup()
  );
  // Shown in the body rather than through `alert()`, which is drawn by the
  // browser chrome and takes the focus out of the form you are trying to fix.
  const [error, setError] = useState('');

  useEffect(() => {
    if (group) {
      setLocalGroup(group);
    } else {
      setLocalGroup(createDefaultProxyGroup());
    }
    setError('');
  }, [group, isOpen]);

  const handleFieldChange = (fieldKey: string, value: any) => {
    setLocalGroup((prev) => {
      const keys = fieldKey.split('.');
      if (keys.length === 1) {
        return { ...prev, [fieldKey]: value };
      } else {
        const newConfig = { ...prev.config };
        let current: any = newConfig;
        for (let i = 1; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        return { ...prev, config: newConfig };
      }
    });
  };

  const handleSave = () => {
    const name = localGroup.name.trim();
    if (!name) {
      setError(t('proxyGroup.validation.nameRequired'));
      return;
    }
    setError('');

    if (group) {
      // The rename goes first and on its own, because it is the only part of
      // this form that can be refused — and because it has to carry every rule
      // and group that named the old value with it. Only once it lands is the
      // rest of the form worth writing.
      const renamed = renameProxyGroup(group.id, name);
      if (!renamed.ok) {
        setError(
          renamed.reason === 'reserved'
            ? t('proxyGroup.validation.reservedName', { name })
            : t('proxyGroup.validation.duplicateName', { name })
        );
        return;
      }
      updateProxyGroup(group.id, { ...localGroup, name });
    } else {
      // A new group is held to the same rule. Two outbounds sharing a name is
      // a config mihomo refuses, and there is no telling which one a rule
      // pointing at that name was supposed to mean. Its own outbounds count:
      // DIRECT is taken before the file is read.
      if (isReservedName(name)) {
        setError(t('proxyGroup.validation.reservedName', { name }));
        return;
      }
      if (nameResolvesIn(proxies, proxyGroups, name)) {
        setError(t('proxyGroup.validation.duplicateName', { name }));
        return;
      }
      addProxyGroup({ ...localGroup, name });
    }
    onClose();
  };

  if (!isOpen) return null;

  // Out to the body: this modal is mounted inside a `space-y-4` list, whose
  // child margins would otherwise offset and shrink the fixed backdrop — a
  // strip of page left uncovered at the top of the window. See common/Modal.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {group ? t('proxyGroup.edit') : t('proxyGroup.add')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-md bg-red-500 bg-opacity-10 text-red-500 text-sm"
            >
              {error}
            </div>
          )}
          <SchemaForm
            schema={proxyGroupsSchema}
            values={localGroup}
            onChange={handleFieldChange}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
