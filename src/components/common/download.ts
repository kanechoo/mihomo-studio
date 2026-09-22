// Shared download helpers. The client editor and the server editor each grew
// their own inline blob-download; this is the one both now call, so filename
// rules live in exactly one place.

// Characters that are illegal or hazardous in filenames across platforms —
// Windows reserved punctuation and path separators. Control characters are
// stripped separately, by code point.
const ILLEGAL_FILENAME = /[/\\:*?"<>|]/g;

function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

/**
 * Turns a config name into a safe download filename.
 *
 * A Chinese name stays a Chinese name; separators, quotes and control
 * characters are stripped; an empty result (a blank or fully-illegal name)
 * falls back to `server-config.yaml` rather than handing the browser nothing.
 */
export function yamlFilename(name: string, fallback = 'server-config.yaml'): string {
  const cleaned = stripControlChars(String(name ?? ''))
    .replace(ILLEGAL_FILENAME, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  const base = cleaned.length > 0 ? cleaned : fallback.replace(/\.yaml$/, '');
  return `${base}.yaml`;
}

/** Triggers a client-side download of `content` as a text file. */
export function downloadTextFile(content: string, filename: string, mime = 'text/yaml'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
