export type ListenerSectionName =
  | 'common'
  | 'auth'
  | 'transport'
  | 'tls'
  | 'security'
  | 'protocol';

export type ServerFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'port-expression'
  | 'secret-text'
  | 'pem'
  | 'kv-map'
  | 'user-list'
  | 'tag-list';

export interface ServerShowIf {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'nin';
  value: unknown;
}

export interface ServerOption {
  value: string | number;
  labelKey?: string;
  label?: string;
}

export type ServerGenerator =
  | 'uuid'
  | 'password'
  | 'token'
  | 'short-id'
  | 'hex'
  | 'base64'
  | 'ss2022-16'
  | 'ss2022-32';

/**
 * Cipher-dependent generation: the watched field's current value selects the
 * generator kind. Used where the correct random value depends on a sibling
 * option — e.g. a Shadowsocks-2022 password must be base64 of exactly the key
 * length the chosen cipher demands, while legacy ciphers take any password.
 */
export interface GeneratorByOption {
  field: string;
  kinds: Record<string, ServerGenerator>;
}

export interface ServerFieldDef {
  key: string;
  /** Stable DOM/react identifier for defs sharing one storage path. */
  id?: string;
  labelKey: string;
  section: ListenerSectionName;
  type: ServerFieldType;
  level?: 'basic' | 'advanced';
  default?: unknown;
  required?: boolean;
  requiredWhen?: ServerShowIf[];
  showIf?: ServerShowIf[];
  conflictsWith?: string[];
  options?: ServerOption[];
  placeholderKey?: string;
  descriptionKey?: string;
  pattern?: string;
  min?: number;
  max?: number;
  generator?: ServerGenerator;
  /** Option-value-dependent generator; wins over `generator` when it matches. */
  generatorByOption?: GeneratorByOption;
  /**
   * The field holds one half of an algorithm-bound key pair. Generating fills
   * the field with the private half and surfaces the public half to copy into
   * clients — a plain random string would be invalid here.
   */
  keypair?: 'reality';
  sensitive?: boolean;
  itemFields?: ServerFieldDef[];
  keyPlaceholderKey?: string;
  valuePlaceholderKey?: string;
  docUrl?: string;
}

export interface SectionedFields {
  section: ListenerSectionName;
  fields: ServerFieldDef[];
}

export type ListenerCategory =
  | 'app-proxy'
  | 'transparent'
  | 'encrypted'
  | 'quic'
  | 'other';

export type ShareSupport = 'supported' | 'unsupported';

export interface CapabilityFlags {
  tls: boolean;
  reality: boolean;
  mtls: boolean;
  ech: boolean;
  ws: boolean;
  grpc: boolean;
  xhttp: boolean;
  udp: boolean;
  quic: boolean;
}

export interface ListenerSchema {
  kind: import('../../core/server/types').ListenerKind;
  yamlType: string;
  tuicVersion?: import('../../core/server/types').TuicVersion;
  category: ListenerCategory;
  labelKey: string;
  descriptionKey: string;
  portMode: 'single' | 'ports' | 'none';
  supportsUdpField: boolean;
  capability: CapabilityFlags;
  shareUri: ShareSupport;
  docUrl: string;
  lastVerifiedAt?: string;
  fields: ServerFieldDef[];
}

export interface SchemaSeed {
  kind: import('../../core/server/types').ListenerKind;
  tuicVersion?: import('../../core/server/types').TuicVersion;
  category: ListenerCategory;
  labelKey: string;
  descriptionKey: string;
  portMode?: 'single' | 'ports' | 'none';
  supportsUdpField?: boolean;
  capability?: Partial<CapabilityFlags>;
  shareUri?: ShareSupport;
  docUrl: string;
  fields?: ServerFieldDef[];
  /** Date this seed was last checked against the official page. */
  lastVerifiedAt?: string;
}

export function groupBySection(fields: ServerFieldDef[]): SectionedFields[] {
  const order: ListenerSectionName[] = [
    'common',
    'auth',
    'transport',
    'tls',
    'security',
    'protocol',
  ];
  const bySection = new Map<ListenerSectionName, ServerFieldDef[]>();
  for (const def of fields) {
    if (!bySection.has(def.section)) bySection.set(def.section, []);
    bySection.get(def.section)!.push(def);
  }
  return order
    .filter((section) => bySection.has(section))
    .map((section) => ({ section, fields: bySection.get(section)! }));
}

export function filterByLevel(
  fields: ServerFieldDef[],
  level: 'basic' | 'advanced'
): ServerFieldDef[] {
  if (level === 'advanced') return fields;
  return fields.filter((def) => def.level !== 'advanced');
}

export function isVisible(def: ServerFieldDef, values: Record<string, unknown>): boolean {
  if (!def.showIf || def.showIf.length === 0) return true;
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      values
    );
  return def.showIf.every((condition) => {
    const actual = get(condition.field);
    switch (condition.operator) {
      case 'eq':
        return actual === condition.value;
      case 'neq':
        return actual !== condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(actual);
      case 'nin':
        return Array.isArray(condition.value) && !condition.value.includes(actual);
      default:
        return true;
    }
  });
}
