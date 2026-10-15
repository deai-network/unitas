import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useNumericField } from '../useNumericField.js';
import { FieldContextProvider } from '../FieldContext.js';

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

describe('useNumericField: implicit initial value', () => {
  it('min given: starts at min', () => {
    const { result } = renderHook(() => useNumericField({ id: 'n', min: 5 }));
    expect(result.current.type).toBe('numeric');
    expect(result.current.value).toBe(5);
  });

  it('no bounds given: starts at 0', () => {
    const { result } = renderHook(() => useNumericField({ id: 'n' }));
    expect(result.current.value).toBe(0);
  });

  it('min: 2 (not 0): starts at 2', () => {
    const { result } = renderHook(() => useNumericField({ id: 'n', min: 2 }));
    expect(result.current.value).toBe(2);
  });
});

describe('useNumericField: valueText', () => {
  it('formats with the unit by default', () => {
    const { result } = renderHook(() => useNumericField({ id: 'n', initialValue: 50, unit: '%' }));
    expect(result.current.valueText).toBe('50%');
  });

  it('a format function receives the number and the field context', () => {
    const { result } = renderHook(() => useNumericField({
      id: 'n', initialValue: 50, format: (n, ctx: { lang: string }) => ctx.lang + n,
    }), { wrapper: providing({ lang: 'hu' }) });
    expect(result.current.valueText).toBe('hu50');
  });

  it('a format whose context parameter has a default gets the context when a provider is above, and nothing otherwise', () => {
    const format = (n: number, ctx: any = {}) => (ctx.lang ?? '') + n;
    const provided = renderHook(() => useNumericField({ id: 'n', initialValue: 50, format }), { wrapper: providing({ lang: 'hu' }) });
    expect(provided.result.current.valueText).toBe('hu50');
    const alone = renderHook(() => useNumericField({ id: 'n', initialValue: 50, format }));
    expect(alone.result.current.valueText).toBe('50');
  });

  it('a missing key read by format throws, naming the field and the option', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useNumericField({
        id: 'n', initialValue: 50, format: (n, ctx: { lang: string }) => ctx.lang + n,
      }), { wrapper: providing({ t: (k: string) => k }) })).toThrow(/^Field 'n': option 'format': Field context: 'lang' was never provided \(provided: t\)$/);
    } finally {
      error.mockRestore();
    }
  });

  it('a format declaring two parameters with no provider throws', () => {
    expect(() => renderHook(() => useNumericField({
      id: 'n', initialValue: 50, format: (n, ctx: { lang: string }) => ctx.lang + n,
    }))).toThrow(/Field 'n': option 'format'.*FieldContextProvider/);
  });
});

describe('useNumericField: requests', () => {
  it('integer rounds a fractional request', () => {
    const { result } = renderHook(() => useNumericField({ id: 'n', integer: true, initialValue: 0 }));
    act(() => result.current.setValue(2.6));
    expect(result.current.value).toBe(3);
  });

  it('a request is clamped into the bounds', () => {
    const { result } = renderHook(() => useNumericField({ id: 'n', max: 100, initialValue: 0 }));
    act(() => result.current.setValue(500));
    expect(result.current.value).toBe(100);
  });

  it('a non-finite request is ignored with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useNumericField({ id: 'n', initialValue: 10 }));
    act(() => result.current.setValue(NaN));
    expect(result.current.value).toBe(10);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Field 'n'"));
    warn.mockRestore();
  });
});

describe('useNumericField: shown value is clamped', () => {
  it('a local value outside the current bounds is shown clamped', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumericField({ id: 'n', value: 500, onChange, max: 100 }));
    expect(result.current.value).toBe(100);
  });

  it('an integer field shows a fractional value rounded, after clamping', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useNumericField({ id: 'n', value: 2.5, onChange, integer: true }));
    expect(result.current.value).toBe(3);
    expect(result.current.valueText).toBe('3');
    const clamped = renderHook(() => useNumericField({ id: 'n', value: 12.7, onChange, integer: true, max: 10.4 }));
    expect(clamped.result.current.value).toBe(10);
  });
});
