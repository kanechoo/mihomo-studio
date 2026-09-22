import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import type { ServerRuleIR } from '../../core/server/types';

// Node ships a localStorage that throws without --localstorage-file, and the
// persist middleware captures its storage at module load — so the stub has to
// be installed before the store is first imported.
beforeAll(() => {
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  });
});

let useServerStore: (typeof import('../serverStore'))['useServerStore'];

function rule(id: string, payload: string): ServerRuleIR {
  return { id, type: 'DOMAIN-SUFFIX', payload, target: 'DIRECT' };
}

describe('serverStore rule ordering', () => {
  beforeAll(async () => {
    ({ useServerStore } = await import('../serverStore'));
  });

  beforeEach(() => {
    useServerStore.setState({
      config: {
        ...useServerStore.getState().config,
        rules: [rule('a', 'a.com'), rule('b', 'b.com')],
      },
    });
  });

  it('insertRulesAfter keeps match order intact', () => {
    useServerStore.getState().insertRulesAfter('a', [rule('x', 'x.com'), rule('y', 'y.com')]);
    expect(useServerStore.getState().config.rules?.map((r) => r.id)).toEqual([
      'a',
      'x',
      'y',
      'b',
    ]);
  });

  it('appends when the anchor rule is gone rather than dropping the insert', () => {
    useServerStore.getState().insertRulesAfter('missing', [rule('x', 'x.com')]);
    expect(useServerStore.getState().config.rules?.map((r) => r.id)).toEqual(['a', 'b', 'x']);
  });
});

describe('serverStore.addListener port assignment', () => {
  beforeAll(async () => {
    ({ useServerStore } = await import('../serverStore'));
  });

  beforeEach(() => {
    useServerStore.setState({ config: useServerStore.getState().config });
  });

  it('gives two same-protocol listeners different random ports in range', () => {
    useServerStore.getState().resetServer();
    const first = useServerStore.getState().addListener('http');
    const second = useServerStore.getState().addListener('http');
    const listeners = useServerStore.getState().config.listeners;
    const portOf = (id: string) =>
      listeners.find((l) => l.id === id)?.port ?? '';
    expect(portOf(first)).not.toBe(portOf(second));
    for (const id of [first, second]) {
      const n = Number(portOf(id));
      expect(n).toBeGreaterThanOrEqual(1024);
      expect(n).toBeLessThanOrEqual(65535);
    }
  });

  it('leaves portless protocols untouched', () => {
    useServerStore.getState().resetServer();
    useServerStore.getState().addListener('tun');
    const tun = useServerStore
      .getState()
      .config.listeners.find((l) => l.type === 'tun');
    expect(tun?.port ?? '').toBe('');
  });
});
