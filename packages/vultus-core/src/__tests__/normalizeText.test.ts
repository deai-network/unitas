import { describe, it, expect } from 'vitest';
import { normalizeText } from '../normalizeText.js';

describe('normalizeText', () => {
  it('lower-cases plain ASCII text', () => {
    expect(normalizeText('Kombinatorika')).toBe('kombinatorika');
  });

  it('strips accents (combining marks after NFD decomposition)', () => {
    expect(normalizeText('Feltételes')).toBe('felteteles');
  });

  it('strips an accent from a single letter', () => {
    expect(normalizeText('Ő')).toBe('o');
  });
});
