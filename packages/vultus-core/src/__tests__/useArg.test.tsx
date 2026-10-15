import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { memoryStore, type ArgStore, type RawChange } from '../argStore.js';
import { ArgStoreProvider } from '../ArgStoreContext.js';
import { FieldContextProvider } from '../FieldContext.js';
import { numberType, stringSetType, stringType } from '../valueTypes.js';
import { resetArg, setArg, useArg, useArgWriter, type ArgDefinition } from '../useArg.js';

function providing(store: ArgStore, fieldContext?: object) {
  return ({ children }: { children?: ReactNode }) => {
    const withStore = <ArgStoreProvider store={store}>{children}</ArgStoreProvider>;
    return fieldContext === undefined ? withStore : <FieldContextProvider value={fieldContext}>{withStore}</FieldContextProvider>;
  };
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

describe('useArg: reading', () => {
  it('an absent key gives the default, and isDefault is true', () => {
    const store = memoryStore();
    const definition: ArgDefinition<string> = { key: 'name', valueType: stringType, default: 'Ada' };
    const { result } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    expect(result.current.value).toBe('Ada');
    expect(result.current.isDefault).toBe(true);
  });

  it('a default as a context function resolves through the FieldContextProvider', () => {
    const store = memoryStore();
    const definition: ArgDefinition<number> = { key: 'n', valueType: numberType, default: (ctx: { n: number }) => ctx.n };
    const { result } = renderHook(() => useArg(definition), { wrapper: providing(store, { n: 7 }) });
    expect(result.current.value).toBe(7);
    expect(result.current.isDefault).toBe(true);
  });

  it('a raw value that does not parse gives the default, warning once over two renders', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ n: 'abc' });
    const definition: ArgDefinition<number> = { key: 'n', valueType: numberType, default: 0 };
    const { result, rerender } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    expect(result.current.value).toBe(0);
    rerender();
    expect(result.current.value).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`Argument 'n': cannot read 'abc', using the default`);
    warn.mockRestore();
  });

  it('value keeps its identity across a re-render that does not change the store', () => {
    const store = memoryStore({ list: 'a,b' });
    const definition: ArgDefinition<string[]> = { key: 'list', valueType: stringSetType, default: [] };
    const { result, rerender } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    const first = result.current.value;
    rerender();
    expect(result.current.value).toBe(first);
  });

  it('value keeps its identity across a re-render when the default builds a fresh value', () => {
    const store = memoryStore();
    const definition: ArgDefinition<string[]> = { key: 'tags', valueType: stringSetType, default: () => [] };
    const { result, rerender } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    const first = result.current.value;
    rerender();
    expect(result.current.value).toBe(first);
  });

  it('a context-function default follows a context change while the raw stays unparseable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ n: 'abc' });
    let n = 5;
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <FieldContextProvider value={{ n }}>
        <ArgStoreProvider store={store}>{children}</ArgStoreProvider>
      </FieldContextProvider>
    );
    const definition: ArgDefinition<number> = { key: 'n', valueType: numberType, default: (ctx: { n: number }) => ctx.n };
    const { result, rerender } = renderHook(() => useArg(definition), { wrapper });
    expect(result.current.value).toBe(5);
    expect(result.current.isDefault).toBe(true);

    n = 7;
    rerender();
    expect(result.current.value).toBe(7);
    expect(result.current.isDefault).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('no ArgStoreProvider above throws', () => {
    const definition: ArgDefinition<string> = { key: 'name', valueType: stringType, default: 'Ada' };
    expect(quietly(() => renderHook(() => useArg(definition)))).toThrow(/No ArgStoreProvider/);
  });
});

describe('useArg: writing', () => {
  it('set writes the formatted raw, and isDefault becomes false', () => {
    const store = memoryStore();
    const definition: ArgDefinition<number> = { key: 'n', valueType: numberType, default: 0 };
    const { result } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    act(() => result.current.set(5));
    expect(store.read('n')).toBe('5');
    expect(result.current.value).toBe(5);
    expect(result.current.isDefault).toBe(false);
  });

  it('setting a value equal to the default (as a set) leaves the key absent', () => {
    const store = memoryStore();
    const definition: ArgDefinition<string[]> = { key: 'tags', valueType: stringSetType, default: ['a', 'b'] };
    const { result } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    act(() => result.current.set(['b', 'a']));
    expect(store.read('tags')).toBe(undefined);
    expect(result.current.isDefault).toBe(true);
  });

  it('reset removes the key', () => {
    const store = memoryStore({ n: '5' });
    const definition: ArgDefinition<number> = { key: 'n', valueType: numberType, default: 0 };
    const { result } = renderHook(() => useArg(definition), { wrapper: providing(store) });
    act(() => result.current.reset());
    expect(store.read('n')).toBe(undefined);
    expect(result.current.isDefault).toBe(true);
  });

  it('two set calls on two arguments in one act leave both keys in the snapshot', () => {
    const store = memoryStore();
    const a: ArgDefinition<string> = { key: 'a', valueType: stringType, default: '' };
    const b: ArgDefinition<string> = { key: 'b', valueType: stringType, default: '' };
    const { result } = renderHook(() => ({ a: useArg(a), b: useArg(b) }), { wrapper: providing(store) });
    act(() => {
      result.current.a.set('x');
      result.current.b.set('y');
    });
    expect(store.snapshot()).toEqual({ a: 'x', b: 'y' });
  });

  it('hrefFor is undefined without the store\'s own hrefFor, and the store\'s result with one', () => {
    const plain = memoryStore();
    const definition: ArgDefinition<number> = { key: 'n', valueType: numberType, default: 0 };
    const { result: plainResult } = renderHook(() => useArg(definition), { wrapper: providing(plain) });
    expect(plainResult.current.hrefFor(5)).toBe(undefined);

    const withHref: ArgStore = {
      ...memoryStore(),
      hrefFor: (changes: RawChange[]) => `/?${changes.map((c) => `${c.key}=${c.raw}`).join('&')}`,
    };
    const { result: hrefResult } = renderHook(() => useArg(definition), { wrapper: providing(withHref) });
    expect(hrefResult.current.hrefFor(5)).toBe('/?n=5');
  });
});

describe('useArgWriter', () => {
  it('applies a batch as one store.write call, resolving each change\'s default', () => {
    const store = memoryStore();
    const write = vi.spyOn(store, 'write');
    const a: ArgDefinition<string> = { key: 'a', valueType: stringType, default: '' };
    const b: ArgDefinition<string> = { key: 'b', valueType: stringType, default: '' };
    const { result } = renderHook(() => useArgWriter(), { wrapper: providing(store) });
    act(() => result.current([setArg(a, 'x'), resetArg(b)], 'push'));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([{ key: 'a', raw: 'x' }, { key: 'b', raw: undefined }], 'push');
  });
});
