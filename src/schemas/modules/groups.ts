import type { ModuleSchema } from '../types';

// A relay group chains its members instead of choosing between them, so it has
// nothing to health-check and no "current" node to pre-select. Every other type
// does — including plain `select`, which still health-checks to report latency.
const SELECTING_TYPES = ['select', 'url-test', 'fallback', 'load-balance'];

// Proxy groups configuration schema
export const proxyGroupsSchema: ModuleSchema = {
  moduleKey: 'proxyGroups',
  label: 'proxyGroup.title',
  description: 'proxyGroup.description',
  icon: 'layers',
  fields: [
    {
      fieldKey: 'name',
      label: 'proxyGroup.name.label',
      type: 'text',
      required: true,
      placeholder: 'Proxy Group',
      description: 'proxyGroup.name.description',
    },
    {
      fieldKey: 'type',
      label: 'proxyGroup.type.label',
      type: 'select',
      default: 'select',
      required: true,
      description: 'proxyGroup.type.description',
      options: [
        { value: 'select', label: 'proxyGroup.type.select' },
        { value: 'url-test', label: 'proxyGroup.type.urlTest' },
        { value: 'fallback', label: 'proxyGroup.type.fallback' },
        { value: 'load-balance', label: 'proxyGroup.type.loadBalance' },
        { value: 'relay', label: 'proxyGroup.type.relay' },
      ],
    },
    {
      // Not marked required any more, because it is not: a group backed by a
      // subscription has nothing here and everything in `use:` below. mihomo
      // wants one of the two, which is a question about the pair and so is
      // asked at save time rather than with an asterisk on one of them.
      fieldKey: 'config.proxies',
      label: 'proxyGroup.proxies.label',
      type: 'proxy-multiselect',
      default: [],
      description: 'proxyGroup.proxies.description',
    },
    {
      fieldKey: 'config.use',
      label: 'proxyGroup.use.label',
      type: 'provider-multiselect',
      default: [],
      description: 'proxyGroup.use.description',
    },
    {
      // Restricted to the group's own members: mihomo silently falls back to
      // the first member when this names anything else.
      fieldKey: 'config.default-selected',
      label: 'proxyGroup.defaultSelected.label',
      type: 'group-member-select',
      description: 'proxyGroup.defaultSelected.description',
      showIf: { field: 'type', operator: 'in', value: SELECTING_TYPES },
    },
    {
      fieldKey: 'config.url',
      label: 'proxyGroup.url.label',
      type: 'text',
      default: 'https://www.gstatic.com/generate_204',
      placeholder: 'https://www.gstatic.com/generate_204',
      description: 'proxyGroup.url.description',
      showIf: { field: 'type', operator: 'in', value: SELECTING_TYPES },
    },
    {
      fieldKey: 'config.interval',
      label: 'proxyGroup.interval.label',
      type: 'number',
      default: 300,
      placeholder: '300',
      description: 'proxyGroup.interval.description',
      // 0 is meaningful — it turns periodic testing off.
      min: 0,
      showIf: { field: 'type', operator: 'in', value: SELECTING_TYPES },
    },
    {
      fieldKey: 'config.timeout',
      label: 'proxyGroup.timeout.label',
      type: 'number',
      default: 5000,
      placeholder: '5000',
      description: 'proxyGroup.timeout.description',
      min: 0,
      showIf: { field: 'type', operator: 'in', value: SELECTING_TYPES },
    },
    {
      fieldKey: 'config.tolerance',
      label: 'proxyGroup.tolerance.label',
      type: 'number',
      default: 150,
      placeholder: '150',
      description: 'proxyGroup.tolerance.description',
      min: 0,
      showIf: { field: 'type', operator: 'eq', value: 'url-test' },
    },
    {
      fieldKey: 'config.lazy',
      label: 'proxyGroup.lazy.label',
      type: 'boolean',
      default: true,
      description: 'proxyGroup.lazy.description',
      showIf: { field: 'type', operator: 'in', value: SELECTING_TYPES },
    },
    {
      fieldKey: 'config.strategy',
      label: 'proxyGroup.strategy.label',
      type: 'select',
      default: 'consistent-hashing',
      description: 'proxyGroup.strategy.description',
      options: [
        { value: 'consistent-hashing', label: 'proxyGroup.strategy.consistentHashing' },
      // wait — keep below
        { value: 'round-robin', label: 'proxyGroup.strategy.roundRobin' },
        { value: 'sticky-sessions', label: 'proxyGroup.strategy.stickySessions' },
      ],
      showIf: { field: 'type', operator: 'eq', value: 'load-balance' },
    },
    {
      fieldKey: 'config.disable-udp',
      label: 'proxyGroup.disableUdp.label',
      type: 'boolean',
      default: false,
      description: 'proxyGroup.disableUdp.description',
    },
    {
      fieldKey: 'config.filter',
      label: 'proxyGroup.filter.label',
      type: 'text',
      placeholder: '^HK.*|^TW.*',
      description: 'proxyGroup.filter.description',
    },
    {
      fieldKey: 'config.exclude-filter',
      label: 'proxyGroup.excludeFilter.label',
      type: 'text',
      placeholder: 'expired|traffic',
      description: 'proxyGroup.excludeFilter.description',
    },
    // ---- Official common fields completed in phase 8 ----
    {
      fieldKey: 'config.exclude-type',
      label: 'proxyGroup.excludeType.label',
      type: 'text',
      placeholder: 'Shadowsocks|Http',
      description: 'proxyGroup.excludeType.description',
    },
    {
      fieldKey: 'config.expected-status',
      label: 'proxyGroup.expectedStatus.label',
      type: 'text',
      placeholder: '200/302/400-503',
      description: 'proxyGroup.expectedStatus.description',
    },
    {
      fieldKey: 'config.max-failed-times',
      label: 'proxyGroup.maxFailedTimes.label',
      type: 'number',
      min: 0,
      description: 'proxyGroup.maxFailedTimes.description',
    },
    {
      fieldKey: 'config.empty-fallback',
      label: 'proxyGroup.emptyFallback.label',
      type: 'text',
      placeholder: 'COMPATIBLE',
      description: 'proxyGroup.emptyFallback.description',
    },
    {
      fieldKey: 'config.hidden',
      label: 'proxyGroup.hidden.label',
      type: 'boolean',
      default: false,
      description: 'proxyGroup.hidden.description',
    },
    {
      fieldKey: 'config.icon',
      label: 'proxyGroup.icon.label',
      type: 'text',
      description: 'proxyGroup.icon.description',
    },
    {
      fieldKey: 'config.include-all-proxies',
      label: 'proxyGroup.includeAllProxies.label',
      type: 'boolean',
      default: false,
      description: 'proxyGroup.includeAllProxies.description',
    },
    {
      fieldKey: 'config.include-all-providers',
      label: 'proxyGroup.includeAllProviders.label',
      type: 'boolean',
      default: false,
      description: 'proxyGroup.includeAllProviders.description',
    },
  ],
};
