import { describe, it, expect } from 'vitest';
import { PROTOCOL_DISPLAY_NAMES, getProtocolDisplayName } from '../protocols';
import { protocolSchemas } from '../../schemas/modules/proxies';
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';

// Every protocol the editor can create must have a hand-written display name.
// A missing entry silently falls back to the raw key, so the registry and the
// schema registry are kept in lock-step by this test.
describe('protocol display name registry', () => {
  it('covers every registered protocol type', () => {
    const types = Object.keys(protocolSchemas);
    for (const type of types) {
      expect(PROTOCOL_DISPLAY_NAMES[type], `missing display name for ${type}`).toBeTruthy();
    }
  });

  it('uses official spellings, not case-transformed keys', () => {
    expect(getProtocolDisplayName('vmess')).toBe('VMess');
    expect(getProtocolDisplayName('ssr')).toBe('ShadowsocksR');
    expect(getProtocolDisplayName('ss')).toBe('Shadowsocks');
    expect(getProtocolDisplayName('tuic')).toBe('TUIC v5');
    expect(getProtocolDisplayName('wireguard')).toBe('WireGuard');
    // No entry may be a plain uppercasing of its key (that is exactly the
    // mistake this registry exists to prevent) — except keys whose official
    // name genuinely is the acronym.
    const ACRONYM_KEYS = new Set(['dns', 'masque', 'vless', 'ssh', 'http', 'socks5']);
    for (const [key, name] of Object.entries(PROTOCOL_DISPLAY_NAMES)) {
      if (ACRONYM_KEYS.has(key)) continue;
      expect(name === key.toUpperCase(), `${key} → ${name} looks auto-generated`).toBe(false);
    }
  });

  it('falls back to the raw key for unknown types', () => {
    expect(getProtocolDisplayName('exotic')).toBe('exotic');
  });
});

// The rule payload hints are data-driven per type; this pins both their
// coverage and the locale strings behind them.
describe('rule type hints', () => {
  it('every selectable rule type has a hint entry', async () => {
    const { rulesSchema, RULE_TYPE_HINTS } = await import('../../schemas/modules/rules');
    const typeField = rulesSchema.fields.find((f) => f.fieldKey === 'type');
    for (const option of typeField!.options!) {
      expect(RULE_TYPE_HINTS[String(option.value)], `missing hint for ${option.value}`).toBeTruthy();
    }
  });

  it('every hint description key resolves in both locales', async () => {
    const { RULE_TYPE_HINTS } = await import('../../schemas/modules/rules');
    const enRule = (en as any).rule.hint;
    const zhRule = (zh as any).rule.hint;
    for (const [type, hint] of Object.entries(RULE_TYPE_HINTS)) {
      const key = (hint as any).descriptionKey;
      expect(enRule[type]?.description, `en missing ${key}`).toBeTruthy();
      expect(zhRule[type]?.description, `zh missing ${key}`).toBeTruthy();
    }
  });

  it('official example values appear as placeholders', async () => {
    const { RULE_TYPE_HINTS } = await import('../../schemas/modules/rules');
    expect(RULE_TYPE_HINTS['IP-CIDR'].placeholder).toBe('192.168.1.0/24');
    expect(RULE_TYPE_HINTS['DST-PORT'].placeholder).toBe('443');
    expect(RULE_TYPE_HINTS['PROCESS-NAME'].placeholder).toBe('curl');
    expect(RULE_TYPE_HINTS['DOMAIN-KEYWORD'].placeholder).toBe('google');
  });
});
