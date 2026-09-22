import { describe, it, expect } from 'vitest';
import { migrateServerDraft } from '../serverStore';
import { createDefaultServerConfig } from '../../core/server/factory';

// The v1→v2 persist migration rewrites the nine original camelCase DNS keys
// into the shared kebab-case model. A missed key would silently stop
// rendering in the DNS tab while still exporting — the worst kind of loss.
function stateWithLegacyDns(dns: Record<string, unknown>) {
  const config = createDefaultServerConfig();
  return { config: { ...config, dns } };
}

describe('serverStore persist migration v1 → v2', () => {
  it('rewrites legacy camelCase dns keys to kebab-case', () => {
    const next = migrateServerDraft(
      stateWithLegacyDns({
        enable: true,
        listen: '0.0.0.0:1053',
        ipv6: false,
        enhancedMode: 'fake-ip',
        fakeIpRange: '198.18.0.1/16',
        fakeIpFilter: ['*.lan'],
        defaultNameserver: ['223.5.5.5'],
        nameserver: ['https://doh.pub/dns-query'],
        fallback: [],
      }) as unknown as Parameters<typeof migrateServerDraft>[0],
      1
    ) as unknown as { config: { dns: Record<string, unknown> } };
    expect(next.config.dns).toEqual({
      enable: true,
      listen: '0.0.0.0:1053',
      ipv6: false,
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      'fake-ip-filter': ['*.lan'],
      'default-nameserver': ['223.5.5.5'],
      nameserver: ['https://doh.pub/dns-query'],
      fallback: [],
    });
  });

  it('leaves already-kebab state untouched', () => {
    const next = migrateServerDraft(
      stateWithLegacyDns({ enable: true, nameserver: ['x'] }) as unknown as Parameters<
        typeof migrateServerDraft
      >[0],
      1
    ) as unknown as { config: { dns: Record<string, unknown> } };
    expect(next.config.dns).toEqual({ enable: true, nameserver: ['x'] });
  });
});
