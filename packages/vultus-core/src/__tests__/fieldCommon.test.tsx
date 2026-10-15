import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
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
