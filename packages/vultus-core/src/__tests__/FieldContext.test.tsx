import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { FieldContextProvider, createFieldContext, useFieldContext } from '../FieldContext.js';
import { useBoolField } from '../useBoolField.js';
import { useOneOfField } from '../useOneOfField.js';

type Translate = { t: (k: string) => string };

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

describe('field context: functions in the options', () => {
  it('functions without parameters work without a provider', () => {
    const { result } = renderHook(() => useOneOfField({ id: 'm', label: () => 'Mode', choices: () => [{ value: 'a' }] }));
    expect(result.current.label).toBe('Mode');
    expect(result.current.value).toBe('a');
  });

  it('a context function without a provider throws', () => {
    expect(quietly(() => renderHook(() => useBoolField({ id: 'sec', label: (ctx: Translate) => ctx.t('x') }))))
      .toThrow(/Field 'sec': option 'label' is a function of the field context, but no FieldContextProvider is above it/);
  });

  it('the provider\'s value reaches the functions', () => {
    const { result } = renderHook(() => useBoolField({ id: 'sec', label: (ctx: Translate) => ctx.t('x') }), {
      wrapper: providing({ t: (k: string) => k.toUpperCase() }),
    });
    expect(result.current.label).toBe('X');
  });

  it('nested providers merge', () => {
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <FieldContextProvider value={{ t: (k: string) => k.toUpperCase() }}>
        <FieldContextProvider value={{ items: [1, 2] }}>{children}</FieldContextProvider>
      </FieldContextProvider>
    );
    const { result } = renderHook(() => useBoolField({
      id: 'sec', description: (ctx: Translate & { items: number[] }) => ctx.t(String(ctx.items.length)),
    }), { wrapper });
    expect(result.current.description).toBe('2');
  });

  it('a missing key throws, naming it and the provided keys', () => {
    const wrapper = providing({ t: (k: string) => k, lang: 'hu' });
    expect(quietly(() => renderHook(() => useBoolField({ id: 'sec', label: (ctx) => ctx.items }), { wrapper })))
      .toThrow(/Field context: 'items' was never provided \(provided: t, lang\)/);
  });

  it('a key provided as undefined is fine', () => {
    const { result } = renderHook(() => useBoolField({ id: 'sec', label: (ctx) => String(ctx.items) }), {
      wrapper: providing({ items: undefined }),
    });
    expect(result.current.label).toBe('undefined');
  });

  it('a function that returns undefined counts as an absent option, and falls back', () => {
    const { result } = renderHook(() => useBoolField({ id: 'sec', label: (ctx) => ctx.missing }), {
      wrapper: providing({ missing: undefined }),
    });
    expect(result.current.label).toBe('');
  });

  it('probing the context does not throw', () => {
    const { result } = renderHook(() => useBoolField({
      id: 'sec',
      label: (ctx) => [ctx.then, ctx.toJSON, ctx.asymmetricMatch, ctx.$$typeof, ctx[Symbol.iterator]].map(String).join(),
    }), { wrapper: providing({ t: (k: string) => k }) });
    expect(result.current.label).toBe('undefined,undefined,undefined,undefined,undefined');
  });

  it('vitest can print the context', () => {
    const { result } = renderHook(() => useFieldContext(), { wrapper: providing({ lang: 'hu' }) });
    // The snapshot prints with pretty-format and its plugins; a failed toBe words its message with loupe.
    expect(result.current).toMatchInlineSnapshot(`
      {
        "lang": "hu",
      }
    `);
    expect(() => expect(result.current).toBe('other')).toThrow(/expected \{ lang: 'hu' \} to be 'other'/);
  });

  it('initialValue may be a context function', () => {
    const { result } = renderHook(() => useBoolField({ id: 'sec', initialValue: (ctx: { on: boolean }) => ctx.on }), {
      wrapper: providing({ on: true }),
    });
    expect(result.current.value).toBe(true);
  });

  it('choices may be a context function', () => {
    const { result } = renderHook(() => useOneOfField({
      id: 'm', initialValue: 'a',
      choices: (ctx: { allow: boolean }) => [{ value: 'a' }, { value: 'b', enabled: ctx.allow }],
    }), { wrapper: providing({ allow: false }) });
    expect(result.current.choices[1].enabled).toBe(false);
  });

  it('createFieldContext gives a typed provider of the same context', () => {
    const C = createFieldContext<Translate>();
    const wrapper = ({ children }: { children?: ReactNode }) => <C.Provider value={{ t: () => 'T' }}>{children}</C.Provider>;
    const { result } = renderHook(() => useBoolField({ id: 'sec', label: (ctx: Translate) => ctx.t('x') }), { wrapper });
    expect(result.current.label).toBe('T');
  });
});
