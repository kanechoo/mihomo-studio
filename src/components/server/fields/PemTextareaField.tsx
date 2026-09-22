import { useTranslation } from 'react-i18next';
import type { ServerFieldDef } from '../../../schemas/listeners/dsl';
import { isValidPem } from './pem';
import { FieldShell, serverInputClass, serverInputStyle } from './FieldShell';

interface PemTextareaFieldProps {
  def: ServerFieldDef;
  value: string | undefined;
  onChange: (value: string) => void;
}

export function PemTextareaField({ def, value, onChange }: PemTextareaFieldProps) {
  const { t } = useTranslation();
  const raw = value ?? '';
  const invalid = raw.trim() !== '' && !isValidPem(raw);

  return (
    <FieldShell def={def} error={invalid ? 'server.validation.pemInvalid' : undefined}>
      <textarea
        id={def.key}
        rows={6}
        value={raw}
        onChange={(e) => onChange(e.target.value)}
        placeholder={def.placeholderKey ? t(def.placeholderKey) : ''}
        spellCheck={false}
        className={`${serverInputClass} font-mono`}
        style={serverInputStyle()}
      />
    </FieldShell>
  );
}
