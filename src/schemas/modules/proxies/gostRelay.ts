import type { FieldSchema } from '../../types';
import { dialFamilyFields, headerFields, tlsMaterialFields } from './common';

// GOST relay outbound — a relay hop chained via dialer-proxy. Fields per the
// official example config (gost-relay has no dedicated wiki page yet; the
// annotated example is the reference). `forward` selects between dynamic mode
// (relay dials what the upper proxy asks for) and forward mode.
export const gostRelayProxyFields: FieldSchema[] = [
  ...headerFields('gost-relay', 'GOST Relay', 443),
  {
    fieldKey: 'config.forward',
    label: 'proxy.gostRelay.forward.label',
    type: 'boolean',
    default: false,
    description: 'proxy.gostRelay.forward.description',
  },
  {
    fieldKey: 'config.udp',
    label: 'proxy.common.udp.label',
    type: 'boolean',
    default: true,
    description: 'proxy.common.udp.description',
  },
  {
    fieldKey: 'config.tls',
    label: 'proxy.commonTls.tls.label',
    type: 'boolean',
    default: true,
    description: 'proxy.commonTls.tls.description',
  },
  {
    fieldKey: 'config.mux',
    label: 'proxy.gostRelay.mux.label',
    type: 'boolean',
    default: false,
    description: 'proxy.gostRelay.mux.description',
    showIf: [
      { field: 'config.tls', operator: 'eq', value: true },
      { field: 'config.forward', operator: 'eq', value: true },
    ],
  },
  {
    fieldKey: 'config.sni',
    label: 'proxy.commonTls.sni.label',
    type: 'text',
    placeholder: 'relay.example.com',
    description: 'proxy.commonTls.sni.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.username',
    label: 'proxy.http.username.label',
    type: 'text',
    description: 'proxy.http.username.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.password',
    label: 'proxy.common.password.label',
    type: 'text',
    generator: 'password',
    description: 'proxy.common.password.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
  },
  {
    fieldKey: 'config.client-fingerprint',
    label: 'proxy.commonTls.clientFingerprint.label',
    type: 'select',
    default: 'chrome',
    description: 'proxy.commonTls.clientFingerprint.description',
    showIf: { field: 'config.tls', operator: 'eq', value: true },
    options: [
      { value: 'chrome', label: 'chrome' },
      { value: 'firefox', label: 'firefox' },
      { value: 'safari', label: 'safari' },
      { value: 'ios', label: 'ios' },
    ],
  },
  {
    fieldKey: 'config.skip-cert-verify',
    label: 'proxy.commonTls.skipCertVerify.label',
    type: 'boolean',
    default: false,
    description: 'proxy.commonTls.skipCertVerify.description',
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
  ...dialFamilyFields(),
];
