import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { initialValueOf, sanitizeStored, valueTypeOf, type FieldDefinition } from '../kinds.js';
import { booleanType, numberType, rangeType, stringSetType, stringType } from '../valueTypes.js';
import { FieldContextProvider, NO_FIELD_CONTEXT, useFieldContext } from '../FieldContext.js';
import { useBoolField } from '../useBoolField.js';
import { useMixedBoolField } from '../useMixedBoolField.js';
import { useOneOfField } from '../useOneOfField.js';
import { useManyOfField } from '../useManyOfField.js';
import { useNumericField } from '../useNumericField.js';
import { useRangeField } from '../useRangeField.js';
import { useTreeField } from '../useTreeField.js';
import { useTextField } from '../useTextField.js';
import type { TreeNode } from '../tree.js';
import type { FieldKind } from '../field.js';

function providing(value: object) {
  return ({ children }: { children?: ReactNode }) => <FieldContextProvider value={value}>{children}</FieldContextProvider>;
}

const NODES: TreeNode[] = [
  { value: 'A', children: [{ value: 'A1' }, { value: 'A2' }] },
  { value: 'B' },
];

/** Definitions as a definer writes them: plain data, in their inside form. */
const DEFINITIONS: FieldDefinition[] = [
  { kind: 'boolean', id: 'done', label: 'Done', initialValue: true },
  { kind: 'mixed-boolean', id: 'all', initialValue: 'mixed' },
  { kind: 'oneOf', id: 'mode', choices: [{ value: 'a', disabled: true }, { value: 'b' }], widget: 'segmented' },
  { kind: 'manyOf', id: 'rounds', choices: [{ value: 'regional' }, { value: 'final' }], initialValue: ['final'] },
  { kind: 'numeric', id: 'count', min: 1, max: 9, unit: ' pcs' },
  { kind: 'range', id: 'years', min: 2000, max: 2030, initialValue: [2010, 2020] },
  { kind: 'tree', id: 'topics', nodes: NODES, selection: 'leaves', initialValue: ['A1'] },
  { kind: 'text', id: 'q', control: 'textarea', placeholder: 'Search' },
];

/** Runs a definition through its kind's hook: a type-level check that each definition is its hook's options. */
function useDefinition(definition: FieldDefinition) {
  switch (definition.kind) {
    case 'boolean': return useBoolField(definition);
    case 'mixed-boolean': return useMixedBoolField(definition);
    case 'oneOf': return useOneOfField(definition);
    case 'manyOf': return useManyOfField(definition);
    case 'numeric': return useNumericField(definition);
    case 'range': return useRangeField(definition);
    case 'tree': return useTreeField(definition);
    case 'text': return useTextField(definition);
  }
}

describe('FieldDefinition', () => {
  it('a one-of definition, narrowed by kind, is useOneOfField\'s options', () => {
    const definition = DEFINITIONS[2];
    if (definition.kind !== 'oneOf') throw new Error('expected a one-of definition');
    const { result } = renderHook(() => useOneOfField(definition));
    expect(result.current.type).toBe('oneOf');
    expect(result.current.value).toBe('b');
    expect(result.current.widget).toBe('segmented');
  });

  it('every kind\'s definition runs in its hook, which starts at initialValueOf', () => {
    for (const definition of DEFINITIONS) {
      const { result } = renderHook(() => useDefinition(definition));
      expect(result.current.type).toBe(definition.kind);
      expect(result.current.value).toEqual(initialValueOf(definition, NO_FIELD_CONTEXT));
    }
  });

  it('every kind\'s hook resolves a context-function initialValue once, when it mounts, not on every render', () => {
    const values: Record<FieldKind, unknown> = {
      boolean: true, 'mixed-boolean': 'mixed', oneOf: 'b', manyOf: ['final'], numeric: 3, range: [2010, 2020], tree: ['A1'], text: 'abc',
    };
    for (const definition of DEFINITIONS) {
      const initialValue = vi.fn((ctx: { lang: string }) => (ctx.lang === 'hu' ? values[definition.kind] : undefined));
      const lazy = { ...definition, initialValue } as FieldDefinition;
      const { result, rerender } = renderHook(() => useDefinition(lazy), { wrapper: providing({ lang: 'hu' }) });
      rerender();
      rerender();
      expect(result.current.value, definition.kind).toEqual(values[definition.kind]);
      expect(initialValue, definition.kind).toHaveBeenCalledTimes(1);
    }
  });

  it('takes no value, onChange or commit: a definition is in its inside form', () => {
    const definitions: FieldDefinition[] = [
      // @ts-expect-error `value` belongs to whoever runs the field, not to its definition
      { kind: 'text', id: 'q', value: 'x' },
    ];
    expect(definitions).toHaveLength(1);
  });
});

describe('initialValueOf', () => {
  it('boolean: initialValue, else false', () => {
    expect(initialValueOf({ kind: 'boolean', id: 'done' }, NO_FIELD_CONTEXT)).toBe(false);
    expect(initialValueOf({ kind: 'boolean', id: 'done', initialValue: true }, NO_FIELD_CONTEXT)).toBe(true);
  });

  it('mixed-boolean: initialValue, else false', () => {
    expect(initialValueOf({ kind: 'mixed-boolean', id: 'all' }, NO_FIELD_CONTEXT)).toBe(false);
    expect(initialValueOf({ kind: 'mixed-boolean', id: 'all', initialValue: 'mixed' }, NO_FIELD_CONTEXT)).toBe('mixed');
  });

  it('oneOf: initialValue, else the first enabled choice', () => {
    const choices = [{ value: 'a', disabled: true }, { value: 'b' }, { value: 'c' }];
    expect(initialValueOf({ kind: 'oneOf', id: 'mode', choices }, NO_FIELD_CONTEXT)).toBe('b');
    expect(initialValueOf({ kind: 'oneOf', id: 'mode', choices, initialValue: 'c' }, NO_FIELD_CONTEXT)).toBe('c');
    expect(initialValueOf({ kind: 'oneOf', id: 'mode', choices: [] }, NO_FIELD_CONTEXT)).toBe(undefined);
  });

  it('manyOf: initialValue, else the empty list', () => {
    const choices = [{ value: 'a' }, { value: 'b' }];
    expect(initialValueOf({ kind: 'manyOf', id: 'tags', choices }, NO_FIELD_CONTEXT)).toEqual([]);
    expect(initialValueOf({ kind: 'manyOf', id: 'tags', choices, initialValue: ['b'] }, NO_FIELD_CONTEXT)).toEqual(['b']);
  });

  it('numeric: initialValue, else min (or 0) clamped into the bounds', () => {
    expect(initialValueOf({ kind: 'numeric', id: 'n' }, NO_FIELD_CONTEXT)).toBe(0);
    expect(initialValueOf({ kind: 'numeric', id: 'n', min: 5, max: 10 }, NO_FIELD_CONTEXT)).toBe(5);
    expect(initialValueOf({ kind: 'numeric', id: 'n', max: -5 }, NO_FIELD_CONTEXT)).toBe(-5);
    expect(initialValueOf({ kind: 'numeric', id: 'n', min: 5, max: 10, initialValue: 7 }, NO_FIELD_CONTEXT)).toBe(7);
  });

  it('range: initialValue, else [min, max]', () => {
    expect(initialValueOf({ kind: 'range', id: 'years', min: 2000, max: 2030 }, NO_FIELD_CONTEXT)).toEqual([2000, 2030]);
    expect(initialValueOf({ kind: 'range', id: 'years', min: 2000, max: 2030, initialValue: [2010, 2020] }, NO_FIELD_CONTEXT))
      .toEqual([2010, 2020]);
  });

  it('numeric and range: a format that takes the context is not resolved, so no provider is needed', () => {
    const format = (n: number, ctx: { lang: string }) => `${ctx.lang}${n}`;
    expect(initialValueOf({ kind: 'range', id: 'years', min: 2000, max: 2030, format }, NO_FIELD_CONTEXT)).toEqual([2000, 2030]);
    expect(initialValueOf({ kind: 'numeric', id: 'n', min: 5, format }, NO_FIELD_CONTEXT)).toBe(5);
  });

  it('tree: initialValue, else the empty list', () => {
    expect(initialValueOf({ kind: 'tree', id: 'topics', nodes: NODES }, NO_FIELD_CONTEXT)).toEqual([]);
    expect(initialValueOf({ kind: 'tree', id: 'topics', nodes: NODES, initialValue: ['A'] }, NO_FIELD_CONTEXT)).toEqual(['A']);
  });

  it('tree: the initial value comes normalized under the selection, as the hook shows it', () => {
    expect(initialValueOf({ kind: 'tree', id: 'topics', nodes: NODES, initialValue: ['A1', 'A2'] }, NO_FIELD_CONTEXT)).toEqual(['A']);
    expect(initialValueOf({ kind: 'tree', id: 'topics', nodes: NODES, selection: 'leaves', initialValue: ['A'] }, NO_FIELD_CONTEXT))
      .toEqual(['A1', 'A2']);
  });

  it('text: initialValue, else the empty string', () => {
    expect(initialValueOf({ kind: 'text', id: 'q' }, NO_FIELD_CONTEXT)).toBe('');
    expect(initialValueOf({ kind: 'text', id: 'q', initialValue: 'abc' }, NO_FIELD_CONTEXT)).toBe('abc');
  });

  it('resolves an initialValue context function with the context under a provider', () => {
    const definition: FieldDefinition = {
      kind: 'manyOf', id: 'rounds',
      choices: [{ value: 'regional' }, { value: 'final' }],
      initialValue: (ctx: { rounds: string[] }) => ctx.rounds,
    };
    const { result } = renderHook(() => initialValueOf(definition, useFieldContext()), {
      wrapper: providing({ rounds: ['regional', 'final'] }),
    });
    expect(result.current).toEqual(['regional', 'final']);
  });

  it('resolves one-of choices given as a context function', () => {
    const definition: FieldDefinition = {
      kind: 'oneOf', id: 'mode',
      choices: (ctx: { allowA: boolean }) => [{ value: 'a', enabled: ctx.allowA }, { value: 'b' }],
    };
    const { result } = renderHook(() => initialValueOf(definition, useFieldContext()), {
      wrapper: providing({ allowA: false }),
    });
    expect(result.current).toBe('b');
  });

  it('a context function with no provider throws, naming the field and the option', () => {
    expect(() => initialValueOf({ kind: 'text', id: 'q', initialValue: (ctx: { q: string }) => ctx.q }, NO_FIELD_CONTEXT))
      .toThrow(/Field 'q': option 'initialValue' is a function of the field context, but no FieldContextProvider is above it/);
  });
});

describe('valueTypeOf', () => {
  it('gives each storable kind its value type', () => {
    expect(valueTypeOf('boolean')).toBe(booleanType);
    expect(valueTypeOf('oneOf')).toBe(stringType);
    expect(valueTypeOf('text')).toBe(stringType);
    expect(valueTypeOf('manyOf')).toBe(stringSetType);
    expect(valueTypeOf('tree')).toBe(stringSetType);
    expect(valueTypeOf('numeric')).toBe(numberType);
    expect(valueTypeOf('range')).toBe(rangeType);
  });

  it('throws for mixed-boolean, which cannot be stored', () => {
    expect(() => valueTypeOf('mixed-boolean'))
      .toThrow('a mixed-boolean field is an aggregate of other data and cannot be stored');
  });
});

describe('an unknown kind (plain data can carry anything)', () => {
  it('throws, naming the field', () => {
    const definition = { kind: 'date', id: 'when' } as unknown as FieldDefinition;
    expect(() => initialValueOf(definition, NO_FIELD_CONTEXT)).toThrow("Field 'when': unknown kind 'date'");
    expect(() => sanitizeStored(definition, 'x', NO_FIELD_CONTEXT)).toThrow("Field 'when': unknown kind 'date'");
    expect(() => valueTypeOf('date' as FieldKind)).toThrow("unknown field kind 'date'");
  });
});

describe('sanitizeStored', () => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('boolean and text: unchanged', () => {
    expect(sanitizeStored({ kind: 'boolean', id: 'done' }, true, NO_FIELD_CONTEXT)).toBe(true);
    expect(sanitizeStored({ kind: 'text', id: 'q' }, 'abc', NO_FIELD_CONTEXT)).toBe('abc');
    expect(warn).not.toHaveBeenCalled();
  });

  it('sends its warnings to a warn function, when given one, instead of console.warn', () => {
    const messages: string[] = [];
    const tags: FieldDefinition = { kind: 'manyOf', id: 'tags', choices: [{ value: 'a' }] };
    expect(sanitizeStored(tags, ['a', 'gone'], NO_FIELD_CONTEXT, (message) => messages.push(message))).toEqual(['a']);
    expect(messages).toEqual(["Field 'tags': dropping stored values that are not among its choices: 'gone'"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('mixed-boolean: throws, as it cannot be stored', () => {
    expect(() => sanitizeStored({ kind: 'mixed-boolean', id: 'all' }, true, NO_FIELD_CONTEXT))
      .toThrow("Field 'all': a mixed-boolean field is an aggregate of other data and cannot be stored");
  });

  describe('oneOf', () => {
    const choices = [{ value: 'a', disabled: true }, { value: 'b' }, { value: 'c' }];

    it('keeps a value among the choices, a disabled one too', () => {
      expect(sanitizeStored({ kind: 'oneOf', id: 'mode', choices }, 'c', NO_FIELD_CONTEXT)).toBe('c');
      expect(sanitizeStored({ kind: 'oneOf', id: 'mode', choices }, 'a', NO_FIELD_CONTEXT)).toBe('a');
      expect(warn).not.toHaveBeenCalled();
    });

    it('a value not among the choices gives the initial value, with a warning naming the field', () => {
      expect(sanitizeStored({ kind: 'oneOf', id: 'mode', choices }, 'gone', NO_FIELD_CONTEXT)).toBe('b');
      expect(sanitizeStored({ kind: 'oneOf', id: 'mode', choices, initialValue: 'c' }, 'gone', NO_FIELD_CONTEXT)).toBe('c');
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, "Field 'mode': stored value 'gone' is not one of its choices, using 'b'");
      expect(warn).toHaveBeenNthCalledWith(2, "Field 'mode': stored value 'gone' is not one of its choices, using 'c'");
    });

    it('an initial value that is not among the choices is kept without a warning', () => {
      expect(sanitizeStored({ kind: 'oneOf', id: 'mode', choices, initialValue: 'none' }, 'none', NO_FIELD_CONTEXT)).toBe('none');
      expect(warn).not.toHaveBeenCalled();
    });

    it('resolves choices given as a context function', () => {
      const definition: FieldDefinition = { kind: 'oneOf', id: 'mode', choices: (ctx: { values: string[] }) => ctx.values.map((value) => ({ value })) };
      const { result } = renderHook(() => sanitizeStored(definition, 'y', useFieldContext()), { wrapper: providing({ values: ['x', 'y'] }) });
      expect(result.current).toBe('y');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('manyOf', () => {
    const choices = [{ value: 'c' }, { value: 'a' }, { value: 'b', disabled: true }];

    it('returns the values in choice order, silently', () => {
      expect(sanitizeStored({ kind: 'manyOf', id: 'tags', choices }, ['a', 'b', 'c'], NO_FIELD_CONTEXT)).toEqual(['c', 'a', 'b']);
      expect(sanitizeStored({ kind: 'manyOf', id: 'tags', choices }, [], NO_FIELD_CONTEXT)).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('drops values not among the choices, with a warning naming the field and them', () => {
      expect(sanitizeStored({ kind: 'manyOf', id: 'tags', choices }, ['a', 'gone', 'old'], NO_FIELD_CONTEXT)).toEqual(['a']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'tags': dropping stored values that are not among its choices: 'gone', 'old'");
    });
  });

  describe('tree', () => {
    it('normalizes the value under the selection, silently', () => {
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: NODES }, ['A1', 'A2', 'B'], NO_FIELD_CONTEXT)).toEqual(['A', 'B']);
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: NODES, selection: 'leaves' }, ['A'], NO_FIELD_CONTEXT))
        .toEqual(['A1', 'A2']);
      expect(warn).not.toHaveBeenCalled();
    });

    it('follows antd for disabled nodes, as the hook does: a parent stands for its enabled children only', () => {
      const geometria: TreeNode[] = [
        { value: 'geometria', children: [{ value: 'sikgeometria' }, { value: 'tergeometria', disabled: true }] },
      ];
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: geometria }, ['sikgeometria'], NO_FIELD_CONTEXT)).toEqual(['geometria']);
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: geometria, selection: 'all' }, ['geometria'], NO_FIELD_CONTEXT))
        .toEqual(['geometria', 'sikgeometria']);
      expect(initialValueOf({ kind: 'tree', id: 'topics', nodes: geometria, selection: 'all', initialValue: ['geometria'] }, NO_FIELD_CONTEXT))
        .toEqual(['geometria', 'sikgeometria']);
      expect(warn).not.toHaveBeenCalled();
    });

    it('keeps a stored disabled node (its parent does not cover it), in every selection', () => {
      const geometria: TreeNode[] = [
        { value: 'geometria', children: [{ value: 'sikgeometria' }, { value: 'tergeometria', disabled: true }] },
      ];
      const stored = ['geometria', 'tergeometria'];
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: geometria }, stored, NO_FIELD_CONTEXT)).toEqual(['geometria', 'tergeometria']);
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: geometria, selection: 'all' }, stored, NO_FIELD_CONTEXT))
        .toEqual(['geometria', 'sikgeometria', 'tergeometria']);
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: geometria, selection: 'leaves' }, stored, NO_FIELD_CONTEXT))
        .toEqual(['sikgeometria', 'tergeometria']);
      expect(warn).not.toHaveBeenCalled();
    });

    it('drops values not among the nodes, then normalizes, with a warning naming the field and them', () => {
      expect(sanitizeStored({ kind: 'tree', id: 'topics', nodes: NODES }, ['A1', 'A2', 'gone'], NO_FIELD_CONTEXT)).toEqual(['A']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'topics': dropping stored values that are not among its nodes: 'gone'");
    });
  });

  describe('numeric', () => {
    it('keeps a value inside the bounds', () => {
      expect(sanitizeStored({ kind: 'numeric', id: 'count', min: 0, max: 10 }, 5, NO_FIELD_CONTEXT)).toBe(5);
      expect(sanitizeStored({ kind: 'numeric', id: 'count' }, -50, NO_FIELD_CONTEXT)).toBe(-50);
      expect(warn).not.toHaveBeenCalled();
    });

    it('clamps a value outside the bounds, with a warning naming the field', () => {
      expect(sanitizeStored({ kind: 'numeric', id: 'count', min: 0, max: 10 }, 15, NO_FIELD_CONTEXT)).toBe(10);
      expect(sanitizeStored({ kind: 'numeric', id: 'count', min: 0, max: 10 }, -1, NO_FIELD_CONTEXT)).toBe(0);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, "Field 'count': stored value 15 is outside its bounds, using 10");
    });

    it('rounds an integer value inside the bounds, with a warning that it is not a whole number', () => {
      expect(sanitizeStored({ kind: 'numeric', id: 'count', min: 0, max: 10, integer: true }, 2.5, NO_FIELD_CONTEXT)).toBe(3);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'count': stored value 2.5 is not a whole number, using 3");
    });

    it('clamps and rounds an integer value, with one warning for the bounds', () => {
      expect(sanitizeStored({ kind: 'numeric', id: 'count', min: 0, max: 9.5, integer: true }, 15.7, NO_FIELD_CONTEXT)).toBe(9);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'count': stored value 15.7 is outside its bounds, using 9");
    });

    it('rounds an integer value to a whole number inside fractional bounds', () => {
      const definition: FieldDefinition = { kind: 'numeric', id: 'count', min: 0.5, max: 9.5, integer: true };
      expect(sanitizeStored(definition, 9.5, NO_FIELD_CONTEXT)).toBe(9);
      expect(sanitizeStored(definition, 0.5, NO_FIELD_CONTEXT)).toBe(1);
      expect(warn).toHaveBeenNthCalledWith(1, "Field 'count': stored value 9.5 is not a whole number, using 9");
    });

    it('leaves a non-integer value as is, even when fractional', () => {
      expect(sanitizeStored({ kind: 'numeric', id: 'count', min: 0, max: 10 }, 2.5, NO_FIELD_CONTEXT)).toBe(2.5);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('range', () => {
    const years: FieldDefinition = { kind: 'range', id: 'years', min: 2000, max: 2030 };

    it('keeps a range inside the bounds', () => {
      expect(sanitizeStored(years, [2010, 2020], NO_FIELD_CONTEXT)).toEqual([2010, 2020]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('clamps each end into the bounds, with a warning naming the field', () => {
      expect(sanitizeStored(years, [1990, 2040], NO_FIELD_CONTEXT)).toEqual([2000, 2030]);
      expect(sanitizeStored(years, [2035, 2040], NO_FIELD_CONTEXT)).toEqual([2030, 2030]);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, "Field 'years': stored range 1990..2040 is outside its bounds, using 2000..2030");
    });

    it('orders the ends, silently', () => {
      expect(sanitizeStored(years, [2020, 2010], NO_FIELD_CONTEXT)).toEqual([2010, 2020]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('clamps and orders, warning for the clamping', () => {
      expect(sanitizeStored(years, [2040, 1990], NO_FIELD_CONTEXT)).toEqual([2000, 2030]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'years': stored range 2040..1990 is outside its bounds, using 2000..2030");
    });

    it('rounds an integer range inside the bounds, with a warning that its ends are not whole numbers', () => {
      const definition: FieldDefinition = { kind: 'range', id: 'count', min: 0, max: 20, integer: true };
      expect(sanitizeStored(definition, [2.5, 9.6], NO_FIELD_CONTEXT)).toEqual([3, 10]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'count': stored range 2.5..9.6 has ends that are not whole numbers, using 3..10");
    });

    it('clamps and rounds an integer range, with one warning for the bounds', () => {
      const definition: FieldDefinition = { kind: 'range', id: 'count', min: 0, max: 9.5, integer: true };
      expect(sanitizeStored(definition, [15.7, 20], NO_FIELD_CONTEXT)).toEqual([9, 9]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith("Field 'count': stored range 15.7..20 is outside its bounds, using 9..9");
    });

    it('rounds an integer range to whole numbers inside fractional bounds', () => {
      const definition: FieldDefinition = { kind: 'range', id: 'count', min: 0.5, max: 9.5, integer: true };
      expect(sanitizeStored(definition, [0.5, 9.5], NO_FIELD_CONTEXT)).toEqual([1, 9]);
      expect(warn).toHaveBeenCalledWith("Field 'count': stored range 0.5..9.5 has ends that are not whole numbers, using 1..9");
    });

    it('leaves a non-integer range as is, even when fractional', () => {
      expect(sanitizeStored(years, [2010.5, 2020.5], NO_FIELD_CONTEXT)).toEqual([2010.5, 2020.5]);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
