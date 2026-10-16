import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
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

describe('useFieldGroup: stored', () => {
  it('stored is not there yet', () => {
    expect(quietly(() => renderHook(() => useFieldGroup(PRINT, { stored: true })))).toThrow('not yet');
  });
});
