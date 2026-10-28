import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { useBoolField } from '../useBoolField.js';
import { useOneOfField } from '../useOneOfField.js';
import { FieldContextProvider } from '../FieldContext.js';

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

/** Runs a render that throws; React logs the error before renderHook rethrows it, so the log is silenced. */
function quietly(render: () => unknown): () => void {
  return () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render();
    } finally {
      error.mockRestore();
    }
  };
}

describe('field: placeholder', () => {
  it('a plain string', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', placeholder: 'Pick one' }));
    expect(result.current.placeholder).toBe('Pick one');
  });

  it('a context function', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', placeholder: (ctx: { lang: string }) => `[${ctx.lang}]` }), {
      wrapper: providing({ lang: 'hu' }),
    });
    expect(result.current.placeholder).toBe('[hu]');
  });

  it('absent: undefined', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f' }));
    expect(result.current.placeholder).toBeUndefined();
  });
});

describe('field: commits', () => {
  it('false inside the field', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f' }));
    expect(result.current.commits).toBe(false);
  });

  it('false with onChange', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState(false);
      return useBoolField({ id: 'f', value, onChange: setValue });
    });
    expect(result.current.commits).toBe(false);
  });

  it('true with commit', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', value: false, commit: { fire: () => {} } }));
    expect(result.current.commits).toBe(true);
  });
});

describe('field: pending (the app\'s own)', () => {
  it('absent: not pending', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f' }));
    expect(result.current.pending).toBe(false);
  });

  it('true with onChange: pending, and a request is refused with a warning, onChange not called', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onChange = vi.fn();
    try {
      const { result } = renderHook(() => useBoolField({ id: 'f', value: false, onChange, pending: true }));
      expect(result.current.pending).toBe(true);
      act(() => result.current.setValue(true));
      expect(onChange).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("Field 'f': pending — request ignored");
    } finally {
      warn.mockRestore();
    }
  });

  it('a function of the field context', () => {
    const settling = (ctx: { settling: Set<string> }) => ctx.settling.has('f');
    const busy = renderHook(() => useBoolField({ id: 'f', pending: settling }), { wrapper: providing({ settling: new Set(['f']) }) });
    expect(busy.result.current.pending).toBe(true);
    const calm = renderHook(() => useBoolField({ id: 'f', pending: settling }), { wrapper: providing({ settling: new Set() }) });
    expect(calm.result.current.pending).toBe(false);
  });

  it('inside the field too: pending, the request refused, the value kept', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useBoolField({ id: 'f', pending: true }));
      expect(result.current.pending).toBe(true);
      act(() => result.current.setValue(true));
      expect(result.current.value).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('disabled and pending: the disabled warning, as disabled is checked first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useBoolField({ id: 'f', disabled: true, pending: true }));
      act(() => result.current.setValue(true));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'f': disabled — (no reason)");
    } finally {
      warn.mockRestore();
    }
  });

  it('with commit and the option true: the request is refused, the commit not fired', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fire = vi.fn();
    try {
      const { result } = renderHook(() => useBoolField({ id: 'f', value: false, pending: true, commit: { fire } }));
      act(() => result.current.setValue(true));
      expect(fire).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith("Field 'f': pending — request ignored");
    } finally {
      warn.mockRestore();
    }
  });

  it('with commit: either a running commit or the option makes the field pending', async () => {
    const running = renderHook(() => useBoolField({ id: 'f', value: false, pending: false, commit: { fire: () => new Promise<void>(() => {}) } }));
    expect(running.result.current.pending).toBe(false);
    act(() => running.result.current.setValue(true));
    await waitFor(() => expect(running.result.current.pending).toBe(true));
    const said = renderHook(() => useBoolField({ id: 'f', value: false, pending: true, commit: { fire: () => {} } }));
    expect(said.result.current.pending).toBe(true);
  });
});

describe('field: widget hint', () => {
  it('passed through', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', widget: { name: 'segmented', iconOnly: true } }));
    expect(result.current.widget).toEqual({ name: 'segmented', iconOnly: true });
  });

  it('absent: undefined', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f' }));
    expect(result.current.widget).toBeUndefined();
  });
});

describe('field: kind', () => {
  it('matching the hook\'s own kind is fine', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f', kind: 'boolean' }));
    expect(result.current.type).toBe('boolean');
  });

  it('a mismatched kind throws', () => {
    expect(quietly(() => renderHook(() => useBoolField({ id: 'x', kind: 'oneOf' }))))
      .toThrow(/Field 'x': a definition of kind 'oneOf' was passed to the 'boolean' hook/);
  });
});

describe('field: hrefFor', () => {
  it('with onChange: passed through', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState(false);
      return useBoolField({ id: 'f', value, onChange: setValue, hrefFor: (v) => `#?k=${v}` });
    });
    expect(result.current.hrefFor?.(true)).toBe('#?k=true');
  });

  it('with commit: passed through', () => {
    const { result } = renderHook(() => useBoolField({
      id: 'f', value: false, commit: { fire: () => {} }, hrefFor: (v) => `#?k=${v}`,
    }));
    expect(result.current.hrefFor?.(true)).toBe('#?k=true');
  });

  it('inside the field: undefined', () => {
    const { result } = renderHook(() => useBoolField({ id: 'f' }));
    expect(result.current.hrefFor?.(true)).toBeUndefined();
  });

  it('inside the field, an hrefFor passed anyway (untyped options) is ignored: undefined', () => {
    const hrefFor = vi.fn((v: boolean) => `#?k=${v}`);
    const { result } = renderHook(() => useBoolField({ id: 'f', hrefFor } as unknown as Parameters<typeof useBoolField>[0]));
    expect(result.current.hrefFor).toBeTypeOf('function');
    expect(result.current.hrefFor?.(true)).toBeUndefined();
    expect(hrefFor).not.toHaveBeenCalled();
  });
});

describe('one-of choices: note and dimmed', () => {
  it('carry note, default dimmed to false', () => {
    const { result } = renderHook(() => useOneOfField({
      id: 'mode', initialValue: 'a',
      choices: [{ value: 'a', note: '12' }, { value: 'b', dimmed: true }],
    }));
    expect(result.current.choices[0].note).toBe('12');
    expect(result.current.choices[0].dimmed).toBe(false);
    expect(result.current.choices[1].note).toBeUndefined();
    expect(result.current.choices[1].dimmed).toBe(true);
  });
});
