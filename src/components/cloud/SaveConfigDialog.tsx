import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { useCloudStore } from '../../store/cloudStore';
import { ConfigDetailsFields, MAX_NAME } from './ConfigDetailsFields';
import { ErrorNote } from './ErrorNote';

interface SaveConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (id: number) => void;
}

// Names the document and saves it as a new cloud config.
//
// Also the "save a copy" path: it always creates, never updates, so the existing
// config is left exactly as it was.
export function SaveConfigDialog({ isOpen, onClose, onSaved }: SaveConfigDialogProps) {
  const { t } = useTranslation();
  const saveAs = useCloudStore((state) => state.saveAs);
  const saving = useCloudStore((state) => state.saving);
  const saveError = useCloudStore((state) => state.saveError);
  const clearErrors = useCloudStore((state) => state.clearErrors);
  const currentName = useCloudStore((state) => state.currentName);
  const currentDescription = useCloudStore((state) => state.currentDescription);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Seeded each time the dialog opens rather than once at mount: a dialog that
  // reopened holding what was typed during a previous, abandoned attempt would
  // be quietly wrong. A brand-new document arrives pre-named "Untitled" — the
  // same default the editor header shows — instead of an empty field.
  useEffect(() => {
    if (!isOpen) return;
    setName(currentName || t('editor.newConfigName'));
    setDescription(currentDescription);
    clearErrors();
  }, [isOpen, currentName, currentDescription, clearErrors, t]);

  const trimmed = name.trim();
  const canSave = trimmed !== '' && trimmed.length <= MAX_NAME && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    // The id comes back from the save rather than being read off the store
    // afterwards: this dialog closes and hands over to whoever opened it, and
    // that handover has to name the config it just created.
    const id = await saveAs(trimmed, description.trim());
    if (id !== null) {
      onSaved?.(id);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('cloud.save.title')}
      icon={<Save size={18} />}
      widthClass="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={handleSave} disabled={!canSave}>
            {saving ? t('cloud.save.saving') : t('common.save')}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <ConfigDetailsFields
          idPrefix="cloud-save"
          name={name}
          description={description}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onEnter={() => void handleSave()}
        />

        <ErrorNote error={saveError} />
      </div>
    </Modal>
  );
}
