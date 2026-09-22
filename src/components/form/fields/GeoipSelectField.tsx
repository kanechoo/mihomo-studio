import { useTranslation } from 'react-i18next';
import { Select } from '../../common/Select';
import type { FieldSchema } from '../../../schemas/types';
import { GEOIP_CODES, isCountryCode, formatGeoipOption } from '../../../data/geoip';

interface GeoipSelectFieldProps {
  field: FieldSchema;
  value: string;
  onChange: (value: string) => void;
}

// Picks a GeoIP code from the set the bundled database actually knows about,
// so a typo can't silently produce a rule that never matches.
export function GeoipSelectField({ field, value, onChange }: GeoipSelectFieldProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const current = value ?? '';
  const countries = GEOIP_CODES.filter(isCountryCode);
  const networks = GEOIP_CODES.filter((c) => !isCountryCode(c));

  // A config imported or hand-edited elsewhere may carry a code we don't list.
  // Keep it selectable rather than silently rewriting it to something else.
  const isUnknown = current !== '' && !GEOIP_CODES.includes(current as any);

  return (
    <div className="mb-4">
      <label
        htmlFor={field.fieldKey}
        className="block text-sm font-medium mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {t(field.label)}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {field.description && (
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t(field.description)}
        </p>
      )}
      <Select
        id={field.fieldKey}
        value={current}
        onChange={onChange}
        invalid={isUnknown}
        items={[
          ...(!field.required ? [{ value: '', label: t('geoip.none') }] : []),
          ...(isUnknown ? [{ value: current, label: current }] : []),
          {
            label: t('geoip.countries'),
            options: countries.map((code) => ({
              value: code as string,
              label: formatGeoipOption(code, locale),
            })),
          },
          {
            label: t('geoip.networks'),
            options: networks.map((code) => ({ value: code as string, label: code })),
          },
        ]}
      />
      {isUnknown && (
        <p className="text-xs mt-1 text-red-500">{t('geoip.unknown', { code: current })}</p>
      )}
    </div>
  );
}
