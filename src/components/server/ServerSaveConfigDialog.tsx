import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import { useServerCloudStore } from '../../store/serverCloudStore';
import { ConfigDetailsFields, MAX_NAME } from '../cloud/ConfigDetailsFields';
import { ErrorNote } from '../cloud/ErrorNote';

interface ServerSaveConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (id: number) => void;
}

// Names the server document and saves it as a new cloud config. Always creates,
// never updates — the same "save as" semantics as the client dialog it mirrors,
// with the field block reused so both dialogs ask identical questions.
export function ServerSaveConfigDialog({
  isOpen,
  onClose,
  onSaved,
}: ServerSaveConfigDialogProps) {
  const { t } = useTranslation();
  const saveAs = useServerCloudStore((state) => state.saveAs);
  const saving = useServerCloudStore((state) => state.saving);
  const saveError = useServerCloudStore((state) => state.saveError);
  const clearErrors = useServerCloudStore((state) => state.clearErrors);
  const currentName = useServerCloudStore((state) => state.currentName);
  const currentDescription = useServerCloudStore((state) => state.currentDescription);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // A brand-new document arrives pre-named "Untitled" — the same default the
    // editor header shows — instead of an empty field.
    setName(currentName || t('server.newConfigName'));
    setDescription(currentDescription);
    clearErrors();
  }, [isOpen, currentName, currentDescription, clearErrors, t]);

  const trimmed = name.trim();
  const canSave = trimmed !== '' && trimmed.length <= MAX_NAME && !saving;

  const handleSave = async () => {
    if (!canSave) return;
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
      title={t('server.cloud.saveTitle')}
      icon={<Save size={18} />}
      widthClass="max-w-lg"
      footer={
        <>
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? t('cloud.save.saving') : t('common.save')}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <ConfigDetailsFields
          idPrefix="server-cloud-save"
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
