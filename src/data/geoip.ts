// The codes carried by the GeoIP database mihomo ships with. Most are ISO 3166-1
// alpha-2 country codes; a handful are ASN/network groups that have no country.
export const GEOIP_CODES = [
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS',
  'BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CLOUDFLARE',
  'CLOUDFRONT','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM',
  'DO','DZ','EC','EE','EG','EH','ER','ES','ET','FACEBOOK','FASTLY','FI','FJ','FK',
  'FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GOOGLE',
  'GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE',
  'IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI',
  'KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU',
  'LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ',
  'MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NETFLIX','NF','NG',
  'NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM',
  'PN','PR','PRIVATE','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB',
  'SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV',
  'SX','SY','SZ','TC','TD','TELEGRAM','TF','TG','TH','TJ','TK','TL','TM','TN','TO',
  'TOR','TR','TT','TV','TW','TWITTER','TZ','UA','UG','UM','US','UY','UZ','VA','VC',
  'VE','VG','VI','VN','VU','WF','WS','XK','YE','YT','ZA','ZM','ZW',
] as const;

// Entries that are network/service groups rather than territories. They get no
// flag and no region name — the code is already the whole label.
const NON_COUNTRY = new Set([
  'CLOUDFLARE',
  'CLOUDFRONT',
  'FACEBOOK',
  'FASTLY',
  'GOOGLE',
  'NETFLIX',
  'PRIVATE',
  'TELEGRAM',
  'TOR',
  'TWITTER',
]);

export function isCountryCode(code: string): boolean {
  return code.length === 2 && !NON_COUNTRY.has(code);
}

// A flag emoji is just the two letters shifted into the regional-indicator block.
export function codeToFlag(code: string): string {
  if (!isCountryCode(code)) return '';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

// Resolve the territory name from the platform's own CLDR data instead of
// shipping a 250-entry table per language. Falls back to the bare code when the
// runtime has no name for it (XK, and the ASN groups).
export function codeToName(code: string, locale: string): string {
  if (!isCountryCode(code)) return '';
  try {
    const name = new Intl.DisplayNames([locale], { type: 'region' }).of(code);
    return name && name !== code ? name : '';
  } catch {
    return '';
  }
}

export function formatGeoipOption(code: string, locale: string): string {
  const flag = codeToFlag(code);
  const name = codeToName(code, locale);
  return [flag, code, name && `— ${name}`].filter(Boolean).join(' ');
}
