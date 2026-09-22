// Timestamp formatting for the cloud panels.
//
// Everything the API returns is RFC 3339 in UTC; everything shown here is in the
// reader's own timezone, because "last fetched at 03:12" is only useful if the
// 03:12 is theirs.

export function formatDateTime(iso: string | undefined, language: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
