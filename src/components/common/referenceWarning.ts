import type { TFunction } from 'i18next';

// The extra sentence a delete confirmation carries when the thing being deleted
// is still named somewhere the editor will not rewrite for you.
//
// Only non-zero categories are mentioned, so the warning reads as a sentence
// rather than as a form with empty rows. An empty string means nothing points
// at it and the dialog should say nothing extra — silence is the common case,
// and a "0 references" line would train people to skip the whole message.
export function referenceWarning(
  t: TFunction,
  counts: { rules?: number; providers?: number; proxyProviders?: number }
): string {
  const clauses = [
    counts.rules ? t('common.refRules', { count: counts.rules }) : '',
    counts.providers ? t('common.refProviders', { count: counts.providers }) : '',
    // Named apart from rule providers rather than added to them. They are
    // unrelated sections that happen to share a `proxy:` key, and "3 providers"
    // would send someone hunting through one of them for something in the other.
    counts.proxyProviders
      ? t('common.refProxyProviders', { count: counts.proxyProviders })
      : '',
  ].filter(Boolean);

  if (clauses.length === 0) return '';
  return t('common.stillReferenced', { what: clauses.join(t('common.refSeparator')) });
}
