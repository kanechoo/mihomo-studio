import { describe, it, expect } from 'vitest';
import { deleteNestedValue, isClearedValue, setNestedValue } from '../factory';

describe('isClearedValue', () => {
  it('treats null, undefined and empty string as unset', () => {
    expect(isClearedValue(null)).toBe(true);
    expect(isClearedValue(undefined)).toBe(true);
    expect(isClearedValue('')).toBe(true);
    expect(isClearedValue(0)).toBe(false);
    expect(isClearedValue(false)).toBe(false);
  });
});

describe('deleteNestedValue', () => {
  it('removes a deep leaf and prunes now-empty ancestors', () => {
    const obj = { config: { 'xhttp-opts': { 'download-settings': { port: 443, tls: true } } } };
    deleteNestedValue(obj, 'config.xhttp-opts.download-settings.port');
    expect(obj.config['xhttp-opts']['download-settings']).toEqual({ tls: true });
  });

  it('removes the whole block when the deleted leaf was its only key', () => {
    const obj = { a: { b: { c: 1 } } };
    deleteNestedValue(obj, 'a.b.c');
    expect(obj).toEqual({});
  });

  it('stops pruning at a non-empty ancestor', () => {
    const obj = { a: { b: { c: 1 }, keep: true } };
    deleteNestedValue(obj, 'a.b.c');
    expect(obj).toEqual({ a: { keep: true } });
  });

  it('is a no-op when the leaf is already absent', () => {
    const obj = { a: { keep: true } };
    deleteNestedValue(obj, 'a.missing.leaf');
    expect(obj).toEqual({ a: { keep: true } });
  });

  it('does not delete the root container itself', () => {
    const obj = { config: {} };
    deleteNestedValue(obj, 'config.xhttp-opts.port');
    expect(obj).toEqual({ config: {} });
  });

  it('composes with setNestedValue for a clear-then-remove path', () => {
    const obj: any = {};
    setNestedValue(obj, 'config.xhttp-opts.download-settings.port', 443);
    setNestedValue(obj, 'config.xhttp-opts.download-settings.tls', true);
    deleteNestedValue(obj, 'config.xhttp-opts.download-settings.port');
    expect(obj).toEqual({ config: { 'xhttp-opts': { 'download-settings': { tls: true } } } });
  });
});
