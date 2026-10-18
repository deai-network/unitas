import { describe, expect, test } from 'vitest';
import type { FieldDefinition } from 'vultus-core';
import { toPredicate, UnsupportedFieldKindError } from './index.js';

interface Ctx {
  values: Readonly<Record<string, unknown>>;
}

/** The context as a field group gives it to its definitions' functions: `values` among its keys. */
const ctxOf = (values: Readonly<Record<string, unknown>>): Ctx => ({ values });

const nodes = [{ value: 'ch1', label: 'Chapter 1', children: [{ value: 'ch1.1', label: 'Section 1.1' }] }];

const category: FieldDefinition<Ctx> = {
  kind: 'oneOf', id: 'category', choices: [{ value: '', label: 'All' }, { value: 'algebra', label: 'Algebra' }],
};
const tags: FieldDefinition<Ctx> = {
  kind: 'manyOf', id: 'tags', choices: [{ value: 'easy', label: 'Easy' }, { value: 'hard', label: 'Hard' }],
};
const topics: FieldDefinition<Ctx> = { kind: 'manyOfTree', id: 'topics', nodes };
const toc: FieldDefinition<Ctx> = { kind: 'oneOfTree', id: 'toc', nodes, optional: true };
const search: FieldDefinition<Ctx> = { kind: 'text', id: 'search' };

function predicateOf(definitions: FieldDefinition<Ctx>[], values: Record<string, unknown>, fields?: Record<string, string>) {
  return toPredicate(definitions, values, { ctx: ctxOf(values), fields });
}

describe('toPredicate', () => {
  test('oneOf compiles to eq on the filter id', () => {
    expect(predicateOf([category], { category: 'algebra' })).toEqual({ category: { eq: 'algebra' } });
  });

  test('fields overrides the record field', () => {
    expect(predicateOf([search], { search: 'prime' }, { search: 'text' })).toEqual({ text: { search: 'prime' } });
    // A filter the map does not name keeps its id as the field.
    expect(predicateOf([category], { category: 'algebra' }, { search: 'text' })).toEqual({ category: { eq: 'algebra' } });
    // Own keys only: an id that names an Object member is not found in the map.
    expect(predicateOf([{ kind: 'text', id: 'toString' }], { toString: 'x' }, {})).toEqual({ toString: { search: 'x' } });
  });

  test('manyOf and manyOfTree compile to in', () => {
    expect(predicateOf([tags], { tags: ['easy', 'hard'] })).toEqual({ tags: { in: ['easy', 'hard'] } });
    expect(predicateOf([topics], { topics: ['ch1.1'] })).toEqual({ topics: { in: ['ch1.1'] } });
    // A string set may come as a Set; the leaf always holds an array.
    expect(predicateOf([tags], { tags: new Set(['hard']) })).toEqual({ tags: { in: ['hard'] } });
  });

  test('oneOfTree compiles to eq (an array element match)', () => {
    // The record's field holds the ids from the root to its own node, so eq matches an element.
    expect(predicateOf([toc], { toc: 'ch1' })).toEqual({ toc: { eq: 'ch1' } });
  });

  test('text compiles to a search leaf with the raw string', () => {
    expect(predicateOf([search], { search: '  Prím  számok ' })).toEqual({ search: { search: '  Prím  számok ' } });
  });

  test('empty values add nothing', () => {
    const all = [category, tags, topics, toc, search];
    expect(predicateOf(all, { category: '', tags: [], topics: new Set(), toc: '', search: '' })).toEqual({});
    expect(predicateOf(all, { tags: new Set(), topics: [] })).toEqual({});
    expect(predicateOf(all, {})).toEqual({});
    // Own keys only: a filter whose id names an Object member has no value unless one is given.
    expect(predicateOf([{ kind: 'text', id: 'toString' }], {})).toEqual({});
  });

  test('a filter hidden for the current values adds nothing', () => {
    // doc-kit's table of contents: shown only while there is no search, and its value is kept meanwhile.
    const tocWhileBrowsing: FieldDefinition<Ctx> = { ...toc, visible: (ctx) => ctx.values.search === '' };
    expect(predicateOf([search, tocWhileBrowsing], { search: 'prime', toc: 'ch1' })).toEqual({ search: { search: 'prime' } });
    expect(predicateOf([search, tocWhileBrowsing], { search: '', toc: 'ch1' })).toEqual({ toc: { eq: 'ch1' } });

    // `hidden` as well as `visible`, as values or functions of the context.
    const values = { category: 'algebra' };
    expect(predicateOf([{ ...category, hidden: true }], values)).toEqual({});
    expect(predicateOf([{ ...category, hidden: (ctx) => ctx.values.category === 'algebra' }], values)).toEqual({});
    expect(predicateOf([{ ...category, visible: false }], values)).toEqual({});
    expect(predicateOf([{ ...category, visible: true, hidden: false }], values)).toEqual({ category: { eq: 'algebra' } });
    // A function that gives undefined counts as an absent option, as in vultus-core: shown.
    expect(predicateOf([{ ...category, visible: () => undefined as unknown as boolean }], values))
      .toEqual({ category: { eq: 'algebra' } });
    // Contradicting `visible` and `hidden` throw, as in vultus-core.
    expect(() => predicateOf([{ ...category, visible: true, hidden: true }], values)).toThrow(/contradict/);
  });

  test('several leaves are ANDed', () => {
    expect(predicateOf([category, tags, search], { category: 'algebra', tags: ['easy'], search: 'prime' })).toEqual({
      AND: [{ category: { eq: 'algebra' } }, { tags: { in: ['easy'] } }, { search: { search: 'prime' } }],
    });
  });

  test('unsupported kinds throw UnsupportedFieldKindError naming the field', () => {
    const unsupported: FieldDefinition<Ctx>[] = [
      { kind: 'boolean', id: 'solved' },
      { kind: 'numeric', id: 'year', min: 1900, max: 2030 },
      { kind: 'range', id: 'points', min: 0, max: 10 },
      { kind: 'mixed-boolean', id: 'all' },
    ];
    for (const definition of unsupported) {
      // Whatever its value, and before visibility is asked: such a module keeps its own list().
      for (const values of [{}, { [definition.id]: 1 }]) {
        let error: unknown;
        try {
          predicateOf([{ ...definition, visible: false } as FieldDefinition<Ctx>, search], { ...values, search: 'x' });
        } catch (e) {
          error = e;
        }
        expect(error).toBeInstanceOf(UnsupportedFieldKindError);
        const { fieldId, kind, message } = error as UnsupportedFieldKindError;
        expect({ fieldId, kind }).toEqual({ fieldId: definition.id, kind: definition.kind });
        expect(message).toContain(`'${definition.id}'`);
      }
    }
    // A kind vultus-core does not know (plain data can carry anything) throws the same way.
    expect(() => predicateOf([{ kind: 'colour', id: 'paint' } as unknown as FieldDefinition<Ctx>], {}))
      .toThrow(UnsupportedFieldKindError);
  });

  test('no definitions give {}', () => {
    expect(predicateOf([], { search: 'prime' })).toEqual({});
  });
});
