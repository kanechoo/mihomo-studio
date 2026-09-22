import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Guardrails for every locale-driven surface:
//
// 1. en.json / zh.json must stay key-for-key identical — a key present in one
//    language only renders raw in the other.
// 2. Every dotted i18n key a schema references must resolve in BOTH files.
//    Schema fields store keys, not copy; a typo'd or forgotten key would fall
//    back to rendering the key itself next to a translated sibling.
//
// A string literal in a schema counts as an i18n key when it is dotted and its
// first segment names a real top-level namespace. That filter keeps literal
// option labels (`label: 'Hysteria2'`) and sample placeholders
// (`placeholder: 'example.com'`) out of the check without a hand-maintained
// list: they never collide with a namespace name.

type Json = { [key: string]: unknown };

function flatten(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      flatten(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

// Mirrors i18next's deepFind closely enough for existence checks: at each
// level it tries the remaining segments joined as one flat key before
// descending, so legacy flat spellings like proxyGroup['interval.label'] sit
// beside the nested walk instead of breaking it.
function lookup(root: unknown, key: string): unknown {
  function walk(node: unknown, parts: string[]): unknown {
    if (node === null || typeof node !== 'object') return undefined;
    const obj = node as Json;
    for (let take = parts.length; take >= 1; take--) {
      const candidate = parts.slice(0, take).join('.');
      if (candidate in obj) {
        const hit = take === parts.length ? obj[candidate] : walk(obj[candidate], parts.slice(take));
        if (hit !== undefined) return hit;
      }
    }
    return undefined;
  }
  return walk(root, key.split('.'));
}

const localesDir = resolve(__dirname);
const en: Json = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf8'));
const zh: Json = JSON.parse(readFileSync(join(localesDir, 'zh.json'), 'utf8'));

const enKeys = flatten(en).sort();
const zhKeys = flatten(zh).sort();

function schemaFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return schemaFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const KEY_RE =
  /(?:labelKey|descriptionKey|placeholderKey|label|description):\s*'([^']+)'/g;

function referencedI18nKeys(): string[] {
  const found = new Set<string>();
  for (const file of schemaFiles(resolve(__dirname, '../schemas'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(KEY_RE)) {
      const key = match[1];
      const namespace = key.split('.')[0];
      if (key.includes('.') && namespace in en) found.add(key);
    }
  }
  return [...found].sort();
}

describe('locale files', () => {
  it('define the same top-level namespaces', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it('have identical key sets across en and zh', () => {
    const enSet = new Set(enKeys);
    const zhSet = new Set(zhKeys);
    const onlyInEn = enKeys.filter((k) => !zhSet.has(k));
    const onlyInZh = zhKeys.filter((k) => !enSet.has(k));
    expect(onlyInEn, 'keys missing from zh.json').toEqual([]);
    expect(onlyInZh, 'keys missing from en.json').toEqual([]);
  });

  it('resolve every shared key to a string in both languages', () => {
    for (const key of enKeys) {
      expect(typeof lookup(en, key), `en:${key}`).toBe('string');
      expect(typeof lookup(zh, key), `zh:${key}`).toBe('string');
    }
  });
});

describe('interpolation syntax', () => {
  // i18next only interpolates {{var}}. A single-brace {var} renders
  // literally (e.g. "server check passed · {ms} ms"), so scan every locale
  // string and fail on any placeholder not wrapped in double braces.
  // Lookbehind/ahead keep {{var}} and {{{mustache}}} spellings out of the
  // match: only lone single braces count.
  const SINGLE_BRACE_RE = /(?<!\{)\{[A-Za-z]+\}(?!\})/;

  function collectStrings(node: unknown, prefix: string, out: Array<[string, string]>) {
    if (typeof node === 'string') {
      out.push([prefix, node]);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
      }
    }
  }

  for (const [name, root] of [['en', en], ['zh', zh]] as const) {
    it(`has no single-brace placeholders in ${name}.json`, () => {
      const strings: Array<[string, string]> = [];
      collectStrings(root, '', strings);
      const bad = strings.filter(([, text]) => SINGLE_BRACE_RE.test(text));
      expect(bad, 'single-brace placeholders render literally under i18next').toEqual([]);
    });
  }
});

describe('schema i18n references', () => {
  const keys = referencedI18nKeys();

  it('actually scanned a meaningful number of keys', () => {
    // If this drops, the regex or the schema layout changed and the two tests
    // below are silently checking nothing.
    expect(keys.length).toBeGreaterThan(300);
  });

  it('resolve every referenced key in en.json', () => {
    const missing = keys.filter((k) => typeof lookup(en, k) !== 'string');
    expect(missing, 'referenced but absent from en.json').toEqual([]);
  });

  it('resolve every referenced key in zh.json', () => {
    const missing = keys.filter((k) => typeof lookup(zh, k) !== 'string');
    expect(missing, 'referenced but absent from zh.json').toEqual([]);
  });
});
