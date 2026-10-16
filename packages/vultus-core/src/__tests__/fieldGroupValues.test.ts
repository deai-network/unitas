import { describe, it, expect, vi } from 'vitest';
import { NO_FIELD_CONTEXT, type FieldCtx } from '../FieldContext.js';
import { createGroupValues } from '../fieldGroupValues.js';
import type { FieldDefinition } from '../kinds.js';

/** The context a group's option functions receive. */
type GroupCtx = { values: Record<string, unknown> } & Record<string, any>;

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

/** Calls a definition's option function with a group's context. */
function option(definition: FieldDefinition, name: string, ctx: object): unknown {
  return (definition as unknown as Record<string, (ctx: object) => unknown>)[name](ctx);
}

interface Snapshot {
  definitions?: readonly FieldDefinition[];
  appCtx?: FieldCtx;
  warn?: (id: string, message: string) => void;
}

/** One render's values of a group whose kept values are `kept` (an id absent: nothing kept). */
function snapshot(kept: Record<string, unknown>, { definitions = PRINT, appCtx = NO_FIELD_CONTEXT, warn = () => {} }: Snapshot = {}) {
  return createGroupValues({ definitions, appCtx, kept: (id) => kept[id], warn });
}

describe('field group values: references', () => {
  it('with nothing kept, every field shows its default', () => {
    expect({ ...snapshot({}).values }).toEqual({ layout: 'rendered', paper: 'a4', copies: 1 });
  });

  it('a field whose choices read another field is checked against those choices', () => {
    expect(snapshot({ layout: 'original', paper: 'letter' }).values.paper).toBe('letter');
    expect(snapshot({ layout: 'rendered', paper: 'letter' }).values.paper).toBe('a4');
  });

  it('every option function receives the fields\' shown values in the group\'s context', () => {
    const { ctx } = snapshot({ layout: 'original', copies: 3 });
    expect((ctx as GroupCtx).values.layout).toBe('original');
    expect((ctx as GroupCtx).values.copies).toBe(3);
    expect(option(copies, 'visible', ctx)).toBe(true);
    expect(option(copies, 'visible', snapshot({ layout: 'rendered' }).ctx)).toBe(false);
  });

  it('valueOf and values give the same shown values', () => {
    const group = snapshot({ layout: 'rendered', paper: 'letter', copies: 2 });
    expect(group.valueOf('paper')).toBe('a4');
    expect(group.values.paper).toBe('a4');
    expect((group.ctx as GroupCtx).values.paper).toBe('a4');
    expect(group.valueOf('copies')).toBe(2);
  });

  it('each value is computed once per snapshot, however often it is read', () => {
    const choices = vi.fn(() => [{ value: 'rendered' }, { value: 'original' }]);
    const tray: FieldDefinition = {
      kind: 'oneOf', id: 'tray', choices: (ctx) => [{ value: 'auto', enabled: ctx.values.layout === 'rendered' }, { value: 'manual' }],
    };
    const group = snapshot({}, { definitions: [{ ...layout, choices }, paper, tray] });
    group.valueOf('layout');
    const calls = choices.mock.calls.length;
    expect({ ...group.values }).toEqual({ layout: 'rendered', paper: 'a4', tray: 'auto' });
    group.valueOf('layout');
    group.defaultOf('layout');
    expect(choices).toHaveBeenCalledTimes(calls);
  });
});

describe('field group values: the fallback rule', () => {
  it('a kept value another field made invalid shows the fallback, and shows again once valid', () => {
    const kept: Record<string, unknown> = { layout: 'original', paper: 'letter' };
    expect(snapshot(kept).values.paper).toBe('letter');
    kept.layout = 'rendered';
    expect(snapshot(kept).values.paper).toBe('a4');
    kept.layout = 'original';
    expect(snapshot(kept).values.paper).toBe('letter');
  });

  it('a one-of tree\'s kept node that can no longer be chosen falls back, and shows again once choosable', () => {
    const toc: FieldDefinition = {
      kind: 'oneOfTree', id: 'toc',
      nodes: (ctx) => [{ value: 'ch1', choosable: ctx.values.layout === 'original', children: [{ value: 's1' }, { value: 's2' }] }],
    };
    const warn = vi.fn();
    const kept: Record<string, unknown> = { layout: 'original', toc: 'ch1' };
    expect(snapshot(kept, { definitions: [layout, toc], warn }).values.toc).toBe('ch1');
    kept.layout = 'rendered';
    expect(snapshot(kept, { definitions: [layout, toc], warn }).values.toc).toBe('s1');
    expect(warn).toHaveBeenCalledWith('toc', "Field 'toc': stored value 'ch1' cannot be chosen, using 's1'");
    kept.layout = 'original';
    expect(snapshot(kept, { definitions: [layout, toc], warn }).values.toc).toBe('ch1');
  });

  it('the other fields see the fallback', () => {
    const note: FieldDefinition = { kind: 'text', id: 'note', placeholder: (ctx) => `on ${ctx.values.paper}` };
    const { ctx } = snapshot({ layout: 'rendered', paper: 'letter' }, { definitions: [...PRINT, note] });
    expect(option(note, 'placeholder', ctx)).toBe('on a4');
  });

  it('a kept value that falls back warns, naming the field', () => {
    const warn = vi.fn();
    expect(snapshot({ layout: 'rendered', paper: 'letter' }, { warn }).valueOf('paper')).toBe('a4');
    expect(warn).toHaveBeenCalledWith('paper', "Field 'paper': stored value 'letter' is not one of its choices, using 'a4'");
  });

  it('a default is made fit silently: it is the definer\'s, not kept input', () => {
    const warn = vi.fn();
    const below: FieldDefinition = { kind: 'numeric', id: 'copies', min: 1, initialValue: 0 };
    expect(snapshot({}, { definitions: [below], warn }).valueOf('copies')).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a hidden field keeps its value, and the others still see it', () => {
    const { ctx, values } = snapshot({ layout: 'rendered', copies: 3 });
    expect(option(copies, 'visible', ctx)).toBe(false);
    expect(values.copies).toBe(3);
    expect((ctx as GroupCtx).values.copies).toBe(3);
  });
});

describe('field group values: defaults follow the options', () => {
  const tray: FieldDefinition = {
    kind: 'oneOf', id: 'tray', choices: (ctx) => [{ value: 'auto', enabled: ctx.values.layout === 'rendered' }, { value: 'manual' }],
  };

  it('a one-of without initialValue defaults to the first enabled choice of its current choices', () => {
    expect(snapshot({ layout: 'rendered' }, { definitions: [layout, tray] }).defaultOf('tray')).toBe('auto');
    expect(snapshot({ layout: 'original' }, { definitions: [layout, tray] }).defaultOf('tray')).toBe('manual');
  });

  it('with nothing kept, the field shows the default as it moves', () => {
    expect(snapshot({ layout: 'rendered' }, { definitions: [layout, tray] }).values.tray).toBe('auto');
    expect(snapshot({ layout: 'original' }, { definitions: [layout, tray] }).values.tray).toBe('manual');
  });

  it('a number defaults to its current min', () => {
    const count: FieldDefinition = { kind: 'numeric', id: 'copies', min: (ctx) => (ctx.values.layout === 'original' ? 2 : 1) };
    expect(snapshot({ layout: 'original' }, { definitions: [layout, count] }).defaultOf('copies')).toBe(2);
    expect(snapshot({ layout: 'rendered' }, { definitions: [layout, count] }).defaultOf('copies')).toBe(1);
  });

  it('a one-of tree whose nodes read another field defaults to its first choosable node, which moves', () => {
    const toc: FieldDefinition = {
      kind: 'oneOfTree', id: 'toc',
      nodes: (ctx) => [{ value: 'ch1', choosable: ctx.values.layout === 'original', children: [{ value: 's1' }, { value: 's2' }] }],
    };
    expect(snapshot({ layout: 'rendered' }, { definitions: [layout, toc] }).defaultOf('toc')).toBe('s1');
    expect(snapshot({ layout: 'original' }, { definitions: [layout, toc] }).defaultOf('toc')).toBe('ch1');
    expect(snapshot({ layout: 'rendered' }, { definitions: [layout, toc] }).values.toc).toBe('s1');
    expect(snapshot({ layout: 'original' }, { definitions: [layout, toc] }).values.toc).toBe('ch1');
  });

  it('initialValue reads the app\'s context', () => {
    const preferred: FieldDefinition = { kind: 'oneOf', id: 'paper', choices: ALL_SIZES, initialValue: (ctx) => ctx.preferredPaper };
    const group = snapshot({}, { definitions: [preferred], appCtx: { preferredPaper: 'letter' } });
    expect(group.defaultOf('paper')).toBe('letter');
    expect(group.valueOf('paper')).toBe('letter');
  });
});

describe('field group values: the app\'s context', () => {
  it('the app context\'s own keys are readable beside values', () => {
    const limited: FieldDefinition = { kind: 'numeric', id: 'copies', min: 1, max: (ctx) => ctx.limits[ctx.values.layout] };
    const appCtx = { limits: { rendered: 5, original: 20 }, t: (k: string) => k.toUpperCase() };
    expect(snapshot({ layout: 'rendered', copies: 10 }, { definitions: [layout, limited], appCtx }).values.copies).toBe(5);
    const { ctx } = snapshot({ layout: 'original', copies: 10 }, { definitions: [layout, limited], appCtx });
    expect((ctx as GroupCtx).values.copies).toBe(10);
    expect((ctx as GroupCtx).t('x')).toBe('X');
  });

  it('a key the app never provided throws, naming the field and the option', () => {
    const limited: FieldDefinition = { kind: 'numeric', id: 'copies', max: (ctx) => ctx.limits.rendered };
    expect(() => snapshot({}, { definitions: [limited] }).valueOf('copies'))
      .toThrow(/^Field 'copies': option 'max': Field context: 'limits' was never provided \(provided: values\)$/);
  });

  it('an app context that has values already throws instead of shadowing it', () => {
    expect(() => snapshot({}, { appCtx: { values: {} } }))
      .toThrow(/^Field group: the field context already has 'values'; a field group provides it$/);
  });
});

describe('field group values: loud failures', () => {
  it('reading an id that is not in the group throws, naming the field, the option and the group\'s fields', () => {
    const typo: FieldDefinition = { ...paper, choices: (ctx) => (ctx.values.layot === 'rendered' ? A_SIZES : ALL_SIZES) };
    expect(() => snapshot({}, { definitions: [layout, typo, copies] }).valueOf('paper'))
      .toThrow(/^Field 'paper': option 'choices': no field 'layot' in the group \(fields: layout, paper, copies\)$/);
  });

  it('an id that names a member every object has is not in the group either', () => {
    const { values, ctx } = snapshot({});
    expect(() => values.toString).toThrow(/^no field 'toString' in the group \(fields: layout, paper, copies\)$/);
    expect(() => values.constructor).toThrow(/^no field 'constructor' in the group \(fields: layout, paper, copies\)$/);
    const typo: FieldDefinition = { kind: 'text', id: 'note', placeholder: (c) => String(c.values.constructor) };
    expect(() => option(typo, 'placeholder', ctx)).toThrow(/^no field 'constructor' in the group/);
  });

  it('asking for an id that is not in the group throws', () => {
    expect(() => snapshot({}).valueOf('layot')).toThrow(/^no field 'layot' in the group \(fields: layout, paper, copies\)$/);
    expect(() => snapshot({}).defaultOf('layot')).toThrow(/^no field 'layot' in the group \(fields: layout, paper, copies\)$/);
  });

  it('two definitions with the same id throw', () => {
    expect(() => snapshot({}, { definitions: [layout, paper, { ...paper }] }))
      .toThrow(/^Field 'paper': another field in the group has the same id$/);
  });

  it('a mixed-boolean definition throws', () => {
    expect(() => snapshot({}, { definitions: [layout, { kind: 'mixed-boolean', id: 'all' }] }))
      .toThrow(/^Field 'all': a mixed-boolean field shows an aggregate of other data, not a value of its own, so it cannot be in a field group$/);
  });

  it('initialValue reading values throws, naming the field and the option', () => {
    const following: FieldDefinition = {
      kind: 'oneOf', id: 'paper', choices: ALL_SIZES, initialValue: (ctx) => (ctx.values.layout === 'rendered' ? 'a4' : 'letter'),
    };
    const message = /^Field 'paper': option 'initialValue': initialValue cannot read other fields' values$/;
    expect(() => snapshot({}, { definitions: [layout, following] }).defaultOf('paper')).toThrow(message);
    expect(() => snapshot({}, { definitions: [layout, following] }).valueOf('paper')).toThrow(message);
    // A kept value that falls back falls back to the default, so initialValue runs there too.
    expect(() => snapshot({ paper: 'b5' }, { definitions: [layout, following] }).valueOf('paper')).toThrow(message);
  });

  it('initialValue reading a key the app never provided lists the keys it can read, not values', () => {
    const preferred: FieldDefinition = { kind: 'oneOf', id: 'paper', choices: ALL_SIZES, initialValue: (ctx) => ctx.preferredPaper };
    expect(() => snapshot({}, { definitions: [preferred], appCtx: { t: (k: string) => k, lang: 'hu' } }).defaultOf('paper'))
      .toThrow(/^Field 'paper': option 'initialValue': Field context: 'preferredPaper' was never provided \(provided: t, lang\)$/);
  });
});

describe('field group values: cycles', () => {
  const a: FieldDefinition = { kind: 'oneOf', id: 'a', choices: (ctx) => [{ value: String(ctx.values.b) }] };
  const b: FieldDefinition = { kind: 'oneOf', id: 'b', choices: (ctx) => [{ value: String(ctx.values.a) }] };

  it('two fields whose values depend on each other throw, naming the cycle', () => {
    expect(() => snapshot({}, { definitions: [a, b] }).valueOf('a')).toThrow(/^Fields 'a' -> 'b' -> 'a' depend on each other's values$/);
    expect(() => snapshot({}, { definitions: [a, b] }).values.b).toThrow(/^Fields 'b' -> 'a' -> 'b' depend on each other's values$/);
    expect(() => snapshot({}, { definitions: [a, b] }).defaultOf('a')).toThrow(/^Fields 'a' -> 'b' -> 'a' depend on each other's values$/);
  });

  it('kept values do not hide a cycle', () => {
    expect(() => snapshot({ a: 'x', b: 'y' }, { definitions: [a, b] }).valueOf('a'))
      .toThrow(/^Fields 'a' -> 'b' -> 'a' depend on each other's values$/);
  });

  it('after a cycle throws, the fields outside it still compute in the same snapshot', () => {
    const group = snapshot({ layout: 'original', paper: 'letter' }, { definitions: [a, b, layout, paper] });
    expect(() => group.valueOf('a')).toThrow(/^Fields 'a' -> 'b' -> 'a' depend on each other's values$/);
    expect(group.valueOf('paper')).toBe('letter');
    expect(group.values.layout).toBe('original');
    expect(() => group.valueOf('b')).toThrow(/^Fields 'b' -> 'a' -> 'b' depend on each other's values$/);
  });

  it('the cycle is named without the fields leading into it', () => {
    const c: FieldDefinition = { kind: 'oneOf', id: 'c', choices: (ctx) => [{ value: String(ctx.values.a) }] };
    expect(() => snapshot({}, { definitions: [a, b, c] }).valueOf('c')).toThrow(/^Fields 'a' -> 'b' -> 'a' depend on each other's values$/);
  });

  it('a field whose value depends on its own throws', () => {
    const self: FieldDefinition = { kind: 'numeric', id: 'n', max: (ctx) => ctx.values.n };
    expect(() => snapshot({}, { definitions: [self] }).valueOf('n')).toThrow(/^Fields 'n' -> 'n' depend on each other's values$/);
  });

  it('options that never affect a value cannot form a cycle', () => {
    const shown: FieldDefinition = { kind: 'boolean', id: 'a', visible: (ctx) => ctx.values.b === 'on' };
    const choosing: FieldDefinition = { kind: 'oneOf', id: 'b', choices: (ctx) => [{ value: ctx.values.a ? 'on' : 'off' }] };
    const group = snapshot({ a: true }, { definitions: [shown, choosing] });
    expect({ ...group.values }).toEqual({ a: true, b: 'on' });
    expect(option(shown, 'visible', group.ctx)).toBe(true);
  });

  it('a number\'s display options may read its own value', () => {
    const counted: FieldDefinition = {
      kind: 'numeric', id: 'copies', min: 1,
      unit: (ctx) => (ctx.values.copies === 1 ? ' copy' : ' copies'),
      step: (ctx) => (ctx.values.copies === 1 ? 1 : 2),
    };
    const group = snapshot({}, { definitions: [counted] });
    expect(group.valueOf('copies')).toBe(1);
    expect(option(counted, 'unit', group.ctx)).toBe(' copy');
    expect(option(counted, 'step', group.ctx)).toBe(1);
  });
});
