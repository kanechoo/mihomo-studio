import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useIRStore } from '../../../store/irStore';
import { Select } from '../../common/Select';
import { RuleProviderEditModal } from '../../modules/RuleProviderEditModal';
import type { FieldSchema } from '../../../schemas/types';
import type { RuleProvider } from '../../../core/ir';

interface RuleSetSelectFieldProps {
  field: FieldSchema;
  value: string;
  onChange: (value: string) => void;
}

const NEW_PROVIDER = '__new__';

// Picks the rule provider a RULE-SET rule points at, so the reference can't
// drift from the providers actually defined in the config.
export function RuleSetSelectField({ field, value, onChange }: RuleSetSelectFieldProps) {
  const { t } = useTranslation();
  const ruleProviders = useIRStore((state) => state.ir.ruleProviders);
  const updateRuleProviders = useIRStore((state) => state.updateRuleProviders);
  const [isCreating, setIsCreating] = useState(false);

  const names = Object.keys(ruleProviders || {});
  const isDangling = !!value && !names.includes(value);

  const handleSelect = (next: string) => {
    if (next === NEW_PROVIDER) {
      setIsCreating(true);
      return;
    }
    onChange(next);
  };

  const handleCreated = (name: string, provider: RuleProvider) => {
    updateRuleProviders({ ...ruleProviders, [name]: provider });
    onChange(name);
    setIsCreating(false);
  };

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
      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        {t('rule.ruleSet.description')}
      </p>

      {names.length === 0 ? (
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md border border-dashed text-sm"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Plus size={16} />
          {t('rule.ruleSet.createFirst')}
        </button>
      ) : (
        <Select
          id={field.fieldKey}
          value={isDangling ? '' : value || ''}
          onChange={handleSelect}
          invalid={isDangling}
          items={[
            { value: '', label: t('rule.ruleSet.placeholder') },
            ...names.map((name) => ({ value: name, label: name })),
            { value: NEW_PROVIDER, label: t('rule.ruleSet.new') },
          ]}
        />
      )}

      {isDangling && (
        <p className="text-xs mt-1 text-red-500">
          {t('rule.ruleSet.missing', { name: value })}
        </p>
      )}

      {isCreating && (
        <RuleProviderEditModal
          onClose={() => setIsCreating(false)}
          onSave={handleCreated}
        />
      )}
    </div>
  );
}
