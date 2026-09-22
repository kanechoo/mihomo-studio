import type { FieldSchema, ShowIfCondition } from '../types';

// Sniffer section. The three per-protocol enables are IR keys spelled ui-*;
// the exporter strips every ui-* key and turns a protocol block into the
// official upper-case entry (`HTTP`/`TLS`/`QUIC`).
const ON: ShowIfCondition = { field: 'enable', operator: 'eq', value: true };

function protoBlock(proto: string, labelKey: string): FieldSchema[] {
  return [
    {
      fieldKey: `sniff.${proto}.enabled`,
      label: `${labelKey}.label`,
      type: 'boolean',
      default: false,
      description: `sniffer.protoEnabled.description`,
    },
    {
      fieldKey: `sniff.${proto}.ports`,
      label: 'sniffer.protoPorts.label',
      type: 'textarea',
      asList: true,
      placeholder: proto === 'HTTP' ? '80\n8080-8880' : '443\n8443',
      description: 'sniffer.protoPorts.description',
      showIf: [{ field: 'enable', operator: 'eq', value: true }, { field: `sniff.${proto}.enabled`, operator: 'eq', value: true }],
    },
  ];
}

export const snifferSchema: FieldSchema[] = [
  {
    fieldKey: 'enable',
    label: 'sniffer.enable.label',
    type: 'boolean',
    default: false,
    description: 'sniffer.enable.description',
  },
  {
    fieldKey: 'force-dns-mapping',
    label: 'sniffer.forceDnsMapping.label',
    type: 'boolean',
    default: false,
    description: 'sniffer.forceDnsMapping.description',
    showIf: ON,
  },
  {
    fieldKey: 'parse-pure-ip',
    label: 'sniffer.parsePureIp.label',
    type: 'boolean',
    default: false,
    description: 'sniffer.parsePureIp.description',
    showIf: ON,
  },
  {
    fieldKey: 'override-destination',
    label: 'sniffer.overrideDestination.label',
    type: 'boolean',
    default: false,
    description: 'sniffer.overrideDestination.description',
    showIf: ON,
  },
  ...protoBlock('http', 'sniffer.protoHttp'),
  ...protoBlock('tls', 'sniffer.protoTls'),
  ...protoBlock('quic', 'sniffer.protoQuic'),
  {
    fieldKey: 'force-domain',
    label: 'sniffer.forceDomain.label',
    type: 'textarea',
    asList: true,
    placeholder: '+.v2ex.com',
    description: 'sniffer.domainList.description',
    showIf: ON,
  },
  {
    fieldKey: 'skip-domain',
    label: 'sniffer.skipDomain.label',
    type: 'textarea',
    asList: true,
    placeholder: 'Mijia Cloud',
    description: 'sniffer.domainList.description',
    showIf: ON,
  },
  {
    fieldKey: 'skip-src-address',
    label: 'sniffer.skipSrcAddress.label',
    type: 'textarea',
    asList: true,
    placeholder: '192.168.0.3/32',
    description: 'sniffer.addrList.description',
    showIf: ON,
  },
  {
    fieldKey: 'skip-dst-address',
    label: 'sniffer.skipDstAddress.label',
    type: 'textarea',
    asList: true,
    placeholder: '192.168.0.3/32',
    description: 'sniffer.addrList.description',
    showIf: ON,
  },
];
