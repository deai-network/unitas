import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useAction } from '../useAction.js';
import { MessageSinkContext } from '../MessageSink.js';

const withSink = (sink: (text: string, severity?: string) => void) =>
  ({ children }: { children: ReactNode }) => <MessageSinkContext.Provider value={sink}>{children}</MessageSinkContext.Provider>;

describe('ExecutionContext', () => {
  it('an action reports messages with their severity; they land on the status and go to the sink', async () => {
    const sink = vi.fn();
    const { result } = renderHook(() => useAction({
      id: 'bulk',
      label: 'Autopilot on',
      fire: (_args, ctx) => {
        ctx.info('Started');
        ctx.warn('3 pairs skipped');
      },
    }), { wrapper: withSink(sink) });
    await act(async () => { await result.current.firePromise(); });
    expect(result.current.messages).toEqual([
      { text: 'Started', severity: 'info' },
      { text: '3 pairs skipped', severity: 'warning' },
    ]);
    expect(result.current.errors).toEqual([]);
    expect(sink).toHaveBeenCalledWith('Started', 'info');
    expect(sink).toHaveBeenCalledWith('3 pairs skipped', 'warning');
  });

  it('ctx.error reports an error without failing; errors lists the error texts', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAction({
      id: 'partial', label: 'Go', onSuccess,
      fire: (_args, ctx) => { ctx.error('One item failed'); },
    }));
    await act(async () => { await result.current.firePromise(); });
    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.errors).toEqual(['One item failed']);
  });

  it('a thrown error ends the run as an error message after the reported ones', async () => {
    const { result } = renderHook(() => useAction({
      id: 'fails', label: 'Go',
      fire: async (_args, ctx) => {
        ctx.info('Step 1 done');
        throw { status: 500, body: { message: 'Step 2 broke' } };
      },
    }));
    await act(async () => { await result.current.firePromise(); });
    expect(result.current.messages).toEqual([
      { text: 'Step 1 done', severity: 'info' },
      { text: 'Step 2 broke', severity: 'error' },
    ]);
    expect(result.current.errors).toEqual(['Step 2 broke']);
  });

  it('a new run starts with no messages', async () => {
    let first = true;
    const { result } = renderHook(() => useAction({
      id: 'again', label: 'Go',
      fire: (_args, ctx) => { if (first) ctx.warn('first run only'); first = false; },
    }));
    await act(async () => { await result.current.firePromise(); });
    expect(result.current.messages).toHaveLength(1);
    await act(async () => { await result.current.firePromise(); });
    expect(result.current.messages).toEqual([]);
  });
});
