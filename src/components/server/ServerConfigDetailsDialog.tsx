import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { useServerCloudStore } from '../../store/serverCloudStore';
import { ConfigDetailsFields, MAX_NAME } from '../cloud/ConfigDetailsFields';

interface ServerConfigDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Renames the open server config and rewrites its description — the twin of
// the client editor's ConfigDetailsDialog, pointed at serverCloudStore.
//
// Nothing is sent from here. The change lands in the editor's header and marks
// the document unsaved, and Save writes it — so a rename and the edits made
// alongside it reach the server as one save, and the name the library shows is
// always the name that was actually stored.
export function ServerConfigDetailsDialog({ isOpen, onClose }: ServerConfigDetailsDialogProps) {
  // Keyed under AnimatePresence so every opening mounts a fresh form seeded
  // from the store — reopening after a dismissal shows what the config is
  // called now, not what someone half-typed a minute ago — without an effect
  // to push store values into state.
  return (
    <AnimatePresence>
      {isOpen && <ServerConfigDetailsDialogContent key="details" onClose={onClose} />}
    </AnimatePresence>
  );
}

function ServerConfigDetailsDialogContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const currentName = useServerCloudStore((state) => state.currentName);
  const currentDescription = useServerCloudStore((state) => state.currentDescription);
  const setDetails = useServerCloudStore((state) => state.setDetails);

  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription);

  const trimmed = name.trim();
  const canApply = trimmed !== '' && trimmed.length <= MAX_NAME;

  const handleApply = () => {
    if (!canApply) return;
    setDetails(trimmed, description.trim());
    onClose();
  };

  return (
    <Modal
      isOpen
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
          idPrefix="server-details"
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
