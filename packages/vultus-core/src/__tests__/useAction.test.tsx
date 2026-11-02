import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAction } from '../useAction.js';
import { allow, denyWithReason } from '../decision.js';

describe('useAction', () => {
  it('returns initial status with pending=false, disabled derived from enabled', () => {
    const { result } = renderHook(() =>
      useAction({
        id: 'a',
        label: 'Click',
        enabled: () => denyWithReason('locked'),
        fire: async () => {},
      }),
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.disabled).toBe(true);
    expect(result.current.reason).toBe('locked');
    expect(result.current.label).toBe('Click');
    expect(result.current.errors).toEqual([]);
  });

  it('fire flips pending → calls fire → restores pending', async () => {
    const fire = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useAction({ id: 'b', label: 'Go', fire }),
    );
    expect(result.current.pending).toBe(false);
    await act(async () => {
      await result.current.firePromise();
    });
    expect(fire).toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('disabled-fire logs warn + early-returns', async () => {
    const fire = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useAction({ id: 'c', label: 'X', enabled: () => denyWithReason('no'), fire }),
    );
    await act(async () => {
      await result.current.firePromise();
    });
    expect(fire).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Action 'c'"));
    warn.mockRestore();
  });

  it('error path: populates errors[] with parsed message', async () => {
    const { result } = renderHook(() =>
      useAction({
        id: 'd',
        label: 'X',
        fire: async () => {
          throw { status: 500, body: { message: 'boom' } };
        },
      }),
    );
    await act(async () => {
      await result.current.firePromise();
    });
    expect(result.current.errors).toEqual(['boom']);
  });

  it('onSuccess invoked with result on happy path', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useAction({
        id: 'e',
        label: 'X',
        fire: async () => ({ slug: 'new' }),
        onSuccess,
      }),
    );
    await act(async () => {
      await result.current.firePromise();
    });
    expect(onSuccess).toHaveBeenCalledWith({ slug: 'new' });
    expect(result.current.errors).toEqual([]);
  });

  it('respects allow() with reason', () => {
    const { result } = renderHook(() =>
      useAction({
        id: 'f',
        label: 'X',
        enabled: () => allow('ok-for-now'),
        fire: async () => {},
      }),
    );
    expect(result.current.disabled).toBe(false);
    expect(result.current.reason).toBe('ok-for-now');
  });

  it('invisible flag bubbles through unchanged', () => {
    const { result } = renderHook(() =>
      useAction({
        id: 'g',
        label: 'X',
        invisible: () => true,
        fire: async () => {},
      }),
    );
    expect(result.current.invisible).toBe(true);
  });

  it('ariaExpanded absent: undefined (not false), so no aria-expanded attribute', () => {
    const { result } = renderHook(() =>
      useAction({ id: 'i', label: 'X', fire: async () => {} }),
    );
    expect(result.current.ariaExpanded).toBeUndefined();
  });

  it('ariaExpanded value is carried through, false included', () => {
    const { result } = renderHook(() =>
      useAction({ id: 'j', label: 'X', ariaExpanded: false, fire: async () => {} }),
    );
    expect(result.current.ariaExpanded).toBe(false);
  });

  it('ariaExpanded thunk is resolved', () => {
    const { result } = renderHook(() =>
      useAction({ id: 'k', label: 'X', ariaExpanded: () => true, fire: async () => {} }),
    );
    expect(result.current.ariaExpanded).toBe(true);
  });

  it('ariaExpanded follows a re-render that only flips the thunk\'s closure value (the status memo depends on it)', () => {
    // The same options object on every render: only what the thunk reads changes.
    let shown = false;
    const opts = { id: 'l', label: 'Settings', ariaExpanded: () => shown, fire: async () => {} };
    const { result, rerender } = renderHook(() => useAction(opts));
    expect(result.current.ariaExpanded).toBe(false);
    shown = true;
    rerender();
    expect(result.current.ariaExpanded).toBe(true);
  });

  it('passes typed args from firePromise(args) to opts.fire(args)', async () => {
    const fire = vi.fn(async (args: { name: string }) => args);
    const { result } = renderHook(() =>
      useAction<{ name: string }, { name: string }>({
        id: 'h',
        label: 'X',
        fire,
      }),
    );
    await act(async () => {
      await result.current.firePromise({ name: 'kit' });
    });
    expect(fire).toHaveBeenCalledWith({ name: 'kit' }, expect.objectContaining({ info: expect.any(Function) }));
  });
});
