import { describe, it, expect } from 'vitest';
import { createListener, pickFreeListenerPort } from '../factory';
import type { ListenerIR } from '../types';

function listenerWithPort(port: string): ListenerIR {
  return { ...createListener('http'), port };
}

const inRange = (port: string) => {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1024 && n <= 65535;
};

describe('pickFreeListenerPort', () => {
  it('returns ports inside the unprivileged range', () => {
    for (let i = 0; i < 50; i++) {
      expect(inRange(pickFreeListenerPort([]))).toBe(true);
    }
  });

  it('never repeats a port already claimed by an existing listener', () => {
    const existing = [listenerWithPort('40000')];
    for (let i = 0; i < 100; i++) {
      expect(pickFreeListenerPort(existing)).not.toBe('40000');
    }
  });

  it('avoids every port inside an existing range expression', () => {
    const existing = [listenerWithPort('20000-20010'), listenerWithPort('30000,30001')];
    const blocked = new Set<number>();
    for (let p = 20000; p <= 20010; p++) blocked.add(p);
    blocked.add(30000);
    blocked.add(30001);
    for (let i = 0; i < 100; i++) {
      const port = Number(pickFreeListenerPort(existing));
      expect(blocked.has(port)).toBe(false);
    }
  });

  it('gives two fresh listeners of the same protocol different ports', () => {
    const first = createListener('http');
    // Simulate the store flow: the second pick sees the first listener.
    const secondPort = pickFreeListenerPort([first]);
    expect(String(first.port)).not.toBe(secondPort);
    expect(inRange(secondPort)).toBe(true);
  });
});

describe('createListener port defaults', () => {
  it('leaves portless protocols (tun) empty — no random assignment', () => {
    expect(createListener('tun').port).toBe('');
  });
});
