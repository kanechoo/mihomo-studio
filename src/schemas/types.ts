// Schema definitions for dynamic form rendering
// This enables adding new protocols/fields without changing UI code

export type FieldType =
  | 'text'
  | 'number'
  | 'port'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'proxy-multiselect'
  | 'provider-multiselect'
  | 'policy-select'
  | 'ruleset-select'
  | 'geoip-select'
  | 'geosite-select'
  | 'group-member-select'
  | 'dns-multiselect'
  | 'object'
  | 'array';

// Conditional rendering logic
export interface ShowIfCondition {
  field: string; // fieldKey to watch (supports dot notation)
  operator: 'eq' | 'neq' | 'in' | 'nin';
  value: any;
}

// A field pinned to one value while a condition holds.
//
// Not the same idea as `showIf`, which hides. A locked field stays on screen
// showing exactly what it is: the setting still matters and still ends up in the
// exported config, it simply is not the user's to choose while whatever decides
// it is selected.
export interface LockIfRule {
  when: ShowIfCondition | ShowIfCondition[];
  // Written to the field as soon as the condition holds, so the control and the
  // config cannot disagree.
  value: any;
  // i18n key for a line saying why, shown in place of the description. A control
  // that will not respond and does not say why reads as broken.
  reason?: string;
}

// Stable grouping identifiers for the client proxy form. The rendered title
// comes from `proxy.section.<name>`; order is fixed in the proxy schema module
// so every protocol reads the same left-to-right, top-to-bottom shape.
export type ProxySectionName =
  | 'basic'
  | 'protocol'
  | 'tls'
  | 'reality'
  | 'security'
  | 'ws'
  | 'grpc'
  | 'h2'
  | 'xhttp'
  | 'download'
  | 'http'
  | 'mkcp'
  | 'mekya'
  | 'multiplexer'
  | 'dial'
  | 'plugin'
  | 'obfs'
  | 'portHopping'
  | 'quic'
  | 'realm'
  | 'httpmask'
  | 'ipstack'
  | 'amneziawg'
  | 'vpn';

// Individual field schema definition
export interface FieldSchema {
  fieldKey: string; // Maps to IR path (supports dot notation like 'reality-opts.public-key')
  label: string; // Display label (will be translated via i18n)
  type: FieldType;
  default?: any;
  required?: boolean;
  placeholder?: string;
  description?: string; // Tooltip description

  // For select/multiselect types
  options?: Array<{
    value: string | number | boolean;
    label: string; // Will be translated via i18n
  }>;

  // Conditional rendering
  showIf?: ShowIfCondition | ShowIfCondition[];

  // Section this field belongs to in the proxy form. Optional: when omitted it
  // is derived from `fieldKey` by the proxy schema classifier so protocol
  // files do not repeat the same transport-block mapping 26 times.
  section?: ProxySectionName;

  // Visibility tier. Optional: when omitted it follows the section (TLS and
  // identity fields are basic; transport/dial/security blocks are advanced).
  level?: 'basic' | 'advanced';

  // Held at a fixed value, and not editable, while the condition holds.
  lockIf?: LockIfRule;

  // Unconditionally locked: rendered disabled with `lockReason` shown instead
  // of the description. Used where a value identifies the object being edited
  // (a proxy node's protocol type) rather than being one of its settings.
  locked?: boolean;
  lockReason?: string;

  // For textarea fields: treat each non-empty line as one item of a string[],
  // rather than storing the raw text. Needed so a field that starts out empty
  // still saves as a list.
  asList?: boolean;

  // For array types
  arrayItemSchema?: FieldSchema;

  // For object types (nested fields)
  objectFields?: FieldSchema[];

  // Validation constraints
  min?: number;
  max?: number;
  pattern?: string; // Regex pattern for validation

  /**
   * Offer a generate button producing protocol-correct random material:
   * 'uuid' → RFC4122 v4, 'password' → CSPRNG password, 'token' → base64url,
   * 'ss2022-16'/'ss2022-32' → Shadowsocks-2022 key material (base64 of
   * exactly that many bytes, as the cipher requires), 'base64-32' →
   * WireGuard-shaped 32-byte key.
   */
  generator?: 'uuid' | 'password' | 'token' | 'ss2022-16' | 'ss2022-32' | 'base64-32';
  /** Option-value-dependent generator; wins over `generator` when it matches. */
  generatorByOption?: {
    field: string;
    kinds: Record<string, NonNullable<FieldSchema['generator']>>;
  };
  /**
   * The field holds the private half of an algorithm-bound key pair.
   * Generating fills the field with the private half and surfaces the derived
   * public half to copy to the peer — a plain random string would be invalid.
   */
  keypair?: 'x25519';
}

// Module schema (group of fields)
export interface ModuleSchema {
  moduleKey: string; // 'general', 'dns', 'proxies', etc.
  label: string;
  description?: string;
  icon?: string; // Icon name for tab
  fields: FieldSchema[];
}

// Complete configuration schema
export interface ConfigSchema {
  version: string;
  modules: ModuleSchema[];
}

// Type guard helpers
export function isArrayField(field: FieldSchema): boolean {
  return field.type === 'array';
}

export function isObjectField(field: FieldSchema): boolean {
  return field.type === 'object';
}

export function isSelectField(field: FieldSchema): boolean {
  return field.type === 'select' || field.type === 'multiselect';
}
