import type { FieldSchema } from '../../types';
import { dialFamilyFields, smuxFields, tlsMaterialFields } from './common';

// VLESS protocol schema.
//
// There is deliberately no `security` field: mihomo's vless proxy has no such
// key. TLS is the `tls` boolean, and REALITY is implied by the presence of
// `reality-opts` — so the two REALITY fields sit with the rest of the TLS
// settings, and a blank public key means the node simply is not a REALITY one.
export const vlessProxyFields: FieldSchema[] = [
  {
    fieldKey: 'name',
    label: 'proxy.name.label',
    type: 'text',
    required: true,
    placeholder: 'HK-Node-01',
    description: 'proxy.name.description',
  },
  {
    fieldKey: 'type',
    label: 'proxy.type.label',
    type: 'select',
    default: 'vless',
    required: true,
    options: [
      { value: 'vless', label: 'VLESS' },
    ],
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
    default: 443,
    min: 1,
    max: 65535,
  },
  {
    fieldKey: 'config.uuid',
    label: 'proxy.vless.uuid.label',
    type: 'text',
    generator: 'uuid',
    required: true,
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    description: 'proxy.vless.uuid.description',
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  },
  {
    fieldKey: 'config.flow',
    label: 'proxy.vless.flow.label',
    type: 'select',
    default: '',
    description: 'proxy.vless.flow.description',
    options: [
      { value: '', label: 'proxy.vless.flow.none' },
      { value: 'xtls-rprx-vision', label: 'XTLS Vision' },
    ],
  },
  {
    fieldKey: 'config.packet-encoding',
    label: 'proxy.vless.packetEncoding.label',
    type: 'select',
    default: '',
    description: 'proxy.vless.packetEncoding.description',
    options: [
      { value: '', label: 'proxy.vless.packetEncoding.none' },
      { value: 'packetaddr', label: 'packetaddr' },
      { value: 'xudp', label: 'xudp' },
    ],
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.vless.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.vless.udp.description',
  },
  {
    fieldKey: 'config.network',
    label: 'proxy.vless.network.label',
    type: 'select',
    default: 'tcp',
    required: true,
    description: 'proxy.vless.network.description',
    // No `http`. mihomo's `http` is HTTP/1.1 obfuscation over plain TCP — a
    // different protocol from the HTTP/2 below, one character away from it in a
    // dropdown, and not something this app supports: there are no `http-opts`
    // fields, and sing-box has no transport to export it to. Both import doors
    // refuse it rather than carry it this far.
    options: [
      { value: 'tcp', label: 'TCP' },
      { value: 'ws', label: 'WebSocket' },
      { value: 'grpc', label: 'gRPC' },
      { value: 'h2', label: 'HTTP/2' },
      { value: 'xhttp', label: 'XHTTP' },
    ],
  },
  {
    fieldKey: 'config.encryption',
    label: 'proxy.vless.encryption.label',
    type: 'text',
    placeholder: 'mlkem768x25519plus.native/...',
    description: 'proxy.vless.encryption.description',
  },
  {
    fieldKey: 'config.tls',
    label: 'proxy.vless.tls.label',
    type: 'boolean',
    default: true,
    description: 'proxy.vless.tls.description',
    // mihomo will not run h2 over plain TCP, so with HTTP/2 selected this is
    // not a choice. The switch is held on and says why, rather than vanishing —
    // TLS is still very much part of the node, and a config that quietly grew a
    // `tls: true` nobody could see would be worse than one that will not move.
    lockIf: {
      when: { field: 'config.network', operator: 'eq', value: 'h2' },
      value: true,
      reason: 'proxy.vless.tls.requiredByH2',
    },
  },
  {
    fieldKey: 'config.servername',
    label: 'proxy.vless.servername.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.vless.servername.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.alpn',
    label: 'proxy.vless.alpn.label',
    type: 'multiselect',
    description: 'proxy.vless.alpn.description',
    options: [
      { value: 'h3', label: 'h3' },
      { value: 'h2', label: 'h2' },
      { value: 'http/1.1', label: 'http/1.1' },
    ],
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.skip-cert-verify',
    label: 'proxy.vless.skipCertVerify.label',
    type: 'boolean',
    default: false,
    description: 'proxy.vless.skipCertVerify.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.client-fingerprint',
    label: 'proxy.vless.clientFingerprint.label',
    type: 'select',
    default: 'chrome',
    description: 'proxy.vless.clientFingerprint.description',
    options: [
      { value: 'chrome', label: 'Chrome' },
      { value: 'firefox', label: 'Firefox' },
      { value: 'safari', label: 'Safari' },
      { value: 'ios', label: 'iOS' },
      { value: 'android', label: 'Android' },
      { value: 'edge', label: 'Edge' },
      { value: '360', label: '360' },
      { value: 'qq', label: 'QQ' },
      { value: 'random', label: 'Random' },
    ],
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.name-cert-verify',
    label: 'proxy.commonTls.nameCertVerify.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.commonTls.nameCertVerify.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  ...tlsMaterialFields(),
  {
    fieldKey: 'config.ech-opts.enable',
    label: 'proxy.ech.enable.label',
    type: 'boolean',
    default: false,
    description: 'proxy.ech.enable.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.ech-opts.config',
    label: 'proxy.ech.config.label',
    type: 'textarea',
    placeholder: 'AEn+DQBF...',
    description: 'proxy.ech.config.description',
    showIf: [
      { field: 'config.tls', operator: 'eq', value: true },
      { field: 'config.ech-opts.enable', operator: 'eq', value: true },
    ],
  },
  {
    fieldKey: 'config.ech-opts.query-server-name',
    label: 'proxy.ech.queryServerName.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.ech.queryServerName.description',
    showIf: [
      { field: 'config.tls', operator: 'eq', value: true },
      { field: 'config.ech-opts.enable', operator: 'eq', value: true },
    ],
  },

  // REALITY. Filling in a public key is what makes the node a REALITY one —
  // mihomo has no flag for it, it reads `reality-opts`. Left blank, the two
  // keys are not written to the config at all.
  {
    fieldKey: 'config.reality-opts.public-key',
    label: 'proxy.vless.reality.publicKey.label',
    type: 'text',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    description: 'proxy.vless.reality.publicKey.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.reality-opts.short-id',
    label: 'proxy.vless.reality.shortId.label',
    type: 'text',
    placeholder: 'xxxxxxxxxxxxxxxx',
    description: 'proxy.vless.reality.shortId.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.reality-opts.support-x25519mlkem768',
    label: 'proxy.vless.reality.supportMlkem.label',
    type: 'boolean',
    default: false,
    description: 'proxy.vless.reality.supportMlkem.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  // gRPC-specific fields (only show when network='grpc')
  {
    fieldKey: 'config.grpc-opts.grpc-service-name',
    label: 'proxy.vless.grpc.serviceName.label',
    type: 'text',
    placeholder: 'GunService',
    description: 'proxy.vless.grpc.serviceName.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'grpc' },
  },
  {
    fieldKey: 'config.grpc-opts.grpc-user-agent',
    label: 'proxy.vmess.grpcUserAgent.label',
    type: 'text',
    placeholder: 'grpc-go/1.36.0',
    description: 'proxy.vmess.grpcUserAgent.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'grpc' },
  },
  {
    fieldKey: 'config.grpc-opts.ping-interval',
    label: 'proxy.vmess.pingInterval.label',
    type: 'number',
    min: 0,
    description: 'proxy.vmess.pingInterval.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'grpc' },
  },
  // WebSocket advanced options.
  {
    fieldKey: 'config.ws-opts.max-early-data',
    label: 'proxy.vmess.maxEarlyData.label',
    type: 'number',
    min: 0,
    description: 'proxy.vmess.maxEarlyData.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  {
    fieldKey: 'config.ws-opts.early-data-header-name',
    label: 'proxy.vmess.earlyDataHeader.label',
    type: 'text',
    placeholder: 'Sec-WebSocket-Protocol',
    description: 'proxy.vmess.earlyDataHeader.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  {
    fieldKey: 'config.ws-opts.v2ray-http-upgrade',
    label: 'proxy.vmess.httpUpgrade.label',
    type: 'boolean',
    default: false,
    description: 'proxy.vmess.httpUpgrade.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  {
    fieldKey: 'config.ws-opts.v2ray-http-upgrade-fast-open',
    label: 'proxy.vmess.httpUpgradeFastOpen.label',
    type: 'boolean',
    default: false,
    description: 'proxy.vmess.httpUpgradeFastOpen.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  // WebSocket-specific fields (only show when network='ws')
  {
    fieldKey: 'config.ws-opts.path',
    label: 'proxy.vless.ws.path.label',
    type: 'text',
    default: '/',
    placeholder: '/path',
    description: 'proxy.vless.ws.path.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  {
    fieldKey: 'config.ws-opts.headers.Host',
    label: 'proxy.vless.ws.host.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.vless.ws.host.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'ws' },
  },
  // HTTP/2-specific fields (only show when network='h2').
  //
  // `host` is a list rather than a single header — mihomo takes several and
  // picks between them — so it is edited one per line, the same way the DNS
  // module edits its lists.
  {
    fieldKey: 'config.h2-opts.host',
    label: 'proxy.vless.h2.host.label',
    type: 'textarea',
    asList: true,
    placeholder: 'example.com',
    description: 'proxy.vless.h2.host.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'h2' },
  },
  {
    fieldKey: 'config.h2-opts.path',
    label: 'proxy.vless.h2.path.label',
    type: 'text',
    default: '/',
    placeholder: '/',
    description: 'proxy.vless.h2.path.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'h2' },
  },
  // XHTTP-specific fields (only show when network='xhttp').
  //
  // `host` is a single value here, not the list h2 takes above — mihomo reads
  // one host for this transport and picks between several for that one.
  {
    fieldKey: 'config.xhttp-opts.path',
    label: 'proxy.vless.xhttp.path.label',
    type: 'text',
    default: '/',
    placeholder: '/',
    description: 'proxy.vless.xhttp.path.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.host',
    label: 'proxy.vless.xhttp.host.label',
    type: 'text',
    placeholder: 'example.com',
    description: 'proxy.vless.xhttp.host.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.mode',
    label: 'proxy.vless.xhttp.mode.label',
    type: 'select',
    default: 'auto',
    // The description carries the ALPN caveat, because nothing else on this
    // form does: XHTTP speaks HTTP/2 unless the node offers h3 or http/1.1 in
    // ALPN, and a mode that will not connect looks like a mode that is broken.
    description: 'proxy.vless.xhttp.mode.description',
    options: [
      { value: 'auto', label: 'auto' },
      { value: 'stream-one', label: 'stream-one' },
      { value: 'stream-up', label: 'stream-up' },
      { value: 'packet-up', label: 'packet-up' },
    ],
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },

  // XHTTP advanced options. The padding/session/sequence placement family and
  // the reuse (XMUX) settings for the upload half; the split-download half is
  // modelled further down as its own `download` section.
  {
    fieldKey: 'config.xhttp-opts.no-grpc-header',
    label: 'proxy.xhttp.noGrpcHeader.label',
    type: 'boolean',
    default: false,
    description: 'proxy.xhttp.noGrpcHeader.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.x-padding-bytes',
    label: 'proxy.xhttp.xPaddingBytes.label',
    type: 'text',
    placeholder: '100-1000',
    description: 'proxy.xhttp.xPaddingBytes.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.x-padding-obfs-mode',
    label: 'proxy.xhttp.xPaddingObfsMode.label',
    type: 'boolean',
    default: false,
    description: 'proxy.xhttp.xPaddingObfsMode.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.x-padding-key',
    label: 'proxy.xhttp.xPaddingKey.label',
    type: 'text',
    placeholder: 'x_padding',
    description: 'proxy.xhttp.xPaddingKey.description',
    showIf: [
      { field: 'config.network', operator: 'eq', value: 'xhttp' },
      { field: 'config.xhttp-opts.x-padding-obfs-mode', operator: 'eq', value: true },
    ],
  },
  {
    fieldKey: 'config.xhttp-opts.x-padding-header',
    label: 'proxy.xhttp.xPaddingHeader.label',
    type: 'text',
    placeholder: 'Referer',
    description: 'proxy.xhttp.xPaddingHeader.description',
    showIf: [
      { field: 'config.network', operator: 'eq', value: 'xhttp' },
      { field: 'config.xhttp-opts.x-padding-obfs-mode', operator: 'eq', value: true },
    ],
  },
  {
    fieldKey: 'config.xhttp-opts.x-padding-placement',
    label: 'proxy.xhttp.xPaddingPlacement.label',
    type: 'select',
    default: 'queryInHeader',
    description: 'proxy.xhttp.xPaddingPlacement.description',
    showIf: [
      { field: 'config.network', operator: 'eq', value: 'xhttp' },
      { field: 'config.xhttp-opts.x-padding-obfs-mode', operator: 'eq', value: true },
    ],
    options: ['queryInHeader', 'cookie', 'header', 'query'].map((v) => ({ value: v, label: v })),
  },
  {
    fieldKey: 'config.xhttp-opts.x-padding-method',
    label: 'proxy.xhttp.xPaddingMethod.label',
    type: 'select',
    default: 'repeat-x',
    description: 'proxy.xhttp.xPaddingMethod.description',
    showIf: [
      { field: 'config.network', operator: 'eq', value: 'xhttp' },
      { field: 'config.xhttp-opts.x-padding-obfs-mode', operator: 'eq', value: true },
    ],
    options: [
      { value: 'repeat-x', label: 'repeat-x' },
      { value: 'tokenish', label: 'tokenish' },
    ],
  },
  {
    fieldKey: 'config.xhttp-opts.session-placement',
    label: 'proxy.xhttp.sessionPlacement.label',
    type: 'select',
    default: '',
    description: 'proxy.xhttp.sessionPlacement.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
    options: ['', 'path', 'query', 'cookie', 'header'].map((v) => ({
      value: v,
      label: v === '' ? 'default' : v,
    })),
  },
  {
    fieldKey: 'config.xhttp-opts.session-key',
    label: 'proxy.xhttp.sessionKey.label',
    type: 'text',
    description: 'proxy.xhttp.sessionKey.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.seq-placement',
    label: 'proxy.xhttp.seqPlacement.label',
    type: 'select',
    default: '',
    description: 'proxy.xhttp.seqPlacement.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
    options: ['', 'path', 'query', 'cookie', 'header'].map((v) => ({
      value: v,
      label: v === '' ? 'default' : v,
    })),
  },
  {
    fieldKey: 'config.xhttp-opts.seq-key',
    label: 'proxy.xhttp.seqKey.label',
    type: 'text',
    description: 'proxy.xhttp.seqKey.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.sc-max-each-post-bytes',
    label: 'proxy.xhttp.scMaxEachPostBytes.label',
    type: 'number',
    min: 0,
    description: 'proxy.xhttp.scMaxEachPostBytes.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.sc-min-posts-interval-ms',
    label: 'proxy.xhttp.scMinPostsIntervalMs.label',
    type: 'number',
    min: 0,
    description: 'proxy.xhttp.scMinPostsIntervalMs.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.reuse-settings.max-concurrency',
    label: 'proxy.xhttp.xmuxMaxConcurrency.label',
    type: 'text',
    placeholder: '"16-32"',
    description: 'proxy.xhttp.xmuxMaxConcurrency.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.reuse-settings.max-connections',
    label: 'proxy.xhttp.xmuxMaxConnections.label',
    type: 'text',
    placeholder: '"0"',
    description: 'proxy.xhttp.xmuxMaxConnections.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.reuse-settings.c-max-reuse-times',
    label: 'proxy.xhttp.xmuxCMaxReuseTimes.label',
    type: 'text',
    placeholder: '"0"',
    description: 'proxy.xhttp.xmuxCMaxReuseTimes.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.reuse-settings.h-max-request-times',
    label: 'proxy.xhttp.xmuxHMaxRequestTimes.label',
    type: 'text',
    placeholder: '"600-900"',
    description: 'proxy.xhttp.xmuxHMaxRequestTimes.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.reuse-settings.h-max-reusable-secs',
    label: 'proxy.xhttp.xmuxHMaxReusableSecs.label',
    type: 'text',
    placeholder: '"1800-3000"',
    description: 'proxy.xhttp.xmuxHMaxReusableSecs.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },
  {
    fieldKey: 'config.xhttp-opts.reuse-settings.h-keep-alive-period',
    label: 'proxy.xhttp.xmuxHKeepAlivePeriod.label',
    type: 'number',
    min: 0,
    description: 'proxy.xhttp.xmuxHKeepAlivePeriod.description',
    showIf: { field: 'config.network', operator: 'eq', value: 'xhttp' },
  },

  // The split-download half of XHTTP: a second XHTTP stream that asks the node
  // to fetch a different endpoint, plus a whole remote proxy definition. It is
  // only reachable on an XHTTP node, and every field lives in its own section
  // rather than in `XHTTP Options` so the two halves stay readable.
  ...vlessXhttpDownloadFields(),

  // sing-mux over the TCP transports.
  ...smuxFields(),

  // Outbound dial options — TCP-only flags included, VLESS dials TCP.
  ...dialFamilyFields(),
];

/** Fields for `xhttp-opts.download-settings` on a VLESS XHTTP node. */
function vlessXhttpDownloadFields(): FieldSchema[] {
  const d = 'config.xhttp-opts.download-settings';
  const xhttp = { field: 'config.network', operator: 'eq' as const, value: 'xhttp' };
  const dtls = {
    field: `${d}.tls`,
    operator: 'eq' as const,
    value: true,
  };

  const fields: FieldSchema[] = [
    // XHTTP half — a second stream plus the XMUX settings for it.
    {
      fieldKey: `${d}.path`,
      label: 'proxy.vless.xhttp.download.path.label',
      type: 'text',
      default: '/',
      placeholder: '/',
      description: 'proxy.vless.xhttp.download.path.description',
      showIf: xhttp,
    },
    {
      fieldKey: `${d}.host`,
      label: 'proxy.vless.xhttp.download.host.label',
      type: 'text',
      placeholder: 'example.com',
      description: 'proxy.vless.xhttp.download.host.description',
      showIf: xhttp,
    },
    ...['max-concurrency', 'max-connections', 'c-max-reuse-times', 'h-max-request-times', 'h-max-reusable-secs'].map(
      (key): FieldSchema => {
        const labels: Record<string, [string, string, string]> = {
          'max-concurrency': ['proxy.xhttp.xmuxMaxConcurrency', '"16-32"', ''],
          'max-connections': ['proxy.xhttp.xmuxMaxConnections', '"0"', ''],
          'c-max-reuse-times': ['proxy.xhttp.xmuxCMaxReuseTimes', '"0"', ''],
          'h-max-request-times': ['proxy.xhttp.xmuxHMaxRequestTimes', '"600-900"', ''],
          'h-max-reusable-secs': ['proxy.xhttp.xmuxHMaxReusableSecs', '"1800-3000"', ''],
        };
        const [base, placeholder] = labels[key];
        return {
          fieldKey: `${d}.reuse-settings.${key}`,
          label: `${base}.label`,
          type: 'text',
          placeholder,
          description: `${base}.description`,
          showIf: xhttp,
        };
      }
    ),
    {
      fieldKey: `${d}.reuse-settings.h-keep-alive-period`,
      label: 'proxy.xhttp.xmuxHKeepAlivePeriod.label',
      type: 'number',
      min: 0,
      description: 'proxy.xhttp.xmuxHKeepAlivePeriod.description',
      showIf: xhttp,
    },
    // Proxy half — endpoint and TLS material for the download hop.
    {
      fieldKey: `${d}.server`,
      label: 'proxy.vless.xhttp.download.server.label',
      type: 'text',
      placeholder: 'example.com',
      description: 'proxy.vless.xhttp.download.server.description',
      showIf: xhttp,
    },
    {
      fieldKey: `${d}.port`,
      label: 'proxy.vless.xhttp.download.port.label',
      type: 'port',
      default: 443,
      min: 1,
      max: 65535,
      description: 'proxy.vless.xhttp.download.port.description',
      showIf: xhttp,
    },
    {
      fieldKey: `${d}.tls`,
      label: 'proxy.vless.xhttp.download.tls.label',
      type: 'boolean',
      default: true,
      description: 'proxy.vless.xhttp.download.tls.description',
      showIf: xhttp,
    },
    {
      fieldKey: `${d}.alpn`,
      label: 'proxy.vless.xhttp.download.alpn.label',
      type: 'multiselect',
      description: 'proxy.vless.xhttp.download.alpn.description',
      options: [
        { value: 'h3', label: 'h3' },
        { value: 'h2', label: 'h2' },
        { value: 'http/1.1', label: 'http/1.1' },
      ],
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.skip-cert-verify`,
      label: 'proxy.vless.xhttp.download.skipCertVerify.label',
      type: 'boolean',
      default: false,
      description: 'proxy.vless.xhttp.download.skipCertVerify.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.name-cert-verify`,
      label: 'proxy.vless.xhttp.download.nameCertVerify.label',
      type: 'text',
      placeholder: 'example.com',
      description: 'proxy.vless.xhttp.download.nameCertVerify.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.fingerprint`,
      label: 'proxy.vless.xhttp.download.fingerprint.label',
      type: 'text',
      description: 'proxy.vless.xhttp.download.fingerprint.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.certificate`,
      label: 'proxy.vless.xhttp.download.certificate.label',
      type: 'textarea',
      description: 'proxy.vless.xhttp.download.certificate.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.private-key`,
      label: 'proxy.vless.xhttp.download.privateKey.label',
      type: 'textarea',
      description: 'proxy.vless.xhttp.download.privateKey.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.servername`,
      label: 'proxy.vless.xhttp.download.servername.label',
      type: 'text',
      placeholder: 'example.com',
      description: 'proxy.vless.xhttp.download.servername.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.client-fingerprint`,
      label: 'proxy.vless.xhttp.download.clientFingerprint.label',
      type: 'select',
      default: 'chrome',
      description: 'proxy.vless.xhttp.download.clientFingerprint.description',
      options: [
        { value: 'chrome', label: 'Chrome' },
        { value: 'firefox', label: 'Firefox' },
        { value: 'safari', label: 'Safari' },
        { value: 'ios', label: 'iOS' },
        { value: 'android', label: 'Android' },
        { value: 'edge', label: 'Edge' },
        { value: '360', label: '360' },
        { value: 'qq', label: 'QQ' },
        { value: 'random', label: 'Random' },
      ],
      showIf: [xhttp, dtls],
    },
    // Security layers over the download hop.
    {
      fieldKey: `${d}.ech-opts.enable`,
      label: 'proxy.vless.xhttp.download.echEnable.label',
      type: 'boolean',
      default: false,
      description: 'proxy.vless.xhttp.download.echEnable.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.ech-opts.config`,
      label: 'proxy.vless.xhttp.download.echConfig.label',
      type: 'textarea',
      placeholder: 'AEn+DQBF...',
      description: 'proxy.vless.xhttp.download.echConfig.description',
      showIf: [xhttp, dtls, { field: `${d}.ech-opts.enable`, operator: 'eq', value: true }],
    },
    {
      fieldKey: `${d}.ech-opts.query-server-name`,
      label: 'proxy.vless.xhttp.download.echQueryServerName.label',
      type: 'text',
      placeholder: 'example.com',
      description: 'proxy.vless.xhttp.download.echQueryServerName.description',
      showIf: [xhttp, dtls, { field: `${d}.ech-opts.enable`, operator: 'eq', value: true }],
    },
    {
      fieldKey: `${d}.shadow-tls-opts.version`,
      label: 'proxy.vless.xhttp.download.shadowTlsVersion.label',
      type: 'select',
      default: 3,
      description: 'proxy.vless.xhttp.download.shadowTlsVersion.description',
      options: [1, 2, 3].map((v) => ({ value: v, label: String(v) })),
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.shadow-tls-opts.password`,
      label: 'proxy.vless.xhttp.download.shadowTlsPassword.label',
      type: 'text',
      description: 'proxy.vless.xhttp.download.shadowTlsPassword.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.restls-opts.password`,
      label: 'proxy.vless.xhttp.download.restlsPassword.label',
      type: 'text',
      description: 'proxy.vless.xhttp.download.restlsPassword.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.restls-opts.version-hint`,
      label: 'proxy.vless.xhttp.download.restlsVersionHint.label',
      type: 'select',
      default: 'tls13',
      description: 'proxy.vless.xhttp.download.restlsVersionHint.description',
      options: [
        { value: 'tls13', label: 'tls13' },
        { value: 'tls12', label: 'tls12' },
      ],
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.restls-opts.restls-script`,
      label: 'proxy.vless.xhttp.download.restlsScript.label',
      type: 'text',
      description: 'proxy.vless.xhttp.download.restlsScript.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.jls-opts.username`,
      label: 'proxy.vless.xhttp.download.jlsUsername.label',
      type: 'text',
      description: 'proxy.vless.xhttp.download.jlsUsername.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.jls-opts.password`,
      label: 'proxy.vless.xhttp.download.jlsPassword.label',
      type: 'text',
      description: 'proxy.vless.xhttp.download.jlsPassword.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.reality-opts.public-key`,
      label: 'proxy.vless.xhttp.download.realityPublicKey.label',
      type: 'text',
      placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      description: 'proxy.vless.xhttp.download.realityPublicKey.description',
      showIf: [xhttp, dtls],
    },
    {
      fieldKey: `${d}.reality-opts.short-id`,
      label: 'proxy.vless.xhttp.download.realityShortId.label',
      type: 'text',
      placeholder: 'xxxxxxxxxxxxxxxx',
      description: 'proxy.vless.xhttp.download.realityShortId.description',
      showIf: [xhttp, dtls],
    },
  ];

  return fields.map((field) => {
    field.section = 'download';
    field.level = 'advanced';
    return field;
  });
}
