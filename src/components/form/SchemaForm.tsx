import type { ModuleSchema } from '../../schemas/types';
import { useIRStore } from '../../store/irStore';
import { getNestedValue } from '../../core/ir';
import { ConditionalField } from './ConditionalField';

interface SchemaFormProps {
  schema: ModuleSchema;
  values?: Record<string, any>;
  onChange?: (fieldKey: string, value: any) => void;
}

export function SchemaForm({ schema, values, onChange }: SchemaFormProps) {
  const ir = useIRStore((state) => state.ir);
  const updateGeneralField = useIRStore((state) => state.updateGeneralField);
  const updateDnsField = useIRStore((state) => state.updateDnsField);
  const updateSectionField = useIRStore((state) => state.updateSectionField);
  const updateHosts = useIRStore((state) => state.updateHosts);

  // Use provided values or fall back to IR data
  const moduleData = values || ir[schema.moduleKey as keyof typeof ir] || {};

  const handleFieldChange = (fieldKey: string, value: any) => {
    // If custom onChange is provided, use it (for modals)
    if (onChange) {
      onChange(fieldKey, value);
      return;
    }

    // Otherwise route to appropriate store action based on module
    if (schema.moduleKey === 'general') {
      updateGeneralField(fieldKey, value);
    } else if (schema.moduleKey === 'dns') {
      updateDnsField(fieldKey, value);
    } else if (schema.moduleKey === 'hosts') {
      // The hosts textarea is edited as `name: ip[,ip]` lines; parse into the
      // official record shape here so the IR never holds raw text.
      const record: Record<string, string | string[]> = {};
      for (const line of String(value).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf(':');
        if (idx <= 0) continue;
        const name = trimmed.slice(0, idx).trim();
        const rest = trimmed.slice(idx + 1).trim();
        if (!name || !rest) continue;
        record[name] = rest.includes(',') ? rest.split(',').map((v) => v.trim()) : rest;
      }
      updateHosts(record);
    } else if (
      schema.moduleKey === 'ntp' ||
      schema.moduleKey === 'profile' ||
      schema.moduleKey === 'experimental' ||
      schema.moduleKey === 'geodata' ||
      schema.moduleKey === 'accessControl' ||
      schema.moduleKey === 'sniffer'
    ) {
      updateSectionField(
        schema.moduleKey as 'ntp' | 'profile' | 'experimental' | 'geodata' | 'accessControl' | 'sniffer',
        fieldKey,
        value
      );
    }
    // proxies, proxyGroups, and rules are handled with dedicated list components
  };

  return (
    <div className="space-y-4">
      {schema.fields.map((field, index) => (
        <ConditionalField
          key={`${field.fieldKey}:${index}`}
          field={field}
          value={getNestedValue(moduleData, field.fieldKey)}
          onChange={(value) => handleFieldChange(field.fieldKey, value)}
          allValues={moduleData as Record<string, any>}
        />
      ))}
    </div>
  );
}
