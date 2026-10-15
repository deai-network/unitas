import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useTextField } from '../useTextField.js';
import { FieldContextProvider } from '../FieldContext.js';

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

describe('useTextField: value inside the field', () => {
  it('starts at \'\', defaults control to \'input\', and changes locally', () => {
    const { result } = renderHook(() => useTextField({ id: 'name' }));
    expect(result.current.type).toBe('text');
    expect(result.current.value).toBe('');
    expect(result.current.control).toBe('input');
    act(() => result.current.setValue('abc'));
    expect(result.current.value).toBe('abc');
  });

  it('control may be given as \'textarea\'', () => {
    const { result } = renderHook(() => useTextField({ id: 'bio', control: 'textarea' }));
    expect(result.current.control).toBe('textarea');
  });

  it('starts at initialValue when given', () => {
    const { result } = renderHook(() => useTextField({ id: 'name', initialValue: 'Ada' }));
    expect(result.current.value).toBe('Ada');
  });

  it('falls back to \'\' when a context-function initialValue resolves to undefined', () => {
    const { result } = renderHook(() => useTextField({
      id: 'name', initialValue: (ctx: { name?: string }) => ctx.name as string,
    }), { wrapper: providing({ name: undefined }) });
    expect(result.current.value).toBe('');
  });
});

describe('useTextField: value outside, committed immediately', () => {
  it('runs the commit as an action: pending while it runs, then holds the caller\'s value', async () => {
    let finish!: () => void;
    const fire = vi.fn((_next: string) => new Promise<void>((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ value }) => useTextField({ id: 'name', value, commit: { fire } }), {
      initialProps: { value: '' },
    });
    expect(result.current.commits).toBe(true);
    act(() => result.current.setValue('abc'));
    expect(fire).toHaveBeenCalledWith('abc', expect.objectContaining({ warn: expect.any(Function) }));
    expect(result.current.pending).toBe(true);
    expect(result.current.value).toBe('');
    await act(async () => { finish(); });
    expect(result.current.pending).toBe(false);
    rerender({ value: 'abc' });
    expect(result.current.value).toBe('abc');
  });
});

describe('useTextField: placeholder from a context function', () => {
  it('resolves placeholder with the field context', () => {
    const { result } = renderHook(() => useTextField({
      id: 'name', placeholder: (ctx: { hint: string }) => ctx.hint,
    }), { wrapper: providing({ hint: 'Enter your name' }) });
    expect(result.current.placeholder).toBe('Enter your name');
  });
});
