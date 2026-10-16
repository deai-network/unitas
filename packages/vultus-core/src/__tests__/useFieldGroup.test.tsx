import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { memoryStore, type ArgStore } from '../argStore.js';
import { ArgStoreProvider } from '../ArgStoreContext.js';
import { FieldContextProvider } from '../FieldContext.js';
import type { FieldDefinition } from '../kinds.js';
import type { NumericFieldControls } from '../useNumericField.js';
import type { OneOfFieldControls } from '../useOneOfField.js';
import { useFieldGroup, type FieldGroup } from '../useFieldGroup.js';

const A_SIZES = [{ value: 'a4' }, { value: 'a5' }];
const ALL_SIZES = [...A_SIZES, { value: 'letter' }];

// The spec's print dialog: paper's choices depend on layout, copies shows for one layout only.
const layout: FieldDefinition = { kind: 'oneOf', id: 'layout', choices: [{ value: 'rendered' }, { value: 'original' }] };
const paper: FieldDefinition = {
  kind: 'oneOf', id: 'paper', choices: (ctx) => (ctx.values.layout === 'rendered' ? A_SIZES : ALL_SIZES),
};
const copies: FieldDefinition = {
  kind: 'numeric', id: 'copies', min: 1, integer: true, visible: (ctx) => ctx.values.layout === 'original',
};
const PRINT = [layout, paper, copies];

/** A paper whose default moves with layout: `a4` under rendered, `letter` under original. */
const movingPaper: FieldDefinition = {
  kind: 'oneOf', id: 'paper',
  choices: (ctx) => (ctx.values.layout === 'rendered' ? A_SIZES : [{ value: 'letter' }, ...A_SIZES]),
};

function oneOf(group: FieldGroup, id: string): OneOfFieldControls {
  return group.byId[id] as OneOfFieldControls;
}

function numeric(group: FieldGroup, id: string): NumericFieldControls {
  return group.byId[id] as NumericFieldControls;
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

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

describe('useFieldGroup: the fields', () => {
  it('gives each field\'s controls in definition order, and the same controls by id', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect(result.current.fields.map((f) => f.id)).toEqual(['layout', 'paper', 'copies']);
    expect(result.current.fields.map((f) => f.type)).toEqual(['oneOf', 'oneOf', 'numeric']);
    expect(result.current.byId.paper).toBe(result.current.fields[1]);
  });

  it('with nothing set, every field shows its default', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect(result.current.values).toEqual({ layout: 'rendered', paper: 'a4', copies: 1 });
    expect(result.current.byId.layout.value).toBe('rendered');
  });

  it('values is a plain snapshot: an id not in the group reads as undefined', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect((result.current.values as Record<string, unknown>).nope).toBeUndefined();
  });

  it('values keeps its identity until a shown value changes, a re-render with a new app context included', () => {
    const tags: FieldDefinition = { kind: 'manyOf', id: 'tags', choices: [{ value: 'a' }, { value: 'b' }] };
    const { result, rerender } = renderHook(() => useFieldGroup([...PRINT, tags]), {
      wrapper: ({ children }: { children?: ReactNode }) => <FieldContextProvider value={{ fresh: true }}>{children}</FieldContextProvider>,
    });
    const first = result.current.values;
    rerender();
    expect(result.current.values).toBe(first);
    act(() => result.current.byId.layout.setValue('original'));
    expect(result.current.values).not.toBe(first);
    expect(result.current.values).toEqual({ layout: 'original', paper: 'a4', copies: 1, tags: [] });
    act(() => result.current.byId.tags.setValue(['a']));
    const withTags = result.current.values;
    rerender();
    expect(result.current.values).toBe(withTags);
  });

  it('an effect keyed on values that feeds the app\'s field context runs once, not in a loop', () => {
    let setCounts: (counts: Record<string, number>) => void = () => {};
    function Counts({ children }: { children?: ReactNode }) {
      const [counts, set] = useState<Record<string, number>>({});
      setCounts = set;
      return <FieldContextProvider value={{ counts }}>{children}</FieldContextProvider>;
    }
    const counted: FieldDefinition = { ...paper, label: (ctx) => `Paper (${ctx.counts.a4 ?? 0})` };
    let effects = 0;
    const { result } = renderHook(() => {
      const group = useFieldGroup([layout, counted]);
      useEffect(() => {
        effects += 1;
        // Bounded, so that a loop fails the test instead of hanging it.
        if (effects < 10) setCounts({ [String(group.values.paper)]: effects });
      }, [group.values]);
      return group;
    }, { wrapper: Counts });
    expect(effects).toBe(1);
    expect(result.current.byId.paper.label).toBe('Paper (1)');
  });
});

describe('useFieldGroup: references', () => {
  it('a field\'s choices follow the field they read', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect(oneOf(result.current, 'paper').choices.map((c) => c.value)).toEqual(['a4', 'a5']);
    act(() => result.current.byId.layout.setValue('original'));
    expect(oneOf(result.current, 'paper').choices.map((c) => c.value)).toEqual(['a4', 'a5', 'letter']);
  });

  it('a kept value another field made invalid shows the fallback silently, and shows again once valid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useFieldGroup(PRINT));
      act(() => result.current.byId.layout.setValue('original'));
      act(() => result.current.byId.paper.setValue('letter'));
      expect(result.current.values.paper).toBe('letter');
      act(() => result.current.byId.layout.setValue('rendered'));
      expect(result.current.byId.paper.value).toBe('a4');
      expect(result.current.values.paper).toBe('a4');
      act(() => result.current.byId.layout.setValue('original'));
      expect(result.current.byId.paper.value).toBe('letter');
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('a hidden field keeps its value', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect(result.current.byId.copies.visible).toBe(false);
    act(() => result.current.byId.layout.setValue('original'));
    act(() => result.current.byId.copies.setValue(3));
    expect(result.current.byId.copies.visible).toBe(true);
    act(() => result.current.byId.layout.setValue('rendered'));
    expect(result.current.byId.copies.visible).toBe(false);
    expect(result.current.byId.copies.value).toBe(3);
    expect(result.current.values.copies).toBe(3);
  });

  it('a request keeps its kind\'s checks: a paper that is not a choice now is refused, and nothing is kept', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => useFieldGroup(PRINT));
      act(() => result.current.byId.paper.setValue('letter'));
      expect(warn).toHaveBeenCalledWith("Field 'paper': 'letter' is not one of its choices");
      act(() => result.current.byId.layout.setValue('original'));
      expect(result.current.values.paper).toBe('a4');
    } finally {
      warn.mockRestore();
    }
  });

  it('the app\'s context keys stay readable beside values', () => {
    const note: FieldDefinition = { kind: 'text', id: 'note', placeholder: (ctx) => `${ctx.verb} on ${ctx.values.paper}` };
    const { result } = renderHook(() => useFieldGroup([...PRINT, note]), { wrapper: providing({ verb: 'Print' }) });
    expect(result.current.byId.note.placeholder).toBe('Print on a4');
  });

  it('an option reading an id not in the group throws, naming the field and the option', () => {
    const typo: FieldDefinition = { kind: 'oneOf', id: 'paper', choices: (ctx) => (ctx.values.layot ? A_SIZES : ALL_SIZES) };
    expect(quietly(() => renderHook(() => useFieldGroup([layout, typo])))).toThrow(
      "Field 'paper': option 'choices': no field 'layot' in the group (fields: layout, paper)",
    );
  });

  it('a numeric format of the context, kept by the controls and called after render, sees the group\'s values', () => {
    const formatted: FieldDefinition = { ...copies, format: (n, ctx) => `${n} ${ctx.noun} on ${ctx.values.paper}` };
    const { result } = renderHook(() => useFieldGroup([layout, paper, formatted]), { wrapper: providing({ noun: 'copies' }) });
    expect(numeric(result.current, 'copies').valueText).toBe('1 copies on a4');
    expect(numeric(result.current, 'copies').format(2)).toBe('2 copies on a4');
    act(() => result.current.byId.paper.setValue('a5'));
    expect(numeric(result.current, 'copies').format(3)).toBe('3 copies on a5');
  });
});

describe('useFieldGroup: defaults', () => {
  it('a field\'s default follows the options it is computed from', () => {
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper]));
    expect(result.current.values.paper).toBe('a4');
    act(() => result.current.byId.layout.setValue('original'));
    expect(result.current.values.paper).toBe('letter');
    expect(result.current.isDefault('paper')).toBe(true);
  });

  it('a value set equal to the current default is not kept: the field then follows its default', () => {
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper]));
    act(() => result.current.byId.paper.setValue('a5'));
    act(() => result.current.byId.paper.setValue('a4'));
    expect(result.current.isDefault('paper')).toBe(true);
    act(() => result.current.byId.layout.setValue('original'));
    expect(result.current.values.paper).toBe('letter');
  });

  it('a write compares with the default under the writes before it in the same batch', () => {
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper]));
    act(() => {
      result.current.byId.layout.setValue('original');
      result.current.byId.paper.setValue('a4');
    });
    expect(result.current.values).toEqual({ layout: 'original', paper: 'a4' });
    expect(result.current.isDefault('paper')).toBe(false);
  });
});

describe('useFieldGroup: isDefault, changedCount, resetAll', () => {
  it('counts the fields that do not show their defaults, and resetAll clears them all', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect(result.current.changedCount).toBe(0);
    act(() => result.current.byId.layout.setValue('original'));
    act(() => result.current.byId.paper.setValue('letter'));
    act(() => result.current.byId.copies.setValue(4));
    expect(result.current.changedCount).toBe(3);
    expect(result.current.isDefault('paper')).toBe(false);
    act(() => result.current.resetAll());
    expect(result.current.changedCount).toBe(0);
    expect(result.current.values).toEqual({ layout: 'rendered', paper: 'a4', copies: 1 });
  });

  it('a kept value that falls back to the default reads as default', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    act(() => result.current.byId.layout.setValue('original'));
    act(() => result.current.byId.paper.setValue('letter'));
    act(() => result.current.byId.layout.setValue('rendered'));
    expect(result.current.isDefault('paper')).toBe(true);
    expect(result.current.changedCount).toBe(0);
  });

  it('a field with nothing kept is default even when its default is made fit (initialValue 0, min 1)', () => {
    const below: FieldDefinition = { kind: 'numeric', id: 'copies', min: 1, initialValue: 0 };
    const { result } = renderHook(() => useFieldGroup([below]));
    expect(result.current.values.copies).toBe(1);
    expect(result.current.isDefault('copies')).toBe(true);
    expect(result.current.changedCount).toBe(0);
  });

  it('isDefault throws for an id not in the group', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT));
    expect(() => result.current.isDefault('layot')).toThrow("Field group: no field 'layot' in the group (fields: layout, paper, copies)");
  });
});

describe('useFieldGroup: shape', () => {
  it('a different list of ids throws, telling the app to remount with a key', () => {
    const { rerender } = renderHook(({ definitions }) => useFieldGroup(definitions), { initialProps: { definitions: PRINT } });
    expect(quietly(() => rerender({ definitions: [layout, copies] }))).toThrow(/remount .*React `key`/);
  });

  it('a field of another kind under the same id throws too', () => {
    const { rerender } = renderHook(({ definitions }) => useFieldGroup(definitions), { initialProps: { definitions: PRINT } });
    const textPaper: FieldDefinition = { kind: 'text', id: 'paper' };
    expect(quietly(() => rerender({ definitions: [layout, textPaper, copies] }))).toThrow(
      "Field group: the fields changed from layout (oneOf), paper (oneOf), copies (numeric) to layout (oneOf), paper (text), copies (numeric)",
    );
  });

  it('new definition objects of the same shape on every render are fine, and do not loop', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useFieldGroup([
        { kind: 'oneOf', id: 'layout', choices: [{ value: 'rendered' }, { value: 'original' }] },
        { kind: 'oneOf', id: 'paper', choices: (ctx) => (ctx.values.layout === 'rendered' ? A_SIZES : ALL_SIZES) },
      ]);
    });
    expect(renders).toBe(1);
    act(() => result.current.byId.layout.setValue('original'));
    act(() => result.current.byId.paper.setValue('letter'));
    expect(renders).toBe(3);
    expect(result.current.values).toEqual({ layout: 'original', paper: 'letter' });
  });

  it('a list value keeps its identity across renders while it stays the same', () => {
    const tags: FieldDefinition = { kind: 'manyOf', id: 'tags', choices: [{ value: 'a' }, { value: 'b' }] };
    const { result, rerender } = renderHook(() => useFieldGroup([layout, tags]));
    act(() => result.current.byId.tags.setValue(['a']));
    const before = result.current.byId.tags.value;
    rerender();
    expect(result.current.byId.tags.value).toBe(before);
    expect(result.current.values.tags).toBe(before);
  });
});

function storing(store: ArgStore, fieldContext?: () => object) {
  return ({ children }: { children?: ReactNode }) => {
    const withStore = <ArgStoreProvider store={store}>{children}</ArgStoreProvider>;
    return fieldContext === undefined ? withStore : <FieldContextProvider value={fieldContext()}>{withStore}</FieldContextProvider>;
  };
}

/** An ArgStore whose hrefFor writes each change as `key=raw`, a removed key as `-key`. */
function storeWithHrefFor(initial: Record<string, string> = {}): ArgStore & { snapshot(): Record<string, string> } {
  return {
    ...memoryStore(initial),
    hrefFor: (changes) => `#?${changes.map((c) => (c.raw === undefined ? `-${c.key}` : `${c.key}=${c.raw}`)).join('&')}`,
  };
}

/** Runs `check` with console.warn spied on (and silenced). */
function warnings(check: (warn: MockInstance<typeof console.warn>) => void): void {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    check(warn);
  } finally {
    warn.mockRestore();
  }
}

describe('useFieldGroup: stored', () => {
  it('reads each field from the store under its id; an absent key reads as the current default', () => {
    const store = memoryStore({ layout: 'original' });
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper], { stored: true }), { wrapper: storing(store) });
    expect(result.current.values).toEqual({ layout: 'original', paper: 'letter' });
    expect(result.current.isDefault('paper')).toBe(true);
    act(() => store.write([{ key: 'layout', raw: undefined }], 'replace'));
    expect(result.current.values).toEqual({ layout: 'rendered', paper: 'a4' });
    expect(result.current.byId.paper.value).toBe('a4');
  });

  it('a change writes the store with replace, the key absent when the value equals the current default', () => {
    const store = memoryStore();
    const write = vi.spyOn(store, 'write');
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper], { stored: true }), { wrapper: storing(store) });
    act(() => result.current.byId.layout.setValue('original'));
    expect(write).toHaveBeenLastCalledWith([{ key: 'layout', raw: 'original' }], 'replace');
    act(() => result.current.byId.paper.setValue('letter'));
    expect(write).toHaveBeenLastCalledWith([{ key: 'paper', raw: undefined }], 'replace');
    expect(store.snapshot()).toEqual({ layout: 'original' });
    act(() => result.current.byId.paper.setValue('a4'));
    expect(store.snapshot()).toEqual({ layout: 'original', paper: 'a4' });
    expect(result.current.isDefault('paper')).toBe(false);
    act(() => result.current.byId.layout.setValue('rendered'));
    expect(store.snapshot()).toEqual({ paper: 'a4' });
    expect(result.current.isDefault('paper')).toBe(true);
  });

  it('a write compares with the default under the writes before it in the same batch, as in the group\'s own state', () => {
    const store = memoryStore();
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper], { stored: true }), { wrapper: storing(store) });
    act(() => {
      result.current.byId.layout.setValue('original');
      result.current.byId.paper.setValue('a4');
    });
    expect(result.current.values).toEqual({ layout: 'original', paper: 'a4' });
    expect(result.current.isDefault('paper')).toBe(false);
    expect(store.snapshot()).toEqual({ layout: 'original', paper: 'a4' });
  });

  it('a stored value another field made invalid falls back, warning once, and shows again once valid; the store is untouched', () => {
    warnings((warn) => {
      const store = memoryStore({ paper: 'letter' });
      const { result } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(store) });
      expect(result.current.values.paper).toBe('a4');
      expect(result.current.isDefault('paper')).toBe(true);
      act(() => result.current.byId.layout.setValue('original'));
      expect(result.current.byId.paper.value).toBe('letter');
      expect(result.current.values.paper).toBe('letter');
      expect(result.current.isDefault('paper')).toBe(false);
      act(() => result.current.byId.layout.setValue('rendered'));
      expect(result.current.byId.paper.value).toBe('a4');
      expect(store.snapshot()).toEqual({ paper: 'letter' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'paper': stored value 'letter' is not one of its choices, using 'a4'");
    });
  });

  it('warns once per raw value: not again on a re-render with a new app context, again for another raw value', () => {
    warnings((warn) => {
      const store = memoryStore({ paper: 'letter' });
      const { result, rerender } = renderHook(() => useFieldGroup(PRINT, { stored: true }), {
        wrapper: storing(store, () => ({ fresh: true })),
      });
      rerender();
      rerender();
      expect(result.current.values.paper).toBe('a4');
      expect(warn).toHaveBeenCalledTimes(1);
      act(() => store.write([{ key: 'paper', raw: 'legal' }], 'replace'));
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenLastCalledWith("Field 'paper': stored value 'legal' is not one of its choices, using 'a4'");
    });
  });

  it('a raw value the group itself wrote does not warn when it falls back; one from elsewhere still warns once', () => {
    warnings((warn) => {
      const store = memoryStore({ layout: 'original' });
      const { result, rerender } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(store) });
      // Under the original layout Letter is a choice, so the request passes; the layout write before it makes it fall back.
      act(() => {
        result.current.byId.layout.setValue('rendered');
        result.current.byId.paper.setValue('letter');
      });
      expect(store.snapshot()).toEqual({ paper: 'letter' });
      expect(result.current.values).toEqual({ layout: 'rendered', paper: 'a4', copies: 1 });
      rerender();
      expect(warn).not.toHaveBeenCalled();
      // The URL moves on, then arrives with paper=letter under the rendered layout: not the group's write, so it warns, once.
      act(() => store.write([{ key: 'paper', raw: 'a5' }], 'replace'));
      act(() => store.write([{ key: 'paper', raw: 'letter' }], 'replace'));
      rerender();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'paper': stored value 'letter' is not one of its choices, using 'a4'");
    });
  });

  it('a write the group undoes before any render is not remembered: the same value arriving later warns', () => {
    warnings((warn) => {
      const store = memoryStore({ layout: 'original' });
      const { result, rerender } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(store) });
      act(() => {
        result.current.byId.paper.setValue('letter');
        result.current.resetAll();
      });
      act(() => store.write([{ key: 'paper', raw: 'letter' }], 'replace'));
      rerender();
      expect(result.current.values.paper).toBe('a4');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'paper': stored value 'letter' is not one of its choices, using 'a4'");
    });
  });

  it('values keeps its identity when a store change leaves every shown value the same', () => {
    warnings(() => {
      const store = memoryStore();
      const { result } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(store) });
      const first = result.current.values;
      act(() => store.write([{ key: 'paper', raw: 'letter' }], 'replace'));
      expect(result.current.values).toBe(first);
      act(() => store.write([{ key: 'layout', raw: 'original' }], 'replace'));
      expect(result.current.values).not.toBe(first);
      expect(result.current.values).toEqual({ layout: 'original', paper: 'letter', copies: 1 });
    });
  });

  it('a raw value that does not parse warns once, as useArg does, and reads as the current default', () => {
    warnings((warn) => {
      const store = memoryStore({ layout: 'original', copies: 'many' });
      const { result, rerender } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(store) });
      rerender();
      expect(result.current.values.copies).toBe(1);
      expect(result.current.isDefault('copies')).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Argument 'copies': cannot read 'many', using the default");
    });
  });

  it('resetAll removes every field\'s key in one write, with replace unless told otherwise', () => {
    const store = memoryStore({ layout: 'original', paper: 'letter', copies: '3', other: 'x' });
    const write = vi.spyOn(store, 'write');
    const { result } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(store) });
    expect(result.current.changedCount).toBe(3);
    act(() => result.current.resetAll());
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      [{ key: 'layout', raw: undefined }, { key: 'paper', raw: undefined }, { key: 'copies', raw: undefined }], 'replace',
    );
    expect(store.snapshot()).toEqual({ other: 'x' });
    expect(result.current.changedCount).toBe(0);
    act(() => result.current.resetAll('push'));
    expect(write).toHaveBeenLastCalledWith(expect.any(Array), 'push');
  });

  it('hrefFor comes from the store\'s hrefFor, the key absent for the current default', () => {
    const store = storeWithHrefFor({ layout: 'original' });
    const { result } = renderHook(() => useFieldGroup([layout, movingPaper], { stored: true }), { wrapper: storing(store) });
    expect(result.current.byId.paper.hrefFor?.('a5')).toBe('#?paper=a5');
    expect(result.current.byId.paper.hrefFor?.('letter')).toBe('#?-paper');
    expect(result.current.byId.layout.hrefFor?.('rendered')).toBe('#?-layout');
  });

  it('a field\'s hrefFor keeps its identity while its default stays the same, and follows a new default', () => {
    const store = storeWithHrefFor();
    const { result, rerender } = renderHook(() => useFieldGroup([layout, movingPaper], { stored: true }), { wrapper: storing(store) });
    const before = result.current.byId.paper.hrefFor;
    rerender();
    expect(result.current.byId.paper.hrefFor).toBe(before);
    act(() => result.current.byId.layout.setValue('original'));
    expect(result.current.byId.paper.hrefFor?.('a4')).toBe('#?paper=a4');
    expect(result.current.byId.paper.hrefFor?.('letter')).toBe('#?-paper');
  });

  it('hrefFor gives undefined when the store has none', () => {
    const { result } = renderHook(() => useFieldGroup(PRINT, { stored: true }), { wrapper: storing(memoryStore()) });
    expect(result.current.byId.paper.hrefFor?.('a5')).toBeUndefined();
  });

  it('new definition objects of the same shape on every render are fine, and do not loop', () => {
    const store = memoryStore();
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useFieldGroup([
        { kind: 'oneOf', id: 'layout', choices: [{ value: 'rendered' }, { value: 'original' }] },
        { kind: 'oneOf', id: 'paper', choices: (ctx) => (ctx.values.layout === 'rendered' ? A_SIZES : ALL_SIZES) },
      ], { stored: true });
    }, { wrapper: storing(store) });
    expect(renders).toBe(1);
    act(() => result.current.byId.layout.setValue('original'));
    act(() => result.current.byId.paper.setValue('letter'));
    expect(renders).toBe(3);
    expect(store.snapshot()).toEqual({ layout: 'original', paper: 'letter' });
  });

  it('a list value keeps its identity across renders while it stays the same', () => {
    const tags: FieldDefinition = { kind: 'manyOf', id: 'tags', choices: [{ value: 'a' }, { value: 'b' }] };
    const store = memoryStore({ tags: 'a' });
    const { result, rerender } = renderHook(() => useFieldGroup([layout, tags], { stored: true }), { wrapper: storing(store) });
    const before = result.current.byId.tags.value;
    expect(before).toEqual(['a']);
    rerender();
    act(() => result.current.byId.layout.setValue('original'));
    expect(result.current.byId.tags.value).toBe(before);
    expect(result.current.values.tags).toBe(before);
  });

  it('a stored value of a field of an unknown kind throws, naming the field', () => {
    const when = { kind: 'date', id: 'when' } as unknown as FieldDefinition;
    expect(quietly(() => renderHook(() => useFieldGroup([when], { stored: true }), { wrapper: storing(memoryStore({ when: 'x' })) })))
      .toThrow("Field 'when': unknown field kind 'date'");
  });

  it('switching between the group\'s own state and the store throws, telling the app to remount with a key', () => {
    const { rerender } = renderHook(({ stored }) => useFieldGroup(PRINT, { stored }), {
      initialProps: { stored: false }, wrapper: storing(memoryStore()),
    });
    expect(quietly(() => rerender({ stored: true }))).toThrow(
      /^Field group: the storage changed from the group's own state to the nearest ArgStore \(\{ stored: true \}\);.*remount .*React `key`/,
    );
  });

  it('switching from the store to the group\'s own state throws too', () => {
    const { rerender } = renderHook(({ stored }) => useFieldGroup(PRINT, { stored }), {
      initialProps: { stored: true }, wrapper: storing(memoryStore()),
    });
    expect(quietly(() => rerender({ stored: false }))).toThrow(
      /^Field group: the storage changed from the nearest ArgStore \(\{ stored: true \}\) to the group's own state;.*remount .*React `key`/,
    );
  });
});
