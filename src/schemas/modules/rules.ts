import type { ModuleSchema } from '../types';

// Per-type authoring hints for the rule payload field.
//
// One generic placeholder ("google.com") cannot describe 30+ rule types: a
// DST-PORT rule takes `443`, a PROCESS-NAME rule takes `curl`, an IP-ASN rule
// takes `13335`. Every entry below is taken from the official rule reference
// (wiki.metacubex.one/config/rules/), examples included. Adding a new rule
// type means adding a row here and two locale strings — no component changes.
//
// Types whose payload is picked rather than typed (GEOSITE, GEOIP, RULE-SET)
// or absent (MATCH) are listed too so the description text stays per-type.
export interface RuleTypeHint {
  /** input placeholder for typed payloads */
  placeholder?: string;
  /** i18n key with the type-specific explanation */
  descriptionKey: string;
  /** HTML pattern for lightweight client-side format checking */
  pattern?: string;
}

const DOMAIN_PATTERN = '^[a-zA-Z0-9*?._-]+$';
const CIDR_PATTERN = '^[0-9a-fA-F.:]+/\\d{1,3}$';
const PORT_PATTERN = '^\\d{1,5}(-\\d{1,5})?$';

export const RULE_TYPE_HINTS: Record<string, RuleTypeHint> = {
  DOMAIN: { placeholder: 'example.com', descriptionKey: 'rule.hint.DOMAIN.description', pattern: DOMAIN_PATTERN },
  'DOMAIN-SUFFIX': { placeholder: 'example.com', descriptionKey: 'rule.hint.DOMAIN-SUFFIX.description', pattern: DOMAIN_PATTERN },
  'DOMAIN-KEYWORD': { placeholder: 'google', descriptionKey: 'rule.hint.DOMAIN-KEYWORD.description' },
  'DOMAIN-WILDCARD': { placeholder: '*.google.com', descriptionKey: 'rule.hint.DOMAIN-WILDCARD.description', pattern: '^[a-zA-Z0-9*?._-]+$' },
  'DOMAIN-REGEX': { placeholder: '^abc.*com', descriptionKey: 'rule.hint.DOMAIN-REGEX.description' },
  GEOSITE: { placeholder: 'youtube', descriptionKey: 'rule.hint.GEOSITE.description' },
  'IP-CIDR': { placeholder: '192.168.1.0/24', descriptionKey: 'rule.hint.IP-CIDR.description', pattern: CIDR_PATTERN },
  'IP-CIDR6': { placeholder: '2620:0:2d0:200::7/32', descriptionKey: 'rule.hint.IP-CIDR6.description', pattern: CIDR_PATTERN },
  'IP-SUFFIX': { placeholder: '8.8.8.8/24', descriptionKey: 'rule.hint.IP-SUFFIX.description', pattern: CIDR_PATTERN },
  'IP-ASN': { placeholder: '13335', descriptionKey: 'rule.hint.IP-ASN.description', pattern: '^\\d+$' },
  GEOIP: { placeholder: 'CN', descriptionKey: 'rule.hint.GEOIP.description' },
  'SRC-GEOIP': { placeholder: 'cn', descriptionKey: 'rule.hint.SRC-GEOIP.description' },
  'SRC-IP-ASN': { placeholder: '9808', descriptionKey: 'rule.hint.SRC-IP-ASN.description', pattern: '^\\d+$' },
  'SRC-IP-CIDR': { placeholder: '192.168.1.201/32', descriptionKey: 'rule.hint.SRC-IP-CIDR.description', pattern: CIDR_PATTERN },
  'SRC-IP-SUFFIX': { placeholder: '192.168.1.201/8', descriptionKey: 'rule.hint.SRC-IP-SUFFIX.description', pattern: CIDR_PATTERN },
  'DST-PORT': { placeholder: '443', descriptionKey: 'rule.hint.DST-PORT.description', pattern: PORT_PATTERN },
  'SRC-PORT': { placeholder: '7777', descriptionKey: 'rule.hint.SRC-PORT.description', pattern: PORT_PATTERN },
  'IN-PORT': { placeholder: '7890', descriptionKey: 'rule.hint.IN-PORT.description', pattern: PORT_PATTERN },
  'IN-TYPE': { placeholder: 'SOCKS/HTTP', descriptionKey: 'rule.hint.IN-TYPE.description', pattern: '^[A-Za-z/]+$' },
  'IN-USER': { placeholder: 'mihomo', descriptionKey: 'rule.hint.IN-USER.description' },
  'IN-NAME': { placeholder: 'ss-in', descriptionKey: 'rule.hint.IN-NAME.description' },
  'REMATCH-NAME': { placeholder: 'rematch1', descriptionKey: 'rule.hint.REMATCH-NAME.description' },
  'PROCESS-PATH': { placeholder: '/usr/bin/wget', descriptionKey: 'rule.hint.PROCESS-PATH.description' },
  'PROCESS-PATH-WILDCARD': { placeholder: '/usr/*/wget', descriptionKey: 'rule.hint.PROCESS-PATH-WILDCARD.description' },
  'PROCESS-PATH-REGEX': { placeholder: '.*bin/wget', descriptionKey: 'rule.hint.PROCESS-PATH-REGEX.description' },
  'PROCESS-NAME': { placeholder: 'curl', descriptionKey: 'rule.hint.PROCESS-NAME.description' },
  'PROCESS-NAME-WILDCARD': { placeholder: '*telegram*', descriptionKey: 'rule.hint.PROCESS-NAME-WILDCARD.description' },
  'PROCESS-NAME-REGEX': { placeholder: '(?i)Telegram', descriptionKey: 'rule.hint.PROCESS-NAME-REGEX.description' },
  UID: { placeholder: '1001', descriptionKey: 'rule.hint.UID.description', pattern: '^\\d+$' },
  NETWORK: { placeholder: 'udp', descriptionKey: 'rule.hint.NETWORK.description', pattern: '^(tcp|udp)$' },
  DSCP: { placeholder: '4', descriptionKey: 'rule.hint.DSCP.description', pattern: '^\\d{1,2}$' },
  'RULE-SET': { placeholder: 'providername', descriptionKey: 'rule.hint.RULE-SET.description' },
  AND: { placeholder: '((DOMAIN,baidu.com),(NETWORK,UDP))', descriptionKey: 'rule.hint.AND.description' },
  OR: { placeholder: '((NETWORK,UDP),(DOMAIN,baidu.com))', descriptionKey: 'rule.hint.OR.description' },
  NOT: { placeholder: '((DOMAIN,baidu.com))', descriptionKey: 'rule.hint.NOT.description' },
  'SUB-RULE': { placeholder: '(NETWORK,tcp)', descriptionKey: 'rule.hint.SUB-RULE.description' },
  MATCH: { descriptionKey: 'rule.hint.MATCH.description' },
};

// Rules Configuration schema
export const rulesSchema: ModuleSchema = {
  moduleKey: 'rules',
  label: 'rule.title',
  description: 'rule.description',
  icon: 'filter',
  fields: [
    {
      fieldKey: 'type',
      label: 'rule.type.label',
      type: 'select',
      default: 'DOMAIN-SUFFIX',
      required: true,
      description: 'rule.type.description',
      options: [
        { value: 'DOMAIN', label: 'DOMAIN' },
        { value: 'DOMAIN-SUFFIX', label: 'DOMAIN-SUFFIX' },
        { value: 'DOMAIN-KEYWORD', label: 'DOMAIN-KEYWORD' },
        { value: 'DOMAIN-WILDCARD', label: 'DOMAIN-WILDCARD' },
        { value: 'DOMAIN-REGEX', label: 'DOMAIN-REGEX' },
        { value: 'GEOSITE', label: 'GEOSITE' },
        { value: 'IP-CIDR', label: 'IP-CIDR' },
        { value: 'IP-CIDR6', label: 'IP-CIDR6' },
        { value: 'IP-SUFFIX', label: 'IP-SUFFIX' },
        { value: 'IP-ASN', label: 'IP-ASN' },
        { value: 'GEOIP', label: 'GEOIP' },
        { value: 'SRC-GEOIP', label: 'SRC-GEOIP' },
        { value: 'SRC-IP-ASN', label: 'SRC-IP-ASN' },
        { value: 'SRC-IP-CIDR', label: 'SRC-IP-CIDR' },
        { value: 'SRC-IP-SUFFIX', label: 'SRC-IP-SUFFIX' },
        { value: 'DST-PORT', label: 'DST-PORT' },
        { value: 'SRC-PORT', label: 'SRC-PORT' },
        { value: 'IN-PORT', label: 'IN-PORT' },
        { value: 'IN-TYPE', label: 'IN-TYPE' },
        { value: 'IN-USER', label: 'IN-USER' },
        { value: 'IN-NAME', label: 'IN-NAME' },
        { value: 'REMATCH-NAME', label: 'REMATCH-NAME' },
        { value: 'PROCESS-PATH', label: 'PROCESS-PATH' },
        { value: 'PROCESS-PATH-WILDCARD', label: 'PROCESS-PATH-WILDCARD' },
        { value: 'PROCESS-PATH-REGEX', label: 'PROCESS-PATH-REGEX' },
        { value: 'PROCESS-NAME', label: 'PROCESS-NAME' },
        { value: 'PROCESS-NAME-WILDCARD', label: 'PROCESS-NAME-WILDCARD' },
        { value: 'PROCESS-NAME-REGEX', label: 'PROCESS-NAME-REGEX' },
        { value: 'UID', label: 'UID' },
        { value: 'NETWORK', label: 'NETWORK' },
        { value: 'DSCP', label: 'DSCP' },
        { value: 'RULE-SET', label: 'RULE-SET' },
        { value: 'AND', label: 'AND' },
        { value: 'OR', label: 'OR' },
        { value: 'NOT', label: 'NOT' },
        { value: 'SUB-RULE', label: 'SUB-RULE' },
        { value: 'MATCH', label: 'MATCH' },
      ],
    },
    {
      fieldKey: 'payload',
      label: 'rule.payload.label',
      type: 'text',
      required: true,
      placeholder: 'google.com',
      description: 'rule.payload.description',
      showIf: { field: 'type', operator: 'nin', value: ['MATCH', 'RULE-SET', 'GEOIP', 'GEOSITE'] },
    },
    {
      // Same IR field again: a GEOSITE payload names a category in the geosite
      // database. mihomo takes one per rule, so picking several here fans out
      // into one rule each on save.
      fieldKey: 'payload',
      label: 'rule.geosite.label',
      type: 'geosite-select',
      required: true,
      description: 'rule.geosite.description',
      showIf: { field: 'type', operator: 'eq', value: 'GEOSITE' },
    },
    {
      // Same IR field again: a GEOIP payload is one of a fixed set of database
      // codes, so it is picked rather than typed.
      fieldKey: 'payload',
      label: 'rule.geoip.label',
      type: 'geoip-select',
      required: true,
      description: 'rule.geoip.description',
      showIf: { field: 'type', operator: 'eq', value: 'GEOIP' },
    },
    {
      // Same IR field as above, but RULE-SET payloads are provider names, so
      // they get picked from the defined providers instead of typed by hand.
      fieldKey: 'payload',
      label: 'rule.ruleSet.label',
      type: 'ruleset-select',
      required: true,
      showIf: { field: 'type', operator: 'eq', value: 'RULE-SET' },
    },
    {
      fieldKey: 'policy',
      label: 'rule.policy.label',
      type: 'policy-select',
      required: true,
      placeholder: 'Proxy',
      description: 'rule.policy.description',
    },
    {
      fieldKey: 'no-resolve',
      label: 'rule.noResolve.label',
      type: 'boolean',
      default: false,
      description: 'rule.noResolve.description',
      showIf: {
        field: 'type',
        operator: 'in',
        value: [
          'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX', 'IP-ASN', 'GEOIP',
        ],
      },
    },
    {
      // `src` re-targets a destination-IP rule at the source address
      // (official additional parameter).
      fieldKey: 'src',
      label: 'rule.src.label',
      type: 'boolean',
      default: false,
      description: 'rule.src.description',
      showIf: {
        field: 'type',
        operator: 'in',
        value: [
          'IP-CIDR', 'IP-CIDR6', 'IP-SUFFIX', 'IP-ASN', 'GEOIP',
        ],
      },
    },
  ],
};

/**
 * The rule schema with the payload field's hint texts bound to one specific
 * type. The edit modal recomputes this whenever the selected type changes, so
 * placeholder/description/pattern always describe exactly what mihomo expects
 * for the current selection. Widget-driven types keep their dedicated pickers;
 * only the free-text payload is retuned here.
 */
export function rulesSchemaForType(type: string): ModuleSchema {
  const hint = RULE_TYPE_HINTS[type];
  if (!hint) return rulesSchema;

  const fields = rulesSchema.fields.map((field) => {
    if (field.fieldKey !== 'payload' || field.type !== 'text') return field;
    return {
      ...field,
      ...(hint.placeholder !== undefined ? { placeholder: hint.placeholder } : {}),
      description: hint.descriptionKey,
      ...(hint.pattern ? { pattern: hint.pattern } : {}),
    };
  });
  return { ...rulesSchema, fields };
}
