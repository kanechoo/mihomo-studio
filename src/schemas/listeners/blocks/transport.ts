import type { ServerFieldDef } from '../dsl';

type Show = ServerFieldDef['showIf'];

function kindShow(kind: string): Show {
  return [{ field: 'transport.kind', operator: 'eq', value: kind }];
}

export function transportKindField(
  options: { value: string; labelKey: string }[]
): ServerFieldDef {
  return {
    key: 'transport.kind',
    labelKey: 'server.transport.kind.label',
    descriptionKey: 'server.transport.kind.description',
    section: 'transport',
    type: 'select',
    default: options[0]?.value ?? 'tcp',
    options,
  };
}

export const TRANSPORT_TCP_OPTION = { value: 'tcp', labelKey: 'server.transport.tcp' };
export const TRANSPORT_WS_OPTION = { value: 'ws', labelKey: 'server.transport.ws' };
export const TRANSPORT_GRPC_OPTION = { value: 'grpc', labelKey: 'server.transport.grpc' };
export const TRANSPORT_XHTTP_OPTION = { value: 'xhttp', labelKey: 'server.transport.xhttp' };
export const TRANSPORT_MEKYA_OPTION = { value: 'mekya', labelKey: 'server.transport.mekya' };
export const TRANSPORT_MKCP_OPTION = { value: 'mkcp', labelKey: 'server.transport.mkcp' };

export const WS_PATH_FIELD: ServerFieldDef = {
  key: 'transport.wsPath',
  labelKey: 'server.transport.wsPath.label',
  section: 'transport',
  type: 'text',
  placeholderKey: 'server.transport.wsPath.placeholder',
  showIf: kindShow('ws'),
};

export const GRPC_SERVICE_FIELD: ServerFieldDef = {
  key: 'transport.grpcServiceName',
  labelKey: 'server.transport.grpcServiceName.label',
  section: 'transport',
  type: 'text',
  placeholderKey: 'server.transport.grpcServiceName.placeholder',
  showIf: kindShow('grpc'),
};

function xhttp(
  key: string,
  labelKey: string,
  type: ServerFieldDef['type'],
  extra?: Partial<ServerFieldDef>
): ServerFieldDef {
  return {
    key: `transport.xhttp.${key}`,
    labelKey,
    section: 'transport',
    type,
    level: 'advanced',
    showIf: kindShow('xhttp'),
    ...extra,
  };
}

export const XHTTP_FIELDS: ServerFieldDef[] = [
  xhttp('path', 'server.xhttp.path.label', 'text', { placeholderKey: 'server.xhttp.path.placeholder' }),
  xhttp('host', 'server.xhttp.host.label', 'text'),
  xhttp('mode', 'server.xhttp.mode.label', 'select', {
    default: 'auto',
    options: [
      { value: '', labelKey: 'server.xhttp.mode.default' },
      { value: 'stream-one', labelKey: 'server.xhttp.mode.streamOne' },
      { value: 'stream-up', labelKey: 'server.xhttp.mode.streamUp' },
      { value: 'packet-up', labelKey: 'server.xhttp.mode.packetUp' },
    ],
  }),
  xhttp('noSseHeader', 'server.xhttp.noSseHeader.label', 'boolean'),
  xhttp('xPaddingBytes', 'server.xhttp.xPaddingBytes.label', 'text', {
    placeholderKey: 'server.xhttp.xPaddingBytes.placeholder',
  }),
  xhttp('xPaddingObfsMode', 'server.xhttp.xPaddingObfsMode.label', 'boolean'),
  xhttp('xPaddingKey', 'server.xhttp.xPaddingKey.label', 'text'),
  xhttp('xPaddingHeader', 'server.xhttp.xPaddingHeader.label', 'text'),
  xhttp('xPaddingPlacement', 'server.xhttp.xPaddingPlacement.label', 'select', {
    options: [
      { value: 'queryInHeader', labelKey: 'server.xhttp.placement.queryInHeader' },
      { value: 'cookie', labelKey: 'server.xhttp.placement.cookie' },
      { value: 'header', labelKey: 'server.xhttp.placement.header' },
      { value: 'query', labelKey: 'server.xhttp.placement.query' },
    ],
  }),
  xhttp('xPaddingMethod', 'server.xhttp.xPaddingMethod.label', 'select', {
    options: [
      { value: 'repeat-x', labelKey: 'server.xhttp.paddingMethod.repeatX' },
      { value: 'tokenish', labelKey: 'server.xhttp.paddingMethod.tokenish' },
    ],
  }),
  xhttp('uplinkHttpMethod', 'server.xhttp.uplinkHttpMethod.label', 'select', {
    options: [
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
      { value: 'PATCH', label: 'PATCH' },
      { value: 'DELETE', label: 'DELETE' },
    ],
  }),
  xhttp('sessionPlacement', 'server.xhttp.sessionPlacement.label', 'select', {
    options: [
      { value: 'path', labelKey: 'server.xhttp.session.path' },
      { value: 'query', labelKey: 'server.xhttp.session.query' },
      { value: 'cookie', labelKey: 'server.xhttp.session.cookie' },
      { value: 'header', labelKey: 'server.xhttp.session.header' },
    ],
  }),
  xhttp('sessionKey', 'server.xhttp.sessionKey.label', 'text'),
  xhttp('sessionTable', 'server.xhttp.sessionTable.label', 'select', {
    options: [
      { value: '', labelKey: 'server.xhttp.table.off' },
      { value: 'uuid', labelKey: 'server.xhttp.table.uuid' },
      { value: 'ALPHABET', label: 'ALPHABET' },
      { value: 'Alphabet', label: 'Alphabet' },
      { value: 'BASE36', label: 'BASE36' },
      { value: 'Base62', label: 'Base62' },
      { value: 'HEX', label: 'HEX' },
      { value: 'alphabet', label: 'alphabet' },
      { value: 'base36', label: 'base36' },
      { value: 'hex', label: 'hex' },
      { value: 'number', label: 'number' },
    ],
  }),
  xhttp('sessionLength', 'server.xhttp.sessionLength.label', 'text', {
    descriptionKey: 'server.xhttp.sessionLength.description',
    placeholderKey: 'server.xhttp.sessionLength.placeholder',
  }),
  xhttp('seqPlacement', 'server.xhttp.seqPlacement.label', 'select', {
    options: [
      { value: 'path', labelKey: 'server.xhttp.session.path' },
      { value: 'query', labelKey: 'server.xhttp.session.query' },
      { value: 'cookie', labelKey: 'server.xhttp.session.cookie' },
      { value: 'header', labelKey: 'server.xhttp.session.header' },
    ],
  }),
  xhttp('seqKey', 'server.xhttp.seqKey.label', 'text'),
  xhttp('uplinkDataPlacement', 'server.xhttp.uplinkDataPlacement.label', 'select', {
    options: [
      { value: 'body', labelKey: 'server.xhttp.data.body' },
      { value: 'cookie', labelKey: 'server.xhttp.data.cookie' },
      { value: 'header', labelKey: 'server.xhttp.data.header' },
    ],
  }),
  xhttp('uplinkDataKey', 'server.xhttp.uplinkDataKey.label', 'text'),
  xhttp('uplinkChunkSize', 'server.xhttp.uplinkChunkSize.label', 'number', { min: 0 }),
  xhttp('scMaxBufferedPosts', 'server.xhttp.scMaxBufferedPosts.label', 'number', { min: 0 }),
  xhttp('scStreamUpServerSecs', 'server.xhttp.scStreamUpServerSecs.label', 'text', {
    placeholderKey: 'server.xhttp.range20to80.placeholder',
  }),
  xhttp('scMaxEachPostBytes', 'server.xhttp.scMaxEachPostBytes.label', 'number', { min: 0 }),
];

const KCP_SHOW_FOR = (prefix: string): Show => [
  { field: 'transport.kind', operator: 'eq', value: prefix === 'transport.mekyaConfig' ? 'mekya' : 'mkcp' },
];

export function kcpCommonFields(configPrefix: string): ServerFieldDef[] {
  const show: Show = KCP_SHOW_FOR(configPrefix);
  const wrap = (def: ServerFieldDef): ServerFieldDef => ({ ...def, showIf: show });
  return [
    wrap({ key: `${configPrefix}.kcp.mtu`, labelKey: 'server.kcp.mtu.label', section: 'transport', type: 'number', level: 'advanced', min: 0 }),
    wrap({ key: `${configPrefix}.kcp.tti`, labelKey: 'server.kcp.tti.label', section: 'transport', type: 'number', level: 'advanced', min: 0 }),
    wrap({ key: `${configPrefix}.kcp.uplinkCapacity`, labelKey: 'server.kcp.uplink.label', section: 'transport', type: 'number', level: 'advanced', min: 0 }),
    wrap({ key: `${configPrefix}.kcp.downlinkCapacity`, labelKey: 'server.kcp.downlink.label', section: 'transport', type: 'number', level: 'advanced', min: 0 }),
    wrap({ key: `${configPrefix}.kcp.congestion`, labelKey: 'server.kcp.congestion.label', section: 'transport', type: 'boolean', level: 'advanced' }),
    wrap({ key: `${configPrefix}.kcp.writeBuffer`, labelKey: 'server.kcp.writeBuffer.label', section: 'transport', type: 'number', level: 'advanced', min: 0 }),
    wrap({ key: `${configPrefix}.kcp.readBuffer`, labelKey: 'server.kcp.readBuffer.label', section: 'transport', type: 'number', level: 'advanced', min: 0 }),
    wrap({ key: `${configPrefix}.kcp.seed`, labelKey: 'server.kcp.seed.label', descriptionKey: 'server.kcp.seed.description', section: 'transport', type: 'text', level: 'advanced' }),
    wrap({
      key: `${configPrefix}.kcp.header`,
      labelKey: 'server.kcp.header.label',
      section: 'transport',
      type: 'select',
      level: 'advanced',
      options: [
        { value: '', labelKey: 'server.kcp.header.none' },
        { value: 'srtp', label: 'srtp' },
        { value: 'utp', label: 'utp' },
        { value: 'wechat-video', label: 'wechat-video' },
        { value: 'dtls', label: 'dtls' },
        { value: 'wireguard', label: 'wireguard' },
      ],
    }),
  ];
}

export const MEKYA_FIELDS: ServerFieldDef[] = [
  {
    key: 'transport.mekyaConfig.maxWriteSize',
    labelKey: 'server.mekya.maxWriteSize.label',
    section: 'transport',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: kindShow('mekya'),
  },
  {
    key: 'transport.mekyaConfig.maxWriteDurationMs',
    labelKey: 'server.mekya.maxWriteDurationMs.label',
    section: 'transport',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: kindShow('mekya'),
  },
  {
    key: 'transport.mekyaConfig.maxSimultaneousWriteConnection',
    labelKey: 'server.mekya.maxSimultaneous.label',
    section: 'transport',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: kindShow('mekya'),
  },
  {
    key: 'transport.mekyaConfig.packetWritingBuffer',
    labelKey: 'server.mekya.packetWritingBuffer.label',
    section: 'transport',
    type: 'number',
    level: 'advanced',
    min: 0,
    showIf: kindShow('mekya'),
  },
  ...kcpCommonFields('transport.mekyaConfig'),
];

export const MKCP_FIELDS: ServerFieldDef[] = kcpCommonFields('transport.mkcpConfig');
