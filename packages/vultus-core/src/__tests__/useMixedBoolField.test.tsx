import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { aggregateBool, useMixedBoolField } from '../useMixedBoolField.js';
import { useBoolField } from '../useBoolField.js';

describe('aggregateBool', () => {
  it('is true when all are on, false when none is, mixed otherwise, undefined without items', () => {
    expect(aggregateBool([true, true])).toBe(true);
    expect(aggregateBool([false, false])).toBe(false);
    expect(aggregateBool([true, false, true])).toBe('mixed');
    expect(aggregateBool([])).toBeUndefined();
  });
});

describe('useMixedBoolField', () => {
  it('shows mixed; a toggle from mixed or off requests on, from on requests off', async () => {
    const fire = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useMixedBoolField({ id: 'autopilot', value, commit: { fire } }), {
      initialProps: { value: 'mixed' as boolean | 'mixed' },
    });
    expect(result.current.value).toBe('mixed');
    expect(result.current.type).toBe('mixed-boolean');
    await act(async () => { result.current.toggle(); });
    expect(fire).toHaveBeenLastCalledWith(true, expect.anything());
    rerender({ value: false });
    await act(async () => { result.current.toggle(); });
    expect(fire).toHaveBeenLastCalledWith(true, expect.anything());
    rerender({ value: true });
    await act(async () => { result.current.toggle(); });
    expect(fire).toHaveBeenLastCalledWith(false, expect.anything());
  });

  it('inside the field it starts at false and holds what was requested', () => {
    const { result } = renderHook(() => useMixedBoolField({ id: 'f', initialValue: 'mixed' }));
    expect(result.current.value).toBe('mixed');
    act(() => result.current.toggle());
    expect(result.current.value).toBe(true);
  });
});

describe('valueDescriptions', () => {
  it('the controls carry the description of the current value', () => {
    const descriptions = { true: 'All on.', false: 'All off.', mixed: 'Some on, some off.' };
    const mixed = renderHook(() => useMixedBoolField({ id: 'm', value: 'mixed', onChange: () => {}, valueDescriptions: descriptions }));
    expect(mixed.result.current.valueDescription).toBe('Some on, some off.');
    const plain = renderHook(() => useBoolField({ id: 'b', description: 'What it is.', valueDescriptions: { true: 'On now.' } }));
    expect(plain.result.current.valueDescription).toBeUndefined();
    expect(plain.result.current.description).toBe('What it is.');
    act(() => plain.result.current.toggle());
    expect(plain.result.current.valueDescription).toBe('On now.');
  });
});
