import { describe, it, expect } from 'vitest';
import { booleanType, numberType, rangeType, stringSetType, stringType } from '../valueTypes.js';

describe('booleanType', () => {
  it('stores 1 / 0, and reads anything else as no value', () => {
    expect(booleanType.parse('1')).toBe(true);
    expect(booleanType.parse('0')).toBe(false);
    expect(booleanType.parse('true')).toBe(undefined);
    expect(booleanType.parse('')).toBe(undefined);
    expect(booleanType.format(true)).toBe('1');
    expect(booleanType.format(false)).toBe('0');
    expect(booleanType.isEqual(true, true)).toBe(true);
    expect(booleanType.isEqual(true, false)).toBe(false);
  });
});

describe('stringType', () => {
  it('stores the string as it is', () => {
    expect(stringType.parse('a b')).toBe('a b');
    expect(stringType.parse('')).toBe('');
    expect(stringType.format('a,b')).toBe('a,b');
    expect(stringType.isEqual('a', 'a')).toBe(true);
    expect(stringType.isEqual('a', 'b')).toBe(false);
  });
});

describe('numberType', () => {
  it('stores the number; an empty or non-numeric string is no value', () => {
    expect(numberType.parse('abc')).toBe(undefined);
    expect(numberType.parse('')).toBe(undefined);
    expect(numberType.parse(' ')).toBe(undefined);
    expect(numberType.parse('Infinity')).toBe(undefined);
    expect(numberType.parse('12')).toBe(12);
    expect(numberType.parse('-1.5')).toBe(-1.5);
    expect(numberType.format(12)).toBe('12');
    expect(numberType.isEqual(1, 1)).toBe(true);
    expect(numberType.isEqual(1, 2)).toBe(false);
  });
});

describe('rangeType', () => {
  it('stores from..to; out of order, non-numeric or malformed is no value', () => {
    expect(rangeType.parse('2010..2025')).toEqual([2010, 2025]);
    expect(rangeType.parse('-5..-2')).toEqual([-5, -2]);
    expect(rangeType.parse('1.5..1.5')).toEqual([1.5, 1.5]);
    expect(rangeType.parse('5..2')).toBe(undefined);
    expect(rangeType.parse('a..2')).toBe(undefined);
    expect(rangeType.parse('1..')).toBe(undefined);
    expect(rangeType.parse('2010')).toBe(undefined);
    expect(rangeType.parse('1..2..3')).toBe(undefined);
    expect(rangeType.format([1, 2])).toBe('1..2');
    expect(rangeType.parse(rangeType.format([-3, 4.5]))).toEqual([-3, 4.5]);
    expect(rangeType.isEqual([1, 2], [1, 2])).toBe(true);
    expect(rangeType.isEqual([1, 2], [1, 3])).toBe(false);
    expect(rangeType.isEqual([1, 2], [0, 2])).toBe(false);
  });
});

describe('stringSetType', () => {
  it('stores a sorted comma list; the empty string is the empty list', () => {
    expect(stringSetType.parse('b,,a')).toEqual(['a', 'b']);
    expect(stringSetType.parse('')).toEqual([]);
    expect(stringSetType.parse('b,a,b')).toEqual(['a', 'b']);
    expect(stringSetType.format(['b', 'a'])).toBe('a,b');
    expect(stringSetType.format([])).toBe('');
    expect(stringSetType.format(['b', 'a', 'b'])).toBe('a,b');
  });

  it('does not change the list it formats', () => {
    const list = ['b', 'a'];
    stringSetType.format(list);
    expect(list).toEqual(['b', 'a']);
  });

  it('refuses to store an item containing a comma', () => {
    expect(() => stringSetType.format(['a,b'])).toThrow(/contains ','/);
  });

  it('compares as sets', () => {
    expect(stringSetType.isEqual(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(stringSetType.isEqual([], [])).toBe(true);
    expect(stringSetType.isEqual(['a'], ['a', 'b'])).toBe(false);
    expect(stringSetType.isEqual(['a', 'c'], ['a', 'b'])).toBe(false);
  });
});
