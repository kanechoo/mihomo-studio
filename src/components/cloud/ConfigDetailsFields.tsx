import { useTranslation } from 'react-i18next';

// Mirrors the server's own limits (service/config.go). Checking here as well is
// not redundant: it turns a round trip that ends in a 400 into feedback the
// moment the field goes over, and the server still has the final say.
export const MAX_NAME = 100;
export const MAX_DESCRIPTION = 500;

interface ConfigDetailsFieldsProps {
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  // Enter in the name field commits, the way it does in any one-line dialog.
  // The description is a textarea, where Enter is a newline.
  onEnter?: () => void;
  // Two dialogs edit these same two fields. They are never open at once, but
  // ids that differ are what keeps a stale `for=` from finding the other one.
  idPrefix: string;
}

// The name and description of a config, as edited in a dialog.
//
// Shared by the dialog that first saves a document and the one that renames it
// afterwards, so the limits and the note about names being unique are written
// once rather than kept in step by hand.
export function ConfigDetailsFields({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onEnter,
  idPrefix,
}: ConfigDetailsFieldsProps) {
  const { t } = useTranslation();

  return (
    <>
      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: 'var(--text-primary)' }}
          htmlFor={`${idPrefix}-name`}
        >
          {t('cloud.save.name')}
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={name}
          autoFocus
          maxLength={MAX_NAME}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onEnter?.();
          }}
          placeholder={t('cloud.save.namePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
        <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('cloud.save.nameHint')}
        </p>
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-1.5"
          style={{ color: 'var(--text-primary)' }}
          htmlFor={`${idPrefix}-description`}
        >
          {t('cloud.save.description')}
        </label>
        <textarea
          id={`${idPrefix}-description`}
          value={description}
          rows={2}
          maxLength={MAX_DESCRIPTION}
          onChange={(event) => onDescriptionChange(event.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-none"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
    </>
  );
}
