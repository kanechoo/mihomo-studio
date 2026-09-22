import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { useCloudStore } from '../../store/cloudStore';
import { ConfigDetailsFields, MAX_NAME } from './ConfigDetailsFields';

interface ConfigDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Renames the open config and rewrites its description.
//
// Nothing is sent from here. The change lands in the editor's header and marks
// the document unsaved, and the Save button in that header writes it — so a
// rename and the edits made alongside it reach the server as one save, and the
// name the library shows is always the name that was actually stored.
export function ConfigDetailsDialog({ isOpen, onClose }: ConfigDetailsDialogProps) {
  const { t } = useTranslation();
  const currentName = useCloudStore((state) => state.currentName);
  const currentDescription = useCloudStore((state) => state.currentDescription);
  const setDetails = useCloudStore((state) => state.setDetails);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Seeded each time the dialog opens rather than once at mount, so a dialog
  // reopened after being dismissed shows what the config is called now and not
  // what someone half-typed a minute ago.
  useEffect(() => {
    if (!isOpen) return;
    setName(currentName);
    setDescription(currentDescription);
  }, [isOpen, currentName, currentDescription]);

  const trimmed = name.trim();
  const canApply = trimmed !== '' && trimmed.length <= MAX_NAME;

  const handleApply = () => {
    if (!canApply) return;
    setDetails(trimmed, description.trim());
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('cloud.details.title')}
      icon={<Pencil size={18} />}
      widthClass="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={handleApply} disabled={!canApply}>
            {t('common.confirm')}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <ConfigDetailsFields
          idPrefix="cloud-details"
          name={name}
          description={description}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onEnter={handleApply}
        />

        {/* The button says Confirm rather than Save, and this says why: the new
            name is on screen straight away but is not in the account until the
            document it belongs to is saved. */}
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('cloud.details.hint')}
        </p>
      </div>
    </Modal>
  );
}
