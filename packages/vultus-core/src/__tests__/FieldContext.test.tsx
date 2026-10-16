import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  FieldContextProvider, NO_FIELD_CONTEXT, createFieldContext, extendFieldContext, useFieldContext, withFieldContext,
} from '../FieldContext.js';
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

  it('a function without declared parameters gets the context when a provider is above, and nothing otherwise', () => {
    const label = (ctx: any = {}) => ctx.t?.('x') ?? 'none';
    const provided = renderHook(() => useBoolField({ id: 'sec', label }), { wrapper: providing({ t: () => 'T' }) });
    expect(provided.result.current.label).toBe('T');
    const alone = renderHook(() => useBoolField({ id: 'sec', label }));
    expect(alone.result.current.label).toBe('none');
  });

  it('a missing key throws, naming the field, the option, the key and the provided keys', () => {
    const wrapper = providing({ t: (k: string) => k, lang: 'hu' });
    expect(quietly(() => renderHook(() => useBoolField({ id: 'sec', label: (ctx) => ctx.items }), { wrapper })))
      .toThrow(/^Field 'sec': option 'label': Field context: 'items' was never provided \(provided: t, lang\)$/);
  });

  it('a missing key read outside a field\'s option throws the bare message', () => {
    const { result } = renderHook(() => useFieldContext(), { wrapper: providing({ t: (k: string) => k, lang: 'hu' }) });
    expect(() => (result.current as { items?: unknown }).items)
      .toThrow(/^Field context: 'items' was never provided \(provided: t, lang\)$/);
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

describe('field context: groups', () => {
  const appContext = () => renderHook(() => useFieldContext(), { wrapper: providing({ t: (k: string) => k, lang: 'hu' }) }).result.current;

  it('extending keeps the base\'s keys and adds the extra ones, guarded', () => {
    const ctx = extendFieldContext(appContext(), { values: { layout: 'rendered' } }, 'Field group') as {
      t: (k: string) => string; lang: string; values: { layout: string }; items?: unknown;
    };
    expect(ctx.t('x')).toBe('x');
    expect(ctx.lang).toBe('hu');
    expect(ctx.values.layout).toBe('rendered');
    expect(() => ctx.items).toThrow(/^Field context: 'items' was never provided \(provided: t, lang, values\)$/);
  });

  it('extending no context gives just the extra keys', () => {
    const ctx = extendFieldContext(NO_FIELD_CONTEXT, { values: { layout: 'rendered' } }, 'Field group');
    expect(Object.keys(ctx)).toEqual(['values']);
    expect(() => (ctx as { t?: unknown }).t).toThrow(/^Field context: 't' was never provided \(provided: values\)$/);
  });

  it('extending reads the extra keys when they are read, not before', () => {
    const extra = { get values(): never { throw new Error('read too early'); } };
    const ctx = extendFieldContext(appContext(), extra, 'Field group');
    expect(() => (ctx as { values?: unknown }).values).toThrow('read too early');
  });

  it('extending with a key the base already has throws', () => {
    const { result } = renderHook(() => useFieldContext(), { wrapper: providing({ values: { mine: 1 } }) });
    expect(() => extendFieldContext(result.current, { values: {} }, 'Field group'))
      .toThrow(/^Field group: the field context already has 'values'; a field group provides it$/);
  });

  it('a hook called inside withFieldContext sees the given context', () => {
    const ctx = extendFieldContext(appContext(), { values: { layout: 'original' } }, 'Field group');
    const { result } = renderHook(() => withFieldContext(ctx, () => useBoolField({
      id: 'copies', label: (c: { values: { layout: string } }) => c.values.layout,
    })), { wrapper: providing({ t: (k: string) => k }) });
    expect(result.current.label).toBe('original');
  });

  it('withFieldContext restores the context after run, and after run throws', () => {
    const given = extendFieldContext(NO_FIELD_CONTEXT, { values: {} }, 'Field group');
    const { result } = renderHook(() => {
      const inside = withFieldContext(given, () => useFieldContext());
      const after = useFieldContext();
      let thrown: unknown;
      try {
        withFieldContext(given, () => {
          useFieldContext();
          throw new Error('boom');
        });
      } catch (error) {
        thrown = error;
      }
      return { inside, after, thrown, afterThrow: useFieldContext() };
    }, { wrapper: providing({ lang: 'hu' }) });
    expect(result.current.inside).toBe(given);
    expect(result.current.after).not.toBe(given);
    expect((result.current.after as { lang: string }).lang).toBe('hu');
    expect(result.current.thrown).toEqual(new Error('boom'));
    expect(result.current.afterThrow).toBe(result.current.after);
  });

  it('withFieldContext nests', () => {
    const outer = extendFieldContext(NO_FIELD_CONTEXT, { values: { n: 1 } }, 'Field group');
    const inner = extendFieldContext(NO_FIELD_CONTEXT, { values: { n: 2 } }, 'Field group');
    const { result } = renderHook(() => withFieldContext(outer, () => [
      useFieldContext(), withFieldContext(inner, () => useFieldContext()), useFieldContext(),
    ]));
    expect(result.current[0]).toBe(outer);
    expect(result.current[1]).toBe(inner);
    expect(result.current[2]).toBe(outer);
  });

  it('reading ctx.values outside a field group throws, naming the field and the option', () => {
    expect(quietly(() => renderHook(() => useBoolField({ id: 'sec', label: (ctx) => ctx.values.layout }), {
      wrapper: providing({ t: (k: string) => k }),
    }))).toThrow(/^Field 'sec': option 'label': ctx\.values is only available inside a field group$/);
  });
});
