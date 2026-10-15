import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { memoryStore, type ArgStore } from '../argStore.js';
import { ArgStoreProvider } from '../ArgStoreContext.js';
import { FieldContextProvider, NO_FIELD_CONTEXT } from '../FieldContext.js';
import type { FieldDefinition } from '../kinds.js';
import { stringSetType } from '../valueTypes.js';
import { useOneOfField } from '../useOneOfField.js';
import { useManyOfField } from '../useManyOfField.js';
import { useRangeField } from '../useRangeField.js';
import { useTreeField } from '../useTreeField.js';
import type { TreeNode } from '../tree.js';
import { argOf, useStoredField, useStoredFields } from '../useStoredField.js';

type DefinitionOf<K extends FieldDefinition['kind']> = Extract<FieldDefinition, { kind: K }>;

const LEVEL: DefinitionOf<'oneOf'> = {
  kind: 'oneOf', id: 'level', choices: [{ value: 'easy' }, { value: 'medium' }, { value: 'hard' }], initialValue: 'medium',
};
const ROUNDS: DefinitionOf<'manyOf'> = {
  kind: 'manyOf', id: 'rounds',
  choices: [{ value: 'school' }, { value: 'regional' }, { value: 'final' }],
  initialValue: ['regional', 'final'],
};
const QUERY: DefinitionOf<'text'> = { kind: 'text', id: 'q' };
const YEARS: DefinitionOf<'range'> = { kind: 'range', id: 'years', min: 2010, max: 2025 };
const NODES: TreeNode[] = [
  { value: 'A', children: [{ value: 'A1' }, { value: 'A2' }] },
  { value: 'B' },
];
const TOPICS: DefinitionOf<'tree'> = { kind: 'tree', id: 'topics', nodes: NODES };
const TAGS: DefinitionOf<'manyOf'> = { kind: 'manyOf', id: 'tags', choices: [{ value: 'a' }, { value: 'b' }] };
const ALL_DONE: DefinitionOf<'mixed-boolean'> = { kind: 'mixed-boolean', id: 'allDone' };

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

describe('argOf', () => {
  it('derives the argument: the id as key, the kind\'s value type, the resolved initial value as default', () => {
    const definition: DefinitionOf<'manyOf'> = {
      kind: 'manyOf', id: 'rounds', choices: [{ value: 'a' }, { value: 'b' }],
      initialValue: (ctx: { all: string[] }) => ctx.all,
    };
    const arg = argOf(definition, { all: ['a', 'b'] });
    expect(arg.key).toBe('rounds');
    expect(arg.valueType).toBe(stringSetType);
    expect(arg.default).toEqual(['a', 'b']);
  });

  it('a mixed-boolean definition throws, naming the field', () => {
    expect(() => argOf(ALL_DONE, NO_FIELD_CONTEXT)).toThrow(
      `Field 'allDone': a mixed-boolean field is an aggregate of other data and cannot be stored`,
    );
  });
});

describe('useStoredField', () => {
  it('an absent key shows the initial value; a change writes the store with replace; reset removes the key', () => {
    const store = memoryStore();
    const write = vi.spyOn(store, 'write');
    const { result } = renderHook(() => {
      const stored = useStoredField(LEVEL);
      return { stored, field: useOneOfField(stored.options) };
    }, { wrapper: providing(store) });
    expect(result.current.field.value).toBe('medium');
    expect(result.current.stored.isDefault).toBe(true);

    act(() => result.current.field.setValue('hard'));
    expect(write).toHaveBeenCalledWith([{ key: 'level', raw: 'hard' }], 'replace');
    expect(store.snapshot()).toEqual({ level: 'hard' });
    expect(result.current.field.value).toBe('hard');
    expect(result.current.stored.isDefault).toBe(false);

    act(() => result.current.stored.reset());
    expect(store.snapshot()).toEqual({});
    expect(result.current.field.value).toBe('medium');
  });

  it('options are the definition in its outside form: no initialValue, value and onChange instead', () => {
    const store = memoryStore();
    const { result } = renderHook(() => useStoredField(LEVEL), { wrapper: providing(store) });
    const { options } = result.current;
    expect('initialValue' in options).toBe(false);
    expect(options.kind).toBe('oneOf');
    expect(options.id).toBe('level');
    expect(options.choices).toBe(LEVEL.choices);
    expect(options.value).toBe('medium');
  });

  it('many-of: unchecking every choice stores a present but empty list; an absent key reads the default', () => {
    const store = memoryStore();
    const { result } = renderHook(() => {
      const stored = useStoredField(ROUNDS);
      return { stored, field: useManyOfField(stored.options) };
    }, { wrapper: providing(store) });
    expect(result.current.field.value).toEqual(['regional', 'final']);

    act(() => result.current.field.toggle('regional'));
    act(() => result.current.field.toggle('final'));
    expect(store.snapshot()).toEqual({ rounds: '' });
    expect(result.current.field.value).toEqual([]);
    expect(result.current.stored.isDefault).toBe(false);

    act(() => result.current.stored.reset());
    expect(store.snapshot()).toEqual({});
    expect(result.current.field.value).toEqual(['regional', 'final']);
    expect(result.current.stored.isDefault).toBe(true);
  });

  it('a stored one-of value that is not a choice shows the initial value, counts as the default, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ level: 'insane' });
    const { result, rerender } = renderHook(() => {
      const stored = useStoredField(LEVEL);
      return { stored, field: useOneOfField(stored.options) };
    }, { wrapper: providing(store) });
    expect(result.current.field.value).toBe('medium');
    expect(result.current.stored.isDefault).toBe(true);
    rerender();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`Field 'level': stored value 'insane' is not one of its choices, using 'medium'`);
    warn.mockRestore();
  });

  it('warns once per stored value, not again when only the definition or the field context is a new object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ level: 'insane' });
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <FieldContextProvider value={{ fresh: true }}>
        <ArgStoreProvider store={store}>{children}</ArgStoreProvider>
      </FieldContextProvider>
    );
    const { result, rerender } = renderHook(() => useStoredField({ ...LEVEL }), { wrapper });
    rerender();
    rerender();
    expect(result.current.options.value).toBe('medium');
    expect(warn).toHaveBeenCalledTimes(1);

    act(() => store.write([{ key: 'level', raw: 'mad' }], 'replace'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith(`Field 'level': stored value 'mad' is not one of its choices, using 'medium'`);
    warn.mockRestore();
  });

  it('an absent key shows the default sanitized silently: it is the definer\'s, not stored input', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore();
    const definition: DefinitionOf<'manyOf'> = { ...ROUNDS, initialValue: ['regional', 'gone'] };
    const { result } = renderHook(() => useStoredField(definition), { wrapper: providing(store) });
    expect(result.current.options.value).toEqual(['regional']);
    expect(result.current.isDefault).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('tree: re-selecting the default state leaves the key absent, the default being normalized', () => {
    const store = memoryStore();
    const definition: DefinitionOf<'tree'> = { ...TOPICS, initialValue: ['A1', 'A2'] };
    const { result } = renderHook(() => {
      const stored = useStoredField(definition);
      return { stored, field: useTreeField(stored.options) };
    }, { wrapper: providing(store) });
    expect(result.current.field.value).toEqual(['A']);
    expect(result.current.stored.isDefault).toBe(true);
    act(() => result.current.field.toggle('B'));
    expect(store.snapshot()).toEqual({ topics: 'A,B' });
    act(() => result.current.field.toggle('B'));
    expect(store.snapshot()).toEqual({});
    expect(result.current.stored.isDefault).toBe(true);
  });

  it('a definition typed as the FieldDefinition union gives options that narrow by kind', () => {
    const store = memoryStore();
    const definition = ROUNDS as FieldDefinition; // an annotation would narrow it to the many-of member by assignment
    const { result } = renderHook(() => useStoredField(definition), { wrapper: providing(store) });
    const { options } = result.current;
    if (options.kind !== 'manyOf') throw new Error('expected many-of options');
    expect(options.choices).toBe(ROUNDS.choices);
  });

  it('a stored range clamped to the bounds shows them, and counts as the default when they are the default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ years: '2005..2030' });
    const { result } = renderHook(() => {
      const stored = useStoredField(YEARS);
      return { stored, field: useRangeField(stored.options) };
    }, { wrapper: providing(store) });
    expect(result.current.field.value).toEqual([2010, 2025]);
    expect(result.current.stored.isDefault).toBe(true);
    expect(warn).toHaveBeenCalledWith(`Field 'years': stored range 2005..2030 is outside its bounds, using 2010..2025`);
    warn.mockRestore();
  });

  it('a mixed-boolean definition throws, naming the field', () => {
    const store = memoryStore();
    expect(quietly(() => renderHook(() => useStoredField(ALL_DONE), { wrapper: providing(store) }))).toThrow(
      `Field 'allDone': a mixed-boolean field is an aggregate of other data and cannot be stored`,
    );
  });
});

describe('useStoredField: value identity', () => {
  it('many-of: options.value and the hook\'s value keep their identity across a re-render', () => {
    const store = memoryStore({ rounds: 'final,school' });
    const { result, rerender } = renderHook(() => {
      const stored = useStoredField(ROUNDS);
      return { stored, field: useManyOfField(stored.options) };
    }, { wrapper: providing(store) });
    const first = result.current.stored.options.value;
    expect(first).toEqual(['school', 'final']);
    rerender();
    expect(result.current.stored.options.value).toBe(first);
    expect(result.current.field.value).toBe(first);
  });

  it('tree: options.value and useTreeField\'s value keep their identity across a re-render', () => {
    const store = memoryStore({ topics: 'A1,A2,B' });
    const { result, rerender } = renderHook(() => {
      const stored = useStoredField(TOPICS);
      return { stored, field: useTreeField(stored.options) };
    }, { wrapper: providing(store) });
    const first = result.current.stored.options.value;
    expect(first).toEqual(['A', 'B']);
    rerender();
    expect(result.current.stored.options.value).toBe(first);
    expect(result.current.field.value).toBe(first);
  });

  it('options and onChange keep their identity across a re-render, for a many-of and a tree without initialValue', () => {
    const store = memoryStore();
    const { result, rerender } = renderHook(() => ({ tags: useStoredField(TAGS), topics: useStoredField(TOPICS) }), {
      wrapper: providing(store),
    });
    const { tags, topics } = result.current;
    rerender();
    expect(result.current.tags.options).toBe(tags.options);
    expect(result.current.tags.options.onChange).toBe(tags.options.onChange);
    expect(result.current.topics.options).toBe(topics.options);
    expect(result.current.topics.options.onChange).toBe(topics.options.onChange);
  });

  it('keeps its identity when the field context is a fresh object on every render', () => {
    const store = memoryStore({ rounds: 'final' });
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <FieldContextProvider value={{ round: 'final' }}>
        <ArgStoreProvider store={store}>{children}</ArgStoreProvider>
      </FieldContextProvider>
    );
    const { result, rerender } = renderHook(() => useStoredField(ROUNDS), { wrapper });
    const first = result.current.options.value;
    rerender();
    expect(result.current.options.value).toBe(first);
  });

  it('takes a new value when the store changes', () => {
    const store = memoryStore({ rounds: 'final' });
    const { result } = renderHook(() => useStoredField(ROUNDS), { wrapper: providing(store) });
    const first = result.current.options.value;
    act(() => store.write([{ key: 'rounds', raw: 'school' }], 'replace'));
    expect(result.current.options.value).not.toBe(first);
    expect(result.current.options.value).toEqual(['school']);
  });
});

describe('useStoredFields', () => {
  it('counts the fields changed from their defaults, and resets them all in one write', () => {
    const store = memoryStore();
    const definitions = [LEVEL, ROUNDS, QUERY];
    const { result } = renderHook(() => ({
      level: useStoredField(LEVEL),
      rounds: useStoredField(ROUNDS),
      all: useStoredFields(definitions),
    }), { wrapper: providing(store) });
    expect(result.current.all.changedCount).toBe(0);
    expect(result.current.all.isDefault('rounds')).toBe(true);

    act(() => result.current.level.options.onChange('hard'));
    act(() => result.current.rounds.options.onChange(['school']));
    expect(result.current.all.changedCount).toBe(2);
    expect(result.current.all.isDefault('rounds')).toBe(false);
    expect(result.current.all.isDefault('q')).toBe(true);

    const write = vi.spyOn(store, 'write');
    act(() => result.current.all.resetAll());
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      [{ key: 'level', raw: undefined }, { key: 'rounds', raw: undefined }, { key: 'q', raw: undefined }],
      'replace',
    );
    expect(store.snapshot()).toEqual({});
    expect(result.current.all.changedCount).toBe(0);
  });

  it('resetAll passes the method on', () => {
    const store = memoryStore({ level: 'hard' });
    const write = vi.spyOn(store, 'write');
    const { result } = renderHook(() => useStoredFields([LEVEL]), { wrapper: providing(store) });
    act(() => result.current.resetAll('push'));
    expect(write).toHaveBeenCalledWith([{ key: 'level', raw: undefined }], 'push');
  });

  it('a stored list equal to the default as a set is the default', () => {
    const store = memoryStore({ rounds: 'final,regional' });
    const { result } = renderHook(() => useStoredFields([ROUNDS]), { wrapper: providing(store) });
    expect(result.current.isDefault('rounds')).toBe(true);
    expect(result.current.changedCount).toBe(0);
  });

  it('a stored value that fits only as the default counts as the default, as useStoredField says, without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ level: 'insane', years: '2000..2030', rounds: 'final,gone' });
    const { result } = renderHook(() => useStoredFields([LEVEL, YEARS, ROUNDS]), { wrapper: providing(store) });
    expect(result.current.changedCount).toBe(1);
    expect(result.current.isDefault('rounds')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a stored value that does not parse counts as the default', () => {
    const store = memoryStore({ years: 'soon' });
    const { result } = renderHook(() => useStoredFields([YEARS]), { wrapper: providing(store) });
    expect(result.current.isDefault('years')).toBe(true);
  });

  it('subscribes to the store once for all its fields', () => {
    const store = memoryStore();
    const subscribe = vi.spyOn(store, 'subscribe');
    const { rerender } = renderHook(() => useStoredFields([LEVEL, ROUNDS, QUERY]), { wrapper: providing(store) });
    rerender();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('re-reads only the fields whose raw value changed, also with a fresh array of the same definitions', () => {
    const choices = vi.fn(() => [{ value: 'easy' }, { value: 'hard' }]);
    const level: DefinitionOf<'oneOf'> = { kind: 'oneOf', id: 'level', choices };
    const store = memoryStore({ level: 'hard' });
    const { result, rerender } = renderHook(() => useStoredFields([level, QUERY]), { wrapper: providing(store) });
    const reads = choices.mock.calls.length;
    rerender();
    act(() => store.write([{ key: 'q', raw: 'x' }], 'replace'));
    act(() => store.write([{ key: 'q', raw: 'xy' }], 'replace'));
    expect(choices).toHaveBeenCalledTimes(reads);
    expect(result.current.changedCount).toBe(2);

    act(() => store.write([{ key: 'level', raw: 'easy' }], 'replace'));
    expect(choices.mock.calls.length).toBeGreaterThan(reads);
    expect(result.current.changedCount).toBe(1);
  });

  it('an id that is not among its fields throws, naming it', () => {
    const store = memoryStore();
    const { result } = renderHook(() => useStoredFields([LEVEL]), { wrapper: providing(store) });
    expect(() => result.current.isDefault('rounds')).toThrow(`Field 'rounds': not among the fields given to useStoredFields`);
  });

  it('a mixed-boolean definition throws, naming the field', () => {
    const store = memoryStore();
    expect(quietly(() => renderHook(() => useStoredFields([LEVEL, ALL_DONE]), { wrapper: providing(store) }))).toThrow(
      `Field 'allDone': a mixed-boolean field is an aggregate of other data and cannot be stored`,
    );
  });
});
