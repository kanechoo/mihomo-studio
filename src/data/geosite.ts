// Geosite category names, served by this project's own backend from its seeded
// geosite_tags table (see src/api/geosite.ts).
//
// Unlike GeoIP country codes (see ./geoip.ts), the geosite database has no
// fixed set of names — it gains and drops entries with every release, so the
// list lives in the server's database instead of being bundled here.

import { getGeositeList } from '../api/geosite';

// `category-*` entries are curated bundles (category-ads-all, category-games)
// and are what most rules actually reference, so they sort ahead of the ~1400
// individual site entries.
export function isGeositeCategory(name: string): boolean {
  return name.startsWith('category-');
}

export function sortGeositeNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const aIsCategory = isGeositeCategory(a);
    if (aIsCategory !== isGeositeCategory(b)) return aIsCategory ? -1 : 1;
    return a.localeCompare(b);
  });
}

// The server answers { names: [...], total: n } with the sort already applied.
// Normalising here anyway keeps a malformed or hand-mocked response from
// reaching the picker as anything other than clean, sorted names.
function normalizeNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error('unexpected response shape, expected { names: string[] }');
  }

  const unique = new Set<string>();
  raw.forEach((name) => {
    if (typeof name === 'string' && name.trim() !== '') unique.add(name.trim());
  });

  return sortGeositeNames([...unique]);
}

export async function fetchGeositeList(signal?: AbortSignal): Promise<string[]> {
  const body = await getGeositeList(signal);
  return normalizeNames(body?.names);
}
