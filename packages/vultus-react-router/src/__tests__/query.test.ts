import { describe, it, expect } from 'vitest';
import { applyChanges, readQuery, writeQuery } from '../query.js';

describe('readQuery', () => {
  it('reads every parameter, decoding as URLSearchParams does', () => {
    expect([...readQuery('?a=1&b=x%20y&c=p+q&d=')]).toEqual([['a', '1'], ['b', 'x y'], ['c', 'p q'], ['d', '']]);
  });

  it('reads an empty query, with or without its ?', () => {
    expect(readQuery('').size).toBe(0);
    expect(readQuery('?').size).toBe(0);
  });

  it('gives a repeated key its first value, as URLSearchParams.get does', () => {
    expect(readQuery('?a=1&a=2').get('a')).toBe('1');
  });
});

describe('writeQuery', () => {
  it('writes nothing for an empty query', () => {
    expect(writeQuery(new Map())).toBe('');
  });

  it('writes an empty value as k=', () => {
    expect(writeQuery(new Map([['k', '']]))).toBe('?k=');
  });

  it('keeps , and .. and / unescaped', () => {
    const query = new Map([['rounds', 'final,regional'], ['years', '2010..2025'], ['path', 'a/b']]);
    expect(writeQuery(query)).toBe('?rounds=final,regional&years=2010..2025&path=a/b');
  });

  it('encodes a space as %20, never +', () => {
    expect(writeQuery(new Map([['q', 'a b']]))).toBe('?q=a%20b');
  });

  it('round-trips keys and values with &, =, %, +, #, ?, spaces and non-ASCII', () => {
    const query = new Map([
      ['a&b', 'c=d'],
      ['50%', '100% sure'],
      ['plus+', '1+1=2'],
      ['hash#?', 'x#y?z'],
      ['árvíztűrő tükörfúrógép', 'Összes forduló'],
      ['日本', 'こんにちは 🙂'],
      ['', 'empty key'],
    ]);
    const written = writeQuery(query);
    expect(written.startsWith('?')).toBe(true);
    expect(written).not.toMatch(/[ #+]/u);
    expect(written.indexOf('?', 1)).toBe(-1);
    const parts = written.slice(1).split('&');
    expect(parts).toHaveLength(query.size);
    expect(parts.every((part) => part.split('=').length === 2)).toBe(true);
    expect([...readQuery(written)]).toEqual([...query]);
  });
});

describe('applyChanges', () => {
  it('replaces a key in its place and appends a new one', () => {
    expect(applyChanges('?a=1&b=2&c=3', [{ key: 'b', raw: 'x' }, { key: 'd', raw: 'y' }])).toBe('?a=1&b=x&c=3&d=y');
  });

  it('removes a key with raw undefined, every occurrence of it', () => {
    expect(applyChanges('?a=1&b=2&a=3', [{ key: 'a', raw: undefined }])).toBe('?b=2');
  });

  it('keeps an untouched repeated key, and drops the later copies of a changed one', () => {
    expect(applyChanges('?t=a&x=1&t=b&x=2', [{ key: 'x', raw: '9' }])).toBe('?t=a&x=9&t=b');
  });

  it('applies the changes in order: the last change of a key wins', () => {
    expect(applyChanges('?a=1', [{ key: 'a', raw: '2' }, { key: 'a', raw: undefined }, { key: 'b', raw: '' }])).toBe('?b=');
  });

  it('gives no ? when the last key goes', () => {
    expect(applyChanges('?a=1', [{ key: 'a', raw: undefined }])).toBe('');
  });
});
