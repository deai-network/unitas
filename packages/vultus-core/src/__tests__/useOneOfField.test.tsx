import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useOneOfField, type OneOfChoice } from '../useOneOfField.js';
import { denyWithReason } from '../decision.js';

type Mode = 'manual' | 'plan' | 'bypass';

const CHOICES: OneOfChoice<Mode>[] = [
  { value: 'manual', label: 'Manual', description: 'Asks before acting' },
  { value: 'plan', label: 'Plan', description: 'Plans without editing' },
  { value: 'bypass', description: 'Runs everything', enabled: denyWithReason('Not allowed for this task') },
];

describe('useOneOfField: value inside the field', () => {
  it('starts at initialValue and changes locally', () => {
    const { result } = renderHook(() => useOneOfField({ id: 'mode', label: 'Mode', choices: CHOICES, initialValue: 'plan' }));
    expect(result.current.type).toBe('oneOf');
    expect(result.current.value).toBe('plan');
    act(() => result.current.setValue('manual'));
    expect(result.current.value).toBe('manual');
  });

  it('without initialValue starts at the first enabled choice', () => {
    const { result } = renderHook(() => useOneOfField({
      id: 'mode', choices: [{ value: 'a', disabled: true }, { value: 'b' }],
    }));
    expect(result.current.value).toBe('b');
  });
});

describe('useOneOfField: choices', () => {
  it('resolves each choice: label (default: the value), description, enabled with a reason', () => {
    const { result } = renderHook(() => useOneOfField({ id: 'mode', choices: CHOICES, initialValue: 'manual' }));
    expect(result.current.choices).toEqual([
      { value: 'manual', label: 'Manual', description: 'Asks before acting', enabled: true, whyDisabled: undefined, variant: 'default' },
      { value: 'plan', label: 'Plan', description: 'Plans without editing', enabled: true, whyDisabled: undefined, variant: 'default' },
      { value: 'bypass', label: 'bypass', description: 'Runs everything', enabled: false, whyDisabled: 'Not allowed for this task', variant: 'default' },
    ]);
    expect(result.current.current?.value).toBe('manual');
  });

  it('passes a choice\'s group through (none: undefined)', () => {
    const { result } = renderHook(() => useOneOfField({
      id: 'model', initialValue: 'opus',
      choices: [{ value: 'opus' }, { value: 'opus-4', group: 'Older versions' }],
    }));
    expect(result.current.choices.map((c) => c.group)).toEqual([undefined, 'Older versions']);
  });

  it('choices may be derived (a function)', () => {
    const { result, rerender } = renderHook(({ allow }) => useOneOfField({
      id: 'mode', initialValue: 'manual',
      choices: () => [{ value: 'manual' }, { value: 'bypass', enabled: allow }],
    }), { initialProps: { allow: false } });
    expect(result.current.choices[1].enabled).toBe(false);
    rerender({ allow: true });
    expect(result.current.choices[1].enabled).toBe(true);
  });

  it('refuses a disabled or unknown choice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOneOfField({ id: 'mode', choices: CHOICES, initialValue: 'manual' }));
    act(() => result.current.setValue('bypass'));
    expect(result.current.value).toBe('manual');
    act(() => result.current.setValue('nope' as Mode));
    expect(result.current.value).toBe('manual');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('useOneOfField: current state', () => {
  it('the current choice\'s description, unless valueDescriptions words the state differently', () => {
    const { result } = renderHook(() => useOneOfField({
      id: 'mode', choices: CHOICES, initialValue: 'manual',
      valueDescriptions: { plan: 'Planning: nothing is edited.' },
    }));
    expect(result.current.valueDescription).toBe('Asks before acting');
    act(() => result.current.setValue('plan'));
    expect(result.current.valueDescription).toBe('Planning: nothing is edited.');
  });
});

describe('useOneOfField: value outside', () => {
  it('changed locally: shows the caller\'s value and hands changes to onChange', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState<Mode>('manual');
      return useOneOfField({ id: 'mode', choices: CHOICES, value, onChange: setValue });
    });
    act(() => result.current.setValue('plan'));
    expect(result.current.value).toBe('plan');
  });

  it('committed immediately: pending while the commit runs; confirmation per requested choice', async () => {
    let finish!: () => void;
    const fire = vi.fn((_next: Mode) => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useOneOfField({
      id: 'mode', choices: CHOICES, value: 'manual' as Mode,
      commit: { fire, confirmation: (next) => (next === 'plan' ? { kind: 'popconfirm', question: 'Plan?' } : undefined) },
    }));
    expect(result.current.confirmationFor('plan')).toEqual({ kind: 'popconfirm', question: 'Plan?' });
    expect(result.current.confirmationFor('manual')).toBeUndefined();
    act(() => result.current.setValue('plan'));
    expect(fire).toHaveBeenCalledWith('plan', expect.objectContaining({ warn: expect.any(Function) }));
    expect(result.current.pending).toBe(true);
    await act(async () => { finish(); });
    expect(result.current.pending).toBe(false);
  });
});

describe('useOneOfField: variants', () => {
  it('a choice may be primary or danger, like an action (default: default)', () => {
    const { result } = renderHook(() => useOneOfField({
      id: 'mode', initialValue: 'a',
      choices: [{ value: 'a' }, { value: 'b', variant: 'primary' }, { value: 'c', variant: 'danger' }],
    }));
    expect(result.current.choices.map((c) => c.variant)).toEqual(['default', 'primary', 'danger']);
  });
});

describe('useOneOfField: icons', () => {
  it('a choice may carry an icon, like an action', () => {
    const sun = <span data-testid="sun" />;
    const { result } = renderHook(() => useOneOfField({
      id: 'theme', initialValue: 'light', choices: [{ value: 'light', icon: sun }, { value: 'dark' }],
    }));
    expect(result.current.choices[0].icon).toBe(sun);
    expect(result.current.choices[1].icon).toBeUndefined();
  });
});
