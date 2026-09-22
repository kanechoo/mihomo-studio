import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useIRStore } from '../../store/irStore';
import { createDefaultRule, generateId } from '../../core/ir/factory';
import { SchemaForm } from '../form/SchemaForm';
import { rulesSchemaForType } from '../../schemas/modules/rules';
import type { Rule } from '../../core/ir/types';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';

// While the form is open a GEOSITE payload may hold several category names.
// mihomo accepts one per rule, so the draft is expanded on save.
type RuleDraft = Omit<Rule, 'payload'> & { payload: string | string[] };

interface RuleEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  rule?: Rule;
}

export function RuleEditModal({
  isOpen,
  onClose,
  rule,
}: RuleEditModalProps) {
  const { t } = useTranslation();
  const addRules = useIRStore((state) => state.addRules);
  const insertRulesAfter = useIRStore((state) => state.insertRulesAfter);
  const updateRule = useIRStore((state) => state.updateRule);

  const [localRule, setLocalRule] = useState<RuleDraft>(
    rule || createDefaultRule()
  );
  // Shown in the body rather than through `alert()`, which is drawn by the
  // browser chrome and takes the focus out of the form you are trying to fix.
  const [error, setError] = useState('');

  useEffect(() => {
    if (rule) {
      setLocalRule(rule);
    } else {
      setLocalRule(createDefaultRule());
    }
    setError('');
  }, [rule, isOpen]);

  const handleFieldChange = (fieldKey: string, value: any) => {
    setLocalRule((prev) => {
      const next: RuleDraft = { ...prev, [fieldKey]: value };
      // Leaving GEOSITE: collapse the multi-selection so the single-value input
      // for the new type isn't handed an array.
      if (fieldKey === 'type' && value !== 'GEOSITE' && Array.isArray(next.payload)) {
        next.payload = next.payload[0] ?? '';
      }
      return next;
    });
  };

  const payloads = (
    Array.isArray(localRule.payload) ? localRule.payload : [localRule.payload]
  )
    .map((payload) => (payload ?? '').trim())
    .filter((payload) => payload !== '');

  // Placeholder/description/pattern follow the selected type, so the form
  // always asks for the value mihomo expects (a port rule shows `443`, a
  // process rule shows `curl`, …).
  const schema = rulesSchemaForType(localRule.type);

  const handleSave = () => {
    if (payloads.length === 0 && localRule.type !== 'MATCH') {
      setError(t('rule.validation.payloadRequired'));
      return;
    }
    setError('');

    // MATCH carries no payload, so it still produces exactly one rule.
    const fields = (payloads.length > 0 ? payloads : ['']).map((payload) => ({
      type: localRule.type,
      payload,
      policy: localRule.policy,
      'no-resolve': localRule['no-resolve'],
    }));

    if (rule) {
      // The edited rule keeps its identity and position; any extra categories
      // land immediately after it so match order stays where the user put it.
      updateRule(rule.id, fields[0]);
      const extra = fields.slice(1).map((f) => ({ ...f, id: generateId() }));
      if (extra.length > 0) {
        insertRulesAfter(rule.id, extra);
      }
    } else {
      addRules(fields.map((f) => ({ ...f, id: generateId() })));
    }
    onClose();
  };

  if (!isOpen) return null;

  // Out to the body: this modal is mounted inside a `space-y-4` list, whose
  // child margins would otherwise offset and shrink the fixed backdrop — a
  // strip of page left uncovered at the top of the window. See common/Modal.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {rule ? t('rule.edit') : t('rule.add')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-md bg-red-500 bg-opacity-10 text-red-500 text-sm"
            >
              {error}
            </div>
          )}
          <SchemaForm
            schema={schema}
            values={localRule}
            onChange={handleFieldChange}
          />
          {/* Only a GEOSITE selection can hold more than one payload. */}
          {payloads.length > 1 && (
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {t('rule.geosite.expand', { total: payloads.length })}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <CancelButton onClick={onClose}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
