import { useTranslation } from 'react-i18next';
import {
  parsePortExpression,
  normalizePortExpression,
} from '../../../core/server/portExpression';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import { FieldShell, serverInputClass, serverInputStyle } from './FieldShell';

interface PortExpressionFieldProps {
  def: ServerFieldDef;
  value: string | undefined;
  onChange: (value: string) => void;
}

export function PortExpressionField({ def, value, onChange }: PortExpressionFieldProps) {
  const { t } = useTranslation();
  const raw = value ?? '';
  const { errors } = parsePortExpression(raw);
  const normalized =
    errors.length === 0 && raw.trim() !== '' ? normalizePortExpression(raw) : null;

  return (
    <FieldShell
      def={def}
      error={errors.length > 0 ? 'server.validation.portInvalid' : undefined}
    >
      <input
        id={def.key}
        type="text"
        value={raw}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholderKey ? t(def.placeholderKey) : '443'}
        spellCheck={false}
        className={`${serverInputClass} font-mono`}
        style={serverInputStyle()}
      />
      {normalized && normalized !== raw.trim() && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {t('server.fields.portNormalized', { normalized })}
        </p>
      )}
      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
        {t('server.fields.portHint')}
      </p>
    </FieldShell>
  );
}
