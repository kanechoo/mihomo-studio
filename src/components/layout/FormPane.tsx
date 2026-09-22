import { motion } from 'motion/react';
import {
  Settings,
  Network,
  Globe,
  Layers,
  ListFilter,
  FolderTree,
  DownloadCloud,
  SlidersHorizontal,
  Landmark,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as anim from '../../animation/tokens';
import { useWheelTabSwitcher } from '../../hooks/useWheelTabSwitcher';
import { useUIStore } from '../../store/uiStore';
import { configSchema } from '../../schemas';
import { SchemaForm } from '../form/SchemaForm';
import { ProxyList } from '../modules/ProxyList';
import { ProxyProviderList } from '../modules/ProxyProviderList';
import { ProxyGroupList } from '../modules/ProxyGroupList';
import { RuleProviderList } from '../modules/RuleProviderList';
import { RuleList } from '../modules/RuleList';

// Ordered by how often a config actually touches each part: the proxy/graph
// sections carry almost every document, while Advanced (six small modules) and
// Hosts are low-frequency and therefore sit at the end of the strip.
export const FORM_TAB_KEYS = [
  'general',
  'dns',
  'proxies',
  // Providers come before the groups that pull them in, for the same reason
  // rule providers come before rules: a group can only `use:` one that exists,
  // so defining it is the earlier step.
  'proxyProvider',
  'proxyGroups',
  // Rule providers come before rules: a RULE-SET rule can only reference a
  // provider that already exists, so defining them is the earlier step.
  'ruleProvider',
  'rules',
  // The advanced tab stacks several small modules; one tab instead of five
  // keeps the strip navigable now that the schema count has grown.
  'advanced',
  'hosts',
] as const;

const TAB_ICONS: Record<string, typeof Settings> = {
  general: Settings,
  dns: Globe,
  advanced: SlidersHorizontal,
  hosts: Landmark,
  proxies: Network,
  proxyProvider: DownloadCloud,
  proxyGroups: Layers,
  ruleProvider: FolderTree,
  rules: ListFilter,
};

const ADVANCED_MODULES = ['ntp', 'profile', 'experimental', 'geodata', 'accessControl', 'sniffer'];

export function FormPane() {
  const { t } = useTranslation();
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const { tabStripRef, registerTabButton, handleWheel } = useWheelTabSwitcher(
    FORM_TAB_KEYS,
    activeTab as (typeof FORM_TAB_KEYS)[number],
    setActiveTab
  );

  const renderTabContent = () => {
    if (activeTab === 'proxies') {
      return <ProxyList />;
    }

    if (activeTab === 'proxyProvider') {
      return <ProxyProviderList />;
    }

    if (activeTab === 'proxyGroups') {
      return <ProxyGroupList />;
    }

    if (activeTab === 'ruleProvider') {
      return <RuleProviderList />;
    }

    if (activeTab === 'rules') {
      return <RuleList />;
    }

    const isAdvanced = activeTab === 'advanced';
    if (isAdvanced) {
      return (
        <div className="space-y-8">
          {ADVANCED_MODULES.map((moduleKey) => {
            const schema = configSchema.modules.find((m) => m.moduleKey === moduleKey);
            if (!schema) return null;
            return (
              <section key={moduleKey}>
                <h3
                  className="text-sm font-semibold mb-3 pb-2 border-b"
                  style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}
                >
                  {t(`${moduleKey}.title`)}
                </h3>
                <SchemaForm schema={schema} />
              </section>
            );
          })}
        </div>
      );
    }

    const schema = configSchema.modules.find((m) => m.moduleKey === activeTab);
    if (!schema) {
      return (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Module not found
          </p>
        </div>
      );
    }

    return <SchemaForm schema={schema} />;
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Tab Navigation */}
      <div
        className="flex border-b overflow-x-auto"
        style={{ borderColor: 'var(--border-color)' }}
        ref={tabStripRef}
        onWheel={handleWheel}
      >
        {FORM_TAB_KEYS.map((key) => {
          const Icon = TAB_ICONS[key];
          const isActive = activeTab === key;

          return (
            <button
              key={key}
              ref={registerTabButton(key)}
              onClick={() => setActiveTab(key)}
              className="relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors shrink-0"
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
            >
              <Icon size={16} />
              {t(`${key}.title`)}

              {/* One underline shared by every tab. Because they all render it
                  under the same layoutId, motion treats the one that
                  disappears and the one that appears as the same element and
                  slides it across — so the marker tracks your click instead of
                  teleporting, and the row reads as one control.

                  It is also positioned rather than a border, which it used to
                  be: a 2px bottom border on the active tab alone made that tab
                  2px taller than its neighbours and nudged the whole row on
                  every switch. */}
              {isActive && (
                <motion.span
                  layoutId="form-tab-underline"
                  className="absolute left-0 right-0 bottom-0 h-0.5"
                  style={{ backgroundColor: 'var(--accent)' }}
                  transition={anim.layoutSpring}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Keyed on the tab, so switching remounts this and replays the
            entrance. Deliberately not wrapped in AnimatePresence: waiting for
            the old panel to leave before the new one arrives would put a third
            of a second between the click and the form, and a tab strip is
            something people click repeatedly while hunting for a setting. */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: anim.DURATION.fast, ease: anim.EASE_OUT }}
        >
          {renderTabContent()}
        </motion.div>
      </div>
    </div>
  );
}
