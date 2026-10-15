import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useRangeField } from '../useRangeField.js';
import { FieldContextProvider } from '../FieldContext.js';

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

describe('useRangeField: implicit initial value', () => {
  it('starts at [min, max]', () => {
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 2010, max: 2025 }));
    expect(result.current.type).toBe('range');
    expect(result.current.value).toEqual([2010, 2025]);
  });

  it('min and max as context functions', () => {
    const { result } = renderHook(() => useRangeField({
      id: 'r', min: (ctx: { lo: number }) => ctx.lo, max: (ctx: { hi: number }) => ctx.hi,
    }), { wrapper: providing({ lo: 2010, hi: 2025 }) });
    expect(result.current.value).toEqual([2010, 2025]);
  });
});

describe('useRangeField: valueText', () => {
  it('joins the two formatted ends with an en dash', () => {
    const { result } = renderHook(() => useRangeField({
      id: 'r', min: 2000, max: 2030, initialValue: [2010, 2025],
      format: (y) => `${y}/${String(y + 1).slice(2)}`,
    }));
    expect(result.current.valueText).toBe('2010/11–2025/26');
  });
});

describe('useRangeField: shown value is clamped and ordered', () => {
  it('a local value outside the current bounds is shown clamped', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useRangeField({
      id: 'r', value: [2005, 2030], onChange, min: 2010, max: 2025,
    }));
    expect(result.current.value).toEqual([2010, 2025]);
  });

  it('an integer field shows fractional ends rounded, after clamping', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useRangeField({
      id: 'r', value: [2.5, 12.7], onChange, min: 0, max: 10.4, integer: true,
    }));
    expect(result.current.value).toEqual([3, 10]);
    expect(result.current.valueText).toBe('3–10');
  });
});

describe('useRangeField: requests', () => {
  it('an out-of-order request is shown ordered', () => {
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 2000, max: 2030 }));
    act(() => result.current.setValue([2020, 2015]));
    expect(result.current.value).toEqual([2015, 2020]);
  });

  it('a request is clamped into the bounds', () => {
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 2010, max: 2025 }));
    act(() => result.current.setValue([1990, 2050]));
    expect(result.current.value).toEqual([2010, 2025]);
  });

  it('integer rounds a fractional request', () => {
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 0, max: 100, integer: true }));
    act(() => result.current.setValue([1.2, 2.8]));
    expect(result.current.value).toEqual([1, 3]);
  });

  it('a non-finite end refuses the request with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 2010, max: 2025, initialValue: [2012, 2020] }));
    act(() => result.current.setValue([2012, NaN]));
    expect(result.current.value).toEqual([2012, 2020]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Field 'r'"));
    warn.mockRestore();
  });
});

describe('useRangeField: step', () => {
  it('defaults to 1', () => {
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 2010, max: 2025 }));
    expect(result.current.step).toBe(1);
  });

  it('an explicit step is kept', () => {
    const { result } = renderHook(() => useRangeField({ id: 'r', min: 2010, max: 2025, step: 5 }));
    expect(result.current.step).toBe(5);
  });
});
