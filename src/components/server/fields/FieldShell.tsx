import { useTranslation } from 'react-i18next';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';

interface FieldShellProps {
  def: ServerFieldDef;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}

export function FieldShell({ def, htmlFor, error, children }: FieldShellProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-1">
        <label
          htmlFor={htmlFor ?? def.key}
          className="block text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {t(def.labelKey)}
          {def.required && <span className="text-red-500 ml-1">*</span>}
        </label>
        {def.docUrl && (
          <a
            href={def.docUrl}
            target="_blank"
            rel="noreferrer"
            title={t('server.fields.openDocs')}
            className="text-xs rounded-full border w-4 h-4 inline-flex items-center justify-center shrink-0"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
          >
            ?
          </a>
        )}
      </div>
      {def.descriptionKey && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t(def.descriptionKey)}
        </p>
      )}
      {children}
      {error && (
        <p className="text-xs mt-1 text-red-500" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}

export const serverInputClass =
  'w-full px-3 py-2 rounded-md border text-sm';

export function serverInputStyle(): React.CSSProperties {
  return {
    backgroundColor: 'var(--bg-primary)',
    borderColor: 'var(--border-color)',
    color: 'var(--text-primary)',
  };
}
