export interface KvEntry {
  key: string;
  value: string;
}

export function kvEntriesToRecord(entries: KvEntry[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, value } of entries) {
    if (key === '') continue;
    record[key] = value;
  }
  return record;
}

export function recordToKvEntries(record: Record<string, string> | undefined): KvEntry[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
}

export function upsertKvEntry(
  entries: KvEntry[],
  index: number,
  patch: Partial<KvEntry>
): KvEntry[] {
  return entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
}

export function removeKvEntry(entries: KvEntry[], index: number): KvEntry[] {
  return entries.filter((_, i) => i !== index);
}
