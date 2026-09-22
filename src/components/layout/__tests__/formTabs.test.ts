import { describe, it, expect } from 'vitest';
import { FORM_TAB_KEYS } from '../FormPane';

// Low-frequency sections must not occupy the front of the strip: proxies and
// the graph sections carry almost every document, while Advanced (a stack of
// small modules) and Hosts are occasional visits.
describe('client editor tab order', () => {
  it('places Advanced and Hosts at the end', () => {
    expect(FORM_TAB_KEYS[FORM_TAB_KEYS.length - 1]).toBe('hosts');
    expect(FORM_TAB_KEYS[FORM_TAB_KEYS.length - 2]).toBe('advanced');
  });

  it('leads with general/dns and puts rules before the tail', () => {
    expect(FORM_TAB_KEYS.slice(0, 2)).toEqual(['general', 'dns']);
    expect(FORM_TAB_KEYS.indexOf('rules')).toBeLessThan(FORM_TAB_KEYS.indexOf('advanced'));
    // Providers precede their consumers.
    expect(FORM_TAB_KEYS.indexOf('proxyProvider')).toBeLessThan(FORM_TAB_KEYS.indexOf('proxyGroups'));
    expect(FORM_TAB_KEYS.indexOf('ruleProvider')).toBeLessThan(FORM_TAB_KEYS.indexOf('rules'));
  });
});
