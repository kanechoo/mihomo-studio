import type { FieldSchema } from '../../types';
import { getProtocolDisplayName } from '../../../data/protocols';

// Field groups shared by several outbound protocols, defined once so the
// schemas stay data rather than copies (mihomo documents these once on the
// proxy common-fields page: wiki.metacubex.one/config/proxies/).

/**
 * The outbound dial family: interface binding, routing mark, TCP fast open,
 * multipath TCP and chain-dialling through another proxy. Every TCP/UDP
 * outbound accepts them; protocols whose transport is QUIC-only (hysteria2,
 * tuic) still accept interface-name/routing-mark/dialer-proxy but ignore
 * tfo/mptcp, which mihomo applies to TCP dials only.
 */
export function dialFamilyFields(options: { tcpOnlyOptions?: boolean } = {}): FieldSchema[] {
  const fields: FieldSchema[] = [
    {
      fieldKey: 'config.interface-name',
      label: 'proxy.dial.interfaceName.label',
      type: 'text',
      placeholder: 'en0',
      description: 'proxy.dial.interfaceName.description',
    },
    {
      fieldKey: 'config.routing-mark',
      label: 'proxy.dial.routingMark.label',
      type: 'number',
      min: 0,
      max: 4294967295,
      description: 'proxy.dial.routingMark.description',
    },
    {
      fieldKey: 'config.dialer-proxy',
      label: 'proxy.dial.dialerProxy.label',
      type: 'text',
      placeholder: 'another-proxy',
      description: 'proxy.dial.dialerProxy.description',
    },
  ];
  if (options.tcpOnlyOptions !== false) {
    fields.push(
      {
        fieldKey: 'config.tfo',
        label: 'proxy.dial.tfo.label',
        type: 'boolean',
        default: false,
        description: 'proxy.dial.tfo.description',
      },
      {
        fieldKey: 'config.mptcp',
        label: 'proxy.dial.mptcp.label',
        type: 'boolean',
        default: false,
        description: 'proxy.dial.mptcp.description',
      }
    );
  }
  return fields.map((field) => {
    field.section = 'dial';
    return field;
  });
}

/**
 * TLS certificate pinning pair: `fingerprint` pins the server certificate
 * (SSL pinning), while `certificate` + `private-key` together enable mTLS —
 * mihomo requires both before it sends a client certificate.
 */
export function tlsMaterialFields(): FieldSchema[] {
  const fields: FieldSchema[] = [
    {
      fieldKey: 'config.fingerprint',
      label: 'proxy.commonTls.fingerprint.label',
      type: 'text',
      placeholder: 'sha256 fingerprint',
      description: 'proxy.commonTls.fingerprint.description',
      showIf: { field: 'config.tls', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.certificate',
      label: 'proxy.commonTls.certificate.label',
      type: 'textarea',
      description: 'proxy.commonTls.certificate.description',
      showIf: [
        { field: 'config.certificate', operator: 'neq', value: undefined },
        { field: 'config.private-key', operator: 'neq', value: undefined },
      ],
    },
    {
      fieldKey: 'config.private-key',
      label: 'proxy.commonTls.privateKey.label',
      type: 'textarea',
      description: 'proxy.commonTls.privateKey.description',
      showIf: [
        { field: 'config.certificate', operator: 'neq', value: undefined },
        { field: 'config.private-key', operator: 'neq', value: undefined },
      ],
    },
  ];
  return fields.map((field) => {
    field.section = 'tls';
    field.level = 'advanced';
    return field;
  });
}

/** sing-mux multiplexing block, valid on TCP-transported protocols. */
export function smuxFields(): FieldSchema[] {
  const fields: FieldSchema[] = [
    {
      fieldKey: 'config.smux.enabled',
      label: 'proxy.smux.enabled.label',
      type: 'boolean',
      default: false,
      description: 'proxy.smux.enabled.description',
    },
    {
      fieldKey: 'config.smux.protocol',
      label: 'proxy.smux.protocol.label',
      type: 'select',
      default: 'h2mux',
      description: 'proxy.smux.protocol.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
      options: [
        { value: 'smux', label: 'smux' },
        { value: 'yamux', label: 'yamux' },
        { value: 'h2mux', label: 'h2mux' },
      ],
    },
    {
      fieldKey: 'config.smux.max-connections',
      label: 'proxy.smux.maxConnections.label',
      type: 'number',
      min: 0,
      description: 'proxy.smux.maxConnections.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.min-streams',
      label: 'proxy.smux.minStreams.label',
      type: 'number',
      min: 0,
      description: 'proxy.smux.minStreams.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.max-streams',
      label: 'proxy.smux.maxStreams.label',
      type: 'number',
      min: 0,
      description: 'proxy.smux.maxStreams.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.padding',
      label: 'proxy.smux.padding.label',
      type: 'boolean',
      default: false,
      description: 'proxy.smux.padding.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.statistic',
      label: 'proxy.smux.statistic.label',
      type: 'boolean',
      default: false,
      description: 'proxy.smux.statistic.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.only-tcp',
      label: 'proxy.smux.onlyTcp.label',
      type: 'boolean',
      default: false,
      description: 'proxy.smux.onlyTcp.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.brutal-opts.enabled',
      label: 'proxy.smux.brutalEnabled.label',
      type: 'boolean',
      default: false,
      description: 'proxy.smux.brutalEnabled.description',
      showIf: { field: 'config.smux.enabled', operator: 'eq', value: true },
    },
    {
      fieldKey: 'config.smux.brutal-opts.up',
      label: 'proxy.smux.brutalUp.label',
      type: 'number',
      min: 0,
      description: 'proxy.smux.brutalUp.description',
      showIf: [
        { field: 'config.smux.enabled', operator: 'eq', value: true },
        { field: 'config.smux.brutal-opts.enabled', operator: 'eq', value: true },
      ],
    },
    {
      fieldKey: 'config.smux.brutal-opts.down',
      label: 'proxy.smux.brutalDown.label',
      type: 'number',
      min: 0,
      description: 'proxy.smux.brutalDown.description',
      showIf: [
        { field: 'config.smux.enabled', operator: 'eq', value: true },
        { field: 'config.smux.brutal-opts.enabled', operator: 'eq', value: true },
      ],
    },
  ];
  return fields.map((field) => {
    field.section = 'multiplexer';
    return field;
  });
}

/** Standard header fields every proxy schema opens with. */
export function headerFields(type: string, typeLabel: string, portDefault = 443): FieldSchema[] {
  // The registry is the display-name source of truth; the per-schema literal
  // remains only as a fallback for a type that has not been registered yet.
  const label = getProtocolDisplayName(type) || typeLabel;
  const fields: FieldSchema[] = [
    {
      fieldKey: 'name',
      label: 'proxy.name.label',
      type: 'text',
      required: true,
      placeholder: `${label}-Node-01`,
      description: 'proxy.name.description',
    },
    {
      fieldKey: 'type',
      label: 'proxy.type.label',
      type: 'select',
      default: type,
      required: true,
      // The protocol is what this modal is editing — it chose the schema, so
      // switching it here is not an edit but a different object. Shown locked
      // with the reason instead of hidden, so the setting stays visible.
      locked: true,
      lockReason: 'proxy.type.locked',
      options: [{ value: type, label }],
    },
    {
      fieldKey: 'server',
      label: 'proxy.server.label',
      type: 'text',
      required: true,
      placeholder: 'example.com',
      description: 'proxy.server.description',
    },
    {
      fieldKey: 'port',
      label: 'proxy.port.label',
      type: 'port',
      required: true,
      default: portDefault,
      min: 1,
      max: 65535,
    },
  ];
  return fields.map((field) => {
    field.section = 'basic';
    return field;
  });
}

/**
 * The four optional TLS-security layers mihomo layers over a TLS hop
 * (ECH, ShadowTLS, Restls, JLS), gated by a form-only selector key whose
 * value the exporter strips (see UI_ONLY_CONFIG_KEYS). Used by protocols
 * that document these blocks without an `enable` flag of their own.
 */
export function securityLayerFields(selectorField: string): FieldSchema[] {
  const sel = { field: selectorField, operator: 'eq' as const };
  const fields: FieldSchema[] = [
    {
      fieldKey: 'config.ech-opts.enable',
      label: 'proxy.ech.enable.label',
      type: 'boolean',
      default: false,
      description: 'proxy.ech.enable.description',
      showIf: { ...sel, value: 'ech' },
    },
    {
      fieldKey: 'config.ech-opts.config',
      label: 'proxy.ech.config.label',
      type: 'textarea',
      placeholder: 'AEn+DQBF...',
      description: 'proxy.ech.config.description',
      showIf: [{ ...sel, value: 'ech' }, { field: 'config.ech-opts.enable', operator: 'eq', value: true }],
    },
    {
      fieldKey: 'config.shadow-tls-opts.version',
      label: 'proxy.shadowTls.version.label',
      type: 'select',
      default: 3,
      description: 'proxy.shadowTls.version.description',
      showIf: { ...sel, value: 'shadow-tls' },
      options: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
    },
    {
      fieldKey: 'config.shadow-tls-opts.password',
      label: 'proxy.shadowTls.password.label',
      type: 'text',
      required: true,
      description: 'proxy.shadowTls.password.description',
      showIf: { ...sel, value: 'shadow-tls' },
    },
    {
      fieldKey: 'config.restls-opts.password',
      label: 'proxy.common.password.label',
      type: 'text',
      required: true,
      description: 'proxy.common.password.description',
      showIf: { ...sel, value: 'restls' },
    },
    {
      fieldKey: 'config.restls-opts.version-hint',
      label: 'proxy.restls.versionHint.label',
      type: 'select',
      default: 'tls13',
      description: 'proxy.restls.versionHint.description',
      showIf: { ...sel, value: 'restls' },
      options: [
        { value: 'tls13', label: 'tls13' },
        { value: 'tls12', label: 'tls12' },
      ],
    },
    {
      fieldKey: 'config.restls-opts.restls-script',
      label: 'proxy.restls.script.label',
      type: 'text',
      description: 'proxy.restls.script.description',
      showIf: { ...sel, value: 'restls' },
    },
    {
      fieldKey: 'config.jls-opts.username',
      label: 'proxy.jls.username.label',
      type: 'text',
      required: true,
      description: 'proxy.jls.username.description',
      showIf: { ...sel, value: 'jls' },
    },
    {
      fieldKey: 'config.jls-opts.password',
      label: 'proxy.jls.password.label',
      type: 'text',
      required: true,
      description: 'proxy.jls.password.description',
      showIf: { ...sel, value: 'jls' },
    },
  ];
  return fields.map((field) => {
    field.section = 'security';
    return field;
  });
}
