import { describe, expect, it, vi, afterEach } from 'vitest';
import { validateWithMihomo, formatDurationSeconds } from '../mihomo';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response),
  );
}

describe('validateWithMihomo', () => {
  it('normalizes null diagnostics to [] (valid config, empty stderr)', async () => {
    // Regression: Go nil slice serializes as JSON null; EditorPane calls
    // .slice on diagnostics and crashed with "Cannot read properties of null".
    mockFetch({ valid: true, exitCode: 0, stdout: '', stderr: '', durationMs: 12, diagnostics: null });
    const outcome = await validateWithMihomo('port: 7890');
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.result.diagnostics).toEqual([]);
    expect(() => outcome.result.diagnostics.slice(0, 5)).not.toThrow();
  });

  it('passes real diagnostics through untouched', async () => {
    const diagnostics = [{ line: 3, message: 'bad key', severity: 'error' as const }];
    mockFetch({ valid: false, exitCode: 1, stdout: '', stderr: 'x', durationMs: 5, diagnostics });
    const outcome = await validateWithMihomo('bad: [');
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.result.diagnostics).toEqual(diagnostics);
  });
});

describe('formatDurationSeconds', () => {
  it('renders one decimal in seconds, halves up', () => {
    expect(formatDurationSeconds(1250)).toBe('1.3');
    expect(formatDurationSeconds(1249)).toBe('1.2');
    expect(formatDurationSeconds(40)).toBe('0.0');
    expect(formatDurationSeconds(100)).toBe('0.1');
  });
});
