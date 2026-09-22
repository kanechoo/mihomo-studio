import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useIRStore } from '../../../store/irStore';
import { Select } from '../../common/Select';
import { BUILT_IN_OUTBOUNDS, policyResolves } from '../../../core/ir/references';
import type { FieldSchema } from '../../../schemas/types';

interface PolicySelectFieldProps {
  field: FieldSchema;
  value: string;
  onChange: (value: string) => void;
}

export function PolicySelectField({ field, value, onChange }: PolicySelectFieldProps) {
  const { t } = useTranslation();
  const proxyGroups = useIRStore((state) => state.ir.proxyGroups);
  const proxies = useIRStore((state) => state.ir.proxies);

  const [mode, setMode] = useState<'select' | 'custom'>('select');
  const [customValue, setCustomValue] = useState('');

  // Shared with the rule list, so a policy the list marks broken is marked
  // broken here too rather than only looking like an unusual custom value.
  const builtInPolicies = BUILT_IN_OUTBOUNDS;
  const isMissing = !policyResolves(proxies, proxyGroups, value);

  // Check if current value is built-in or proxy group
  useEffect(() => {
    const isBuiltIn = builtInPolicies.includes(value);
    const isProxyGroup = proxyGroups.some((g) => g.name === value);

    if (!value || isBuiltIn || isProxyGroup) {
      setMode('select');
    } else {
      setMode('custom');
      setCustomValue(value);
    }
  }, [value, proxyGroups]);

  const handleSelectChange = (newValue: string) => {
    if (newValue === '__custom__') {
      setMode('custom');
      setCustomValue(value || '');
    } else {
      onChange(newValue);
    }
  };

  const handleCustomChange = (newValue: string) => {
    setCustomValue(newValue);
    onChange(newValue);
  };

  const handleModeSwitch = () => {
    if (mode === 'select') {
      setMode('custom');
      setCustomValue(value || '');
    } else {
      setMode('select');
      onChange(builtInPolicies[0]);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label
          className="block text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {t(field.label)}
        </label>
        <button
          type="button"
          onClick={handleModeSwitch}
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--accent)',
          }}
        >
          {mode === 'select' ? t('rule.policy.customInput') : t('rule.policy.selectMode')}
        </button>
      </div>

      {field.description && (
        <p
          className="text-xs mb-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t(field.description)}
        </p>
      )}

      {mode === 'select' ? (
        <Select
          value={value || ''}
          onChange={handleSelectChange}
          items={[
            { value: '', label: t('rule.policy.selectPlaceholder') },
            {
              label: t('rule.policy.builtIn'),
              options: builtInPolicies.map((policy) => ({ value: policy, label: policy })),
            },
            ...(proxyGroups.length > 0
              ? [
                  {
                    label: t('rule.policy.proxyGroups'),
                    options: proxyGroups.map((group) => ({
                      value: group.name,
                      label: `${group.name} (${group.type})`,
                    })),
                  },
                ]
              : []),
            { value: '__custom__', label: t('rule.policy.customOption') },
          ]}
        />
      ) : (
        <input
          type="text"
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder={field.placeholder || ''}
          className="w-full px-3 py-2 rounded-md border text-sm"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderColor: isMissing ? '#dc2626' : 'var(--border-color)',
            color: 'var(--text-primary)',
          }}
          required={field.required}
        />
      )}

      {/* Reachable by deleting the group a rule pointed at, which the editor
          deliberately does not repair on its own: silently rewriting this to
          DIRECT would send traffic out unproxied without anyone being told. */}
      {isMissing && (
        <p className="text-xs mt-1 text-red-500">
          {t('rule.dangling.policy', { name: value })}
        </p>
      )}
    </div>
  );
}
