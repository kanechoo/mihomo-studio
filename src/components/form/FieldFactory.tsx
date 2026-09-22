import type { FieldSchema } from '../../schemas/types';
import { TextField } from './fields/TextField';
import { TextareaField } from './fields/TextareaField';
import { NumberField } from './fields/NumberField';
import { BooleanField } from './fields/BooleanField';
import { SelectField } from './fields/SelectField';
import { MultiSelectField } from './fields/MultiSelectField';
import { ProxyMultiSelect } from './fields/ProxyMultiSelect';
import { ProviderMultiSelect } from './fields/ProviderMultiSelect';
import { PolicySelectField } from './fields/PolicySelectField';
import { RuleSetSelectField } from './fields/RuleSetSelectField';
import { GeoipSelectField } from './fields/GeoipSelectField';
import { GeositeSelectField } from './fields/GeositeSelectField';
import { GroupMemberSelectField } from './fields/GroupMemberSelectField';
import { DnsMultiSelectField } from './fields/DnsMultiSelectField';

interface FieldFactoryProps {
  field: FieldSchema;
  value: any;
  onChange: (value: any) => void;
  // The whole module's values, for the few fields whose options depend on a
  // sibling field rather than on global state.
  allValues: Record<string, any>;
  // Set by a `lockIf` rule the schema declares. Honoured by the two control
  // types a lock makes sense on — a switch and a dropdown. The other types
  // ignore it: their value is still forced by ConditionalField, so locking one
  // would fight every keystroke rather than refuse it, and threading the prop
  // through is the work to do before writing such a rule.
  disabled?: boolean;
  // i18n key explaining the lock, shown in place of the description.
  lockReason?: string;
}

export function FieldFactory({
  field,
  value,
  onChange,
  allValues,
  disabled,
  lockReason,
}: FieldFactoryProps) {
  switch (field.type) {
    case 'text':
      return <TextField field={field} value={value} onChange={onChange} allValues={allValues} />;

    case 'textarea':
      return <TextareaField field={field} value={value} onChange={onChange} />;

    case 'number':
    case 'port':
      return <NumberField field={field} value={value} onChange={onChange} />;

    case 'boolean':
      return (
        <BooleanField
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          lockReason={lockReason}
        />
      );

    case 'select':
      return (
        <SelectField
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
          lockReason={lockReason}
        />
      );

    case 'multiselect':
      return <MultiSelectField field={field} value={value} onChange={onChange} />;

    case 'proxy-multiselect':
      return <ProxyMultiSelect value={value} onChange={onChange} allValues={allValues} />;

    case 'provider-multiselect':
      return <ProviderMultiSelect value={value} onChange={onChange} />;

    case 'policy-select':
      return <PolicySelectField field={field} value={value} onChange={onChange} />;

    case 'ruleset-select':
      return <RuleSetSelectField field={field} value={value} onChange={onChange} />;

    case 'geoip-select':
      return <GeoipSelectField field={field} value={value} onChange={onChange} />;

    case 'geosite-select':
      return <GeositeSelectField field={field} value={value} onChange={onChange} />;

    case 'group-member-select':
      return (
        <GroupMemberSelectField
          field={field}
          value={value}
          onChange={onChange}
          allValues={allValues}
        />
      );

    case 'dns-multiselect':
      return <DnsMultiSelectField field={field} value={value} onChange={onChange} />;

    // TODO: Implement array and object field types in future
    case 'array':
    case 'object':
      return (
        <div className="mb-4 p-3 rounded border" style={{ borderColor: 'var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {field.type} field type not yet implemented
          </p>
        </div>
      );

    default:
      return (
        <div className="mb-4 p-3 rounded border border-red-500">
          <p className="text-sm text-red-500">Unknown field type: {field.type}</p>
        </div>
      );
  }
}
