import type { FieldSchema } from '../types';

// GEO data sources and loading behaviour.
export const geodataSchema: FieldSchema[] = [
  {
    fieldKey: 'geodata-mode',
    label: 'geodata.mode.label',
    type: 'boolean',
    default: false,
    description: 'geodata.mode.description',
  },
  {
    fieldKey: 'geodata-loader',
    label: 'geodata.loader.label',
    type: 'select',
    default: 'memconservative',
    description: 'geodata.loader.description',
    options: [
      { value: 'standard', label: 'standard' },
      { value: 'memconservative', label: 'memconservative' },
    ],
  },
  {
    fieldKey: 'geosite-matcher',
    label: 'geodata.matcher.label',
    type: 'select',
    default: '',
    description: 'geodata.matcher.description',
    options: [
      { value: '', label: 'default' },
      { value: 'succinct', label: 'succinct' },
      { value: 'mph', label: 'mph' },
    ],
  },
  {
    fieldKey: 'geo-auto-update',
    label: 'geodata.autoUpdate.label',
    type: 'boolean',
    default: false,
    description: 'geodata.autoUpdate.description',
  },
  {
    fieldKey: 'geo-update-interval',
    label: 'geodata.updateInterval.label',
    type: 'number',
    min: 1,
    description: 'geodata.updateInterval.description',
    showIf: { field: 'geo-auto-update', operator: 'eq', value: true },
  },
  {
    fieldKey: 'geox-url.geoip',
    label: 'geodata.geoipUrl.label',
    type: 'text',
    placeholder: 'https://.../geoip.dat',
    description: 'geodata.geoipUrl.description',
  },
  {
    fieldKey: 'geox-url.geosite',
    label: 'geodata.geositeUrl.label',
    type: 'text',
    placeholder: 'https://.../geosite.dat',
    description: 'geodata.geositeUrl.description',
  },
  {
    fieldKey: 'geox-url.mmdb',
    label: 'geodata.mmdbUrl.label',
    type: 'text',
    placeholder: 'https://.../country.mmdb',
    description: 'geodata.mmdbUrl.description',
  },
  {
    fieldKey: 'geox-url.asn',
    label: 'geodata.asnUrl.label',
    type: 'text',
    placeholder: 'https://.../GeoLite2-ASN.mmdb',
    description: 'geodata.asnUrl.description',
  },
];
