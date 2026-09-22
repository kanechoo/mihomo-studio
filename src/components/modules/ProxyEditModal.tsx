import { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { ProxyNode } from '../../core/ir';
import { useIRStore } from '../../store/irStore';
import { getProtocolSchema } from '../../schemas/modules/proxies';
import { groupProxyFieldsBySection, PROXY_SECTION_TITLE_KEYS } from '../../schemas/modules/proxies/sections';
import { getNestedValue } from '../../core/ir';
import { deleteNestedValue, isClearedValue, setNestedValue } from '../../core/ir/factory';
import { ConditionalField } from '../form/ConditionalField';
import { CancelButton, PrimaryButton } from '../common/DialogButtons';
import * as anim from '../../animation/tokens';

interface ProxyEditModalProps {
  proxy: ProxyNode;
  onClose: () => void;
}

export function ProxyEditModal({ proxy, onClose }: ProxyEditModalProps) {
  const { t } = useTranslation();
  const updateProxyField = useIRStore((state) => state.updateProxyField);
  const renameProxy = useIRStore((state) => state.renameProxy);

  // Every edit lands in a local clone first and only Save writes it through —
  // the contract every other edit dialog in the app runs on. It used to be a
  // half-measure here: fields were written per keystroke while only the name
  // waited, so Cancel could undo your typing but not your rename, and the
  // footer said "Confirm" because it could promise neither.
  //
  // The name still gets special treatment at save time — it is a graph rewrite
  // (every group, rule and rule provider that mentions this node moves with
  // it) and it can be refused outright when taken. But it refuses inside the
  // dialog now, with the reason on it, instead of on close.
  //
  // Seeded once at mount: the list mounts a fresh modal per node, and while
  // this overlay is up nothing else can touch the document under it.
  const [draft, setDraft] = useState<ProxyNode>(() => structuredClone(proxy));
  const [nameError, setNameError] = useState('');
  const [fieldError, setFieldError] = useState('');
  // Advanced sections are collapsed by default, matching the server editor:
  // the common identity/TLS fields are worked first and rare knobs show on ask.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Get the schema for this proxy type. A config imported from elsewhere can
  // carry a type we have no schema for — fall back to a notice instead of
  // crashing on an undefined field list.
  const schema = getProtocolSchema(draft.type as any);

  const groups = schema
    ? groupProxyFieldsBySection(schema, draft as unknown as Record<string, unknown>, draft.type)
    : [];
  const basicGroups = groups.filter((group) => group.level === 'basic');
  const advancedGroups = groups.filter((group) => group.level === 'advanced');

  const handleFieldChange = (fieldKey: string, value: any) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      if (fieldKey.startsWith('config.') && isClearedValue(value)) {
        deleteNestedValue(next.config, fieldKey.slice('config.'.length));
      } else {
        setNestedValue(next, fieldKey, value);
      }
      return next;
    });
    if (fieldKey === 'name') setNameError('');
    setFieldError('');
  };

  const handleCancel = () => {
    onClose();
  };

  // Validates every visible field from the draft before anything is written.
  // Number fields are the reason this exists: they used to coerce a cleared
  // input to `0`, so the modal must now catch the invalid states a real save
  // could otherwise persist.
  const validateDraft = (): string | null => {
    for (const field of schema ?? []) {
      const value = getNestedValue(draft, field.fieldKey);

      if (field.required && isClearedValue(value)) {
        return t('proxy.validation.fieldRequired', { label: t(field.label) });
      }

      if ((field.type === 'number' || field.type === 'port') && !isClearedValue(value)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return t('proxy.validation.fieldNumber', { label: t(field.label) });
        }
        const min = field.min ?? (field.type === 'port' ? 1 : undefined);
        const max = field.max ?? (field.type === 'port' ? 65535 : undefined);
        if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
          return t('proxy.validation.fieldRange', {
            label: t(field.label),
            min: min ?? '',
            max: max ?? '',
          });
        }
      }

      if (field.pattern && !isClearedValue(value)) {
        let matches = false;
        try {
          matches = new RegExp(field.pattern).test(String(value));
        } catch {
          matches = false;
        }
        if (!matches) return t('proxy.validation.fieldPattern', { label: t(field.label) });
      }
    }
    return null;
  };

  const handleSave = () => {
    const validationError = validateDraft();
    if (validationError) {
      setFieldError(validationError);
      return;
    }
    setFieldError('');

    // Fields first, then the name: the rename rewrites every reference to this
    // node, so it should run once over the final content rather than race the
    // field writes.
    for (const field of schema ?? []) {
      if (field.fieldKey === 'name') continue;
      const before = getNestedValue(proxy, field.fieldKey);
      const after = getNestedValue(draft, field.fieldKey);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        updateProxyField(proxy.id, field.fieldKey, after);
      }
    }

    if (draft.name.trim() !== proxy.name) {
      const result = renameProxy(proxy.id, draft.name);
      if (!result.ok) {
        setNameError(
          result.reason === 'empty'
            ? t('proxy.validation.nameRequired')
            : result.reason === 'reserved'
              ? t('proxy.validation.reservedName', { name: draft.name.trim() })
              : t('proxy.validation.duplicateName', { name: draft.name.trim() })
        );
        return;
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('proxy.edit')} - {proxy.name}
          </h3>
          {/* The X cancels, like Escape and the backdrop in every other
              dialog: what was typed here is a draft until Save says otherwise,
              and leaving by any door but Save throws it away. */}
          <button
            onClick={handleCancel}
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {nameError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-md bg-red-500 bg-opacity-10 text-red-500 text-sm"
            >
              {nameError}
            </div>
          )}
          {fieldError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-md bg-red-500 bg-opacity-10 text-red-500 text-sm"
            >
              {fieldError}
            </div>
          )}
          {!schema ? (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('proxy.unsupportedType', { type: proxy.type })}
            </p>
          ) : (
            <div className="space-y-8">
              {basicGroups.map((group) => (
                <fieldset key={`basic:${group.section}`} className="min-w-0">
                  <legend
                    className="text-sm font-semibold mb-3 pb-2 w-full border-b"
                    style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
                  >
                    {t(PROXY_SECTION_TITLE_KEYS[group.section])}
                  </legend>
                  {group.fields.map((field) => (
                    <ConditionalField
                      key={field.fieldKey}
                      field={field}
                      value={getNestedValue(draft, field.fieldKey)}
                      onChange={(value) => handleFieldChange(field.fieldKey, value)}
                      allValues={draft}
                    />
                  ))}
                </fieldset>
              ))}

              {advancedGroups.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pt-2">
                    <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-color)' }} />
                    <motion.button
                      type="button"
                      onClick={() => setShowAdvanced((value) => !value)}
                      className="px-3 py-1.5 rounded-md text-sm font-medium shrink-0"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
                    >
                      {showAdvanced ? t('proxy.editor.showBasic') : t('proxy.editor.showAdvanced')}
                    </motion.button>
                    <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-color)' }} />
                  </div>

                  {showAdvanced &&
                    advancedGroups.map((group) => (
                      <fieldset key={`advanced:${group.section}`} className="min-w-0">
                        <legend
                          className="text-sm font-semibold mb-3 pb-2 w-full border-b"
                          style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}
                        >
                          {t(PROXY_SECTION_TITLE_KEYS[group.section])}
                        </legend>
                        {group.fields.map((field) => (
                          <ConditionalField
                            key={field.fieldKey}
                            field={field}
                            value={getNestedValue(draft, field.fieldKey)}
                            onChange={(value) => handleFieldChange(field.fieldKey, value)}
                            allValues={draft}
                          />
                        ))}
                      </fieldset>
                    ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 p-4 border-t"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <CancelButton onClick={handleCancel}>{t('common.cancel')}</CancelButton>
          <PrimaryButton onClick={handleSave}>{t('common.save')}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
