import { useTranslation } from 'react-i18next';
import { Select } from '../../common/Select';
import type { FieldSchema } from '../../../schemas/types';

interface GroupMemberSelectFieldProps {
  field: FieldSchema;
  value: string | undefined;
  onChange: (value: string) => void;
  allValues: Record<string, any>;
}

// Picks one of the group's own members. mihomo silently falls back to the first
// member when `default-selected` names something the group doesn't contain, so
// a typed-in name fails without any error to notice.
export function GroupMemberSelectField({
  field,
  value,
  onChange,
  allValues,
}: GroupMemberSelectFieldProps) {
  const { t } = useTranslation();

  const members: string[] = allValues?.config?.proxies ?? [];
  // A group that pulls in a provider has members this app never sees: they
  // arrive from a subscription at runtime. So "not in the list" stops meaning
  // "not in the group", and both the red mark and the offer to pick have to
  // give way — the stored name may well be one of them.
  const providers: string[] = allValues?.config?.use ?? [];
  const fromProviders = providers.length > 0;
  const current = value ?? '';
  // Can happen when a member is renamed or dropped from the group afterwards.
  const isMissing = current !== '' && !members.includes(current) && !fromProviders;
  // Shown as an option so the control says what is actually stored, whether the
  // name is a mistake or a node out of a provider.
  const isUnlisted = current !== '' && !members.includes(current);

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
        disabled={members.length === 0 && !fromProviders}
        invalid={isMissing}
        items={[
          { value: '', label: t('proxyGroup.defaultSelected.first') },
          ...(isUnlisted ? [{ value: current, label: current }] : []),
          ...members.map((member) => ({ value: member, label: member })),
        ]}
      />
      {members.length === 0 && !fromProviders && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {t('proxyGroup.defaultSelected.noMembers')}
        </p>
      )}
      {/* Only the provider's own nodes are unlistable, so this says so rather
          than leaving an empty dropdown to be read as a bug. */}
      {fromProviders && (
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {t('proxyGroup.defaultSelected.fromProviders')}
        </p>
      )}
      {isMissing && (
        <p className="text-xs mt-1 text-red-500">
          {t('proxyGroup.defaultSelected.missing', { name: current })}
        </p>
      )}
    </div>
  );
}
