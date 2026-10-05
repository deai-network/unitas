import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useBoolField } from '../useBoolField.js';
import { denyWithReason } from '../decision.js';

describe('useBoolField: value inside the field', () => {
  it('starts at false (or initialValue) and changes locally', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', label: 'Notify me' }));
    expect(result.current.value).toBe(false);
    expect(result.current.type).toBe('boolean');
    act(() => result.current.toggle());
    expect(result.current.value).toBe(true);
    act(() => result.current.setValue(false));
    expect(result.current.value).toBe(false);
    const started = renderHook(() => useBoolField({ id: 'g', initialValue: true }));
    expect(started.result.current.value).toBe(true);
  });

  it('has no pending state or messages', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f' }));
    expect(result.current.pending).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.confirmationFor(true)).toBeUndefined();
  });
});

describe('useBoolField: value outside, changed locally', () => {
  it('shows the caller\'s value and hands changes to onChange', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState(true);
      return useBoolField({ id: 'f', value, onChange: setValue });
    });
    expect(result.current.value).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.value).toBe(false);
  });
});

describe('useBoolField: value outside, committed immediately', () => {
  it('runs the commit as an action: pending while it runs, then the value is whatever the caller has', async () => {
    let finish!: () => void;
    const fire = vi.fn((_next: boolean) => new Promise<void>((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook(({ value }) => useBoolField({ id: 'source.enabled', value, commit: { fire } }), {
      initialProps: { value: false },
    });
    act(() => result.current.setValue(true));
    expect(fire).toHaveBeenCalledWith(true, expect.objectContaining({ warn: expect.any(Function) }));
    expect(result.current.pending).toBe(true);
    expect(result.current.value).toBe(false);
    await act(async () => { finish(); });
    expect(result.current.pending).toBe(false);
    rerender({ value: true });
    expect(result.current.value).toBe(true);
  });

  it('the commit\'s messages become the field\'s', async () => {
    const { result } = renderHook(() => useBoolField({
      id: 'autopilot', value: false,
      commit: { fire: (_next, ctx) => { ctx.warn('3 pairs skipped'); } },
    }));
    await act(async () => { result.current.setValue(true); });
    expect(result.current.messages).toEqual([{ text: '3 pairs skipped', severity: 'warning' }]);
  });

  it('confirmation may depend on the requested value', () => {
    const { result } = renderHook(() => useBoolField({
      id: 'f', value: true,
      commit: {
        fire: () => {},
        confirmation: (next) => (next ? undefined : { kind: 'popconfirm', question: 'Switch off?' }),
      },
    }));
    expect(result.current.confirmationFor(false)).toEqual({ kind: 'popconfirm', question: 'Switch off?' });
    expect(result.current.confirmationFor(true)).toBeUndefined();
  });
});

describe('useBoolField: visibility and enabled state', () => {
  it('a disabled field carries its reason and ignores changes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fire = vi.fn();
    const { result } = renderHook(() => useBoolField({
      id: 'f', value: false, commit: { fire }, enabled: () => denyWithReason('Admins only'),
    }));
    expect(result.current.enabled).toBe(false);
    expect(result.current.whyDisabled).toBe('Admins only');
    act(() => result.current.setValue(true));
    expect(fire).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Field 'f'"));
    warn.mockRestore();
  });

  it('"disabled" works as the inverse of "enabled"; "hidden" as the inverse of "visible"', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', disabled: denyWithReason('not now'), hidden: true }));
    expect(result.current.enabled).toBe(true);
    expect(result.current.visible).toBe(false);
  });

  it('refuses contradictory options', () => {
    expect(() => renderHook(() => useBoolField({ id: 'f', visible: true, hidden: true }))).toThrow(/contradict/);
    expect(() => renderHook(() => useBoolField({ id: 'f', enabled: true, disabled: true }))).toThrow(/contradict/);
  });

  it('refuses a value without onChange or commit, and an initialValue with them', () => {
    expect(() => renderHook(() => useBoolField({ id: 'f', value: true } as never))).toThrow(/needs "onChange" or "commit"/);
    expect(() => renderHook(() => useBoolField({ id: 'f', value: true, onChange: () => {}, initialValue: false } as never))).toThrow(/initialValue/);
  });
});
