import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { useManyOfField, type ManyOfOwnOptions } from '../useManyOfField.js';
import { FieldContextProvider } from '../FieldContext.js';

type Letter = 'a' | 'b' | 'c';

const CHOICES: ManyOfOwnOptions<Letter>['choices'] = [
  { value: 'a' }, { value: 'b' }, { value: 'c' },
];

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

describe('useManyOfField: value inside the field', () => {
  it('starts at [] and toggles', () => {
    const { result } = renderHook(() => useManyOfField({ id: 'letters', choices: CHOICES }));
    expect(result.current.type).toBe('manyOf');
    expect(result.current.value).toEqual([]);
    act(() => result.current.toggle('a'));
    expect(result.current.value).toEqual(['a']);
    act(() => result.current.toggle('a'));
    expect(result.current.value).toEqual([]);
  });

  it('setValue normalizes to choice order without duplicates; choices[].selected follows', () => {
    const { result } = renderHook(() => useManyOfField({ id: 'letters', choices: CHOICES }));
    act(() => result.current.setValue(['c', 'a']));
    expect(result.current.value).toEqual(['a', 'c']);
    expect(result.current.choices.map((c) => c.selected)).toEqual([true, false, true]);
  });
});

describe('useManyOfField: disabled choices', () => {
  it('a disabled choice cannot be toggled off or on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useManyOfField({
      id: 'letters', initialValue: ['b'],
      choices: [{ value: 'a' }, { value: 'b', disabled: true }, { value: 'c' }],
    }));
    expect(result.current.value).toEqual(['b']);
    act(() => result.current.toggle('b'));
    expect(result.current.value).toEqual(['b']);
    act(() => result.current.toggle('a'));
    expect(result.current.value).toEqual(['a', 'b']);
    act(() => result.current.toggle('b'));
    expect(result.current.value).toEqual(['a', 'b']);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('setValue is ignored with a warning when it contains an unknown value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useManyOfField({ id: 'letters', initialValue: ['a'], choices: CHOICES }));
    act(() => result.current.setValue(['a', 'zz' as Letter]));
    expect(result.current.value).toEqual(['a']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('toggle of an unknown choice is ignored with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useManyOfField({ id: 'letters', choices: CHOICES }));
    act(() => result.current.toggle('zz' as Letter));
    expect(result.current.value).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('useManyOfField: value outside, changed locally', () => {
  it('an empty list is a value: setValue([]) calls onChange with []', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useManyOfField({ id: 'letters', value: ['a'] as Letter[], onChange, choices: CHOICES }));
    act(() => result.current.setValue([]));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('a value the field holds that is no longer among the choices is kept, in its current order', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useManyOfField({
      id: 'letters', value: ['a', 'gone'] as Letter[], onChange,
      choices: [{ value: 'a' }, { value: 'b' }],
    }));
    expect(result.current.isSelected('gone' as Letter)).toBe(true);
    act(() => result.current.toggle('b' as Letter));
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'gone']);
  });
});

describe('useManyOfField: value outside, committed immediately', () => {
  it('commit.fire receives the normalized list; confirmation per requested list', async () => {
    let finish!: () => void;
    const fire = vi.fn((_next: Letter[]) => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useManyOfField({
      id: 'letters', value: [] as Letter[], choices: CHOICES,
      commit: { fire, confirmation: (next) => (next.length > 0 ? { kind: 'popconfirm', question: 'Apply?' } : undefined) },
    }));
    expect(result.current.confirmationFor(['a'])).toEqual({ kind: 'popconfirm', question: 'Apply?' });
    expect(result.current.confirmationFor([])).toBeUndefined();
    act(() => result.current.setValue(['c', 'a']));
    expect(fire).toHaveBeenCalledWith(['a', 'c'], expect.objectContaining({ warn: expect.any(Function) }));
    expect(result.current.pending).toBe(true);
    await act(async () => { finish(); });
    expect(result.current.pending).toBe(false);
  });
});

describe('useManyOfField: choices and initialValue as context functions', () => {
  it('both resolved with the field context', () => {
    const { result } = renderHook(() => useManyOfField({
      id: 'letters',
      choices: (ctx: { all: Letter[] }) => ctx.all.map((value) => ({ value })),
      initialValue: (ctx: { all: Letter[] }) => ctx.all,
    }), { wrapper: providing({ all: ['a', 'b'] as Letter[] }) });
    expect(result.current.value).toEqual(['a', 'b']);
    expect(result.current.choices.map((c) => c.value)).toEqual(['a', 'b']);
  });
});
