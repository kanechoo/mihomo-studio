import { describe, it, expect } from 'vitest';
import { yamlFilename } from '../download';

// The download name comes from a free-text config name, so it has to survive
// the hostile cases: path separators on someone else's OS, quotes, control
// characters — and the boring ones like a blank name.
describe('yamlFilename', () => {
  it('keeps ordinary and CJK names', () => {
    expect(yamlFilename('home relay')).toBe('home relay.yaml');
    expect(yamlFilename('东京节点')).toBe('东京节点.yaml');
  });

  it('strips separators and reserved punctuation', () => {
    expect(yamlFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.yaml');
  });

  it('falls back when nothing usable remains', () => {
    expect(yamlFilename('')).toBe('server-config.yaml');
    expect(yamlFilename('///')).toBe('server-config.yaml');
  });
});
