import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';
import type { ServerFieldDef, ListenerSectionName } from '../../schemas/listeners/dsl';
import type { ListenerIR } from '../../core/server/types';
import { groupBySection } from '../../schemas/listeners/dsl';
import { ServerConditionalField, ServerFieldFactory } from './ServerFieldFactory';

const SECTION_TITLE_KEYS: Record<ListenerSectionName, string> = {
  common: 'server.section.common',
  auth: 'server.section.auth',
  transport: 'server.section.transport',
  tls: 'server.section.tls',
  security: 'server.section.security',
  protocol: 'server.section.protocol',
};

interface ServerSchemaFormProps {
  fields: ServerFieldDef[];
  values: ListenerIR;
  onChange: (path: string, value: unknown) => void;
}

// Fields the schema marks `level: 'advanced'` — tunables that matter only for
// specific deployments (xhttp tuning, kcp windows, client-auth certs, ECH…).
function isAdvanced(def: ServerFieldDef): boolean {
  return def.level === 'advanced';
}

export function ServerSchemaForm({ fields, values, onChange }: ServerSchemaFormProps) {
  const { t } = useTranslation();
  // Advanced fields start collapsed and live BELOW every basic section: a
  // listener form is worked top-down (name → port → auth → security), and the
  // rare knobs should be found after that pass, not before it.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const basicSections = groupBySection(fields.filter((def) => !isAdvanced(def)));
  const advancedSections = groupBySection(fields.filter(isAdvanced));

  const renderField = (def: ServerFieldDef) => (
    <ServerConditionalField
      key={def.id ?? def.key}
      def={def}
      values={values as unknown as Record<string, unknown>}
    >
      <ServerFieldFactory
        def={def}
        values={values as unknown as Record<string, unknown>}
        onChange={onChange}
      />
    </ServerConditionalField>
  );

  const renderSection = ({ section, fields: sectionFields }: { section: ListenerSectionName; fields: ServerFieldDef[] }) => (
    <fieldset key={section} className="min-w-0">
      {/* Same section heading as the client form pane: a plain semibold
          line over a rule, not a pill — the sections of one document should
          read as one system. Muted gray so headings label quietly and the
          field labels carry the visual weight. */}
      <legend className="text-sm font-semibold mb-3 pb-2 border-b w-full" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
        {t(SECTION_TITLE_KEYS[section])}
      </legend>
      {sectionFields.map(renderField)}
    </fieldset>
  );

  return (
    <div className="space-y-8">
      {basicSections.map(renderSection)}

      {advancedSections.length > 0 && (
        <>
          {/* The divider makes the boundary a place on the page rather than a
              mode switch floating at the top: everything above is what most
              listeners need; everything below appears only on request. */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-color)' }} />
            <motion.button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="px-3 py-1.5 rounded-md text-sm font-medium shrink-0"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
            >
              {showAdvanced ? t('server.editor.showBasic') : t('server.editor.showAdvanced')}
            </motion.button>
            <div className="h-px flex-1" style={{ backgroundColor: 'var(--border-color)' }} />
          </div>

          {showAdvanced && advancedSections.map(renderSection)}
        </>
      )}
    </div>
  );
}
