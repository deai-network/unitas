import { resolveChoice, type OneOfChoice, type OneOfChoiceControls } from './choices.js';
import type { FieldBaseOptions, FieldKind } from './field.js';
import type { FieldCtx } from './FieldContext.js';
import { clamp, fit, resolveNumeric } from './numeric.js';
import { resolveIn } from './resolve.js';
import { choosableValues, normalizeTreeValue, type TreeNode } from './tree.js';
import type { Fits, ValueOrFn } from './types.js';
import { boolInitialValue, type useBoolField } from './useBoolField.js';
import { manyOfInitialValue, type ManyOfOwnOptions, type useManyOfField } from './useManyOfField.js';
import { mixedBoolInitialValue, type MixedBool, type useMixedBoolField } from './useMixedBoolField.js';
import { numericInitialValue, type NumericOwnOptions, type useNumericField } from './useNumericField.js';
import { oneOfInitialValue, type OneOfOwnOptions, type useOneOfField } from './useOneOfField.js';
import { oneOfTreeInitialValue, type OneOfTreeOwnOptions, type useOneOfTreeField } from './useOneOfTreeField.js';
import { rangeInitialValue, type NumberRange, type RangeOwnOptions, type useRangeField } from './useRangeField.js';
import { textInitialValue, type TextOwnOptions, type useTextField } from './useTextField.js';
import { manyOfTreeInitialValue, type ManyOfTreeOwnOptions, type useManyOfTreeField } from './useManyOfTreeField.js';
import { booleanType, numberType, rangeType, stringSetType, stringType, type ValueType } from './valueTypes.js';

/**
 * A definition of kind `K`: the kind's hook options in their inside form, with `kind` required.
 * It has no `value`, `onChange` or `commit`: where the value lives is chosen by whoever runs the
 * field, and a store holds the definition's initial value as its default.
 */
type Definition<K extends FieldKind, V, Own, Ctx> =
  { kind: K } & FieldBaseOptions<V, Ctx> & { initialValue?: ValueOrFn<V, Ctx> } & Own;

/**
 * A field as plain data (a module's filters, a dialog's options), tagged by its kind. Narrowed
 * by `kind`, a definition is its kind's hook options as they are: `useOneOfField(definition)`.
 * Its functions receive the field context `Ctx` (see FieldContextProvider).
 */
export type FieldDefinition<Ctx = any> =
  | Definition<'boolean', boolean, {}, Ctx>
  | Definition<'mixed-boolean', MixedBool, {}, Ctx>
  | Definition<'oneOf', string, OneOfOwnOptions<string, Ctx>, Ctx>
  | Definition<'manyOf', string[], ManyOfOwnOptions<string, Ctx>, Ctx>
  | Definition<'numeric', number, NumericOwnOptions<Ctx>, Ctx>
  | Definition<'range', NumberRange, RangeOwnOptions<Ctx>, Ctx>
  | Definition<'manyOfTree', string[], ManyOfTreeOwnOptions<string, Ctx>, Ctx>
  | Definition<'oneOfTree', string, OneOfTreeOwnOptions<string, Ctx>, Ctx>
  | Definition<'text', string, TextOwnOptions, Ctx>;

type DefinitionOf<K extends FieldKind> = Extract<FieldDefinition, { kind: K }>;
type HookOptions<H extends (...args: any[]) => unknown> = Parameters<H>[0];

/**
 * A compile-time check, the gate for "a definition is its kind's hook options as they are": if a
 * hook's options and the definition drift apart, `tsc` fails here.
 */
type DefinitionsFitTheirHooks = [
  Fits<DefinitionOf<'boolean'>, HookOptions<typeof useBoolField>>,
  Fits<DefinitionOf<'mixed-boolean'>, HookOptions<typeof useMixedBoolField>>,
  Fits<DefinitionOf<'oneOf'>, HookOptions<typeof useOneOfField>>,
  Fits<DefinitionOf<'manyOf'>, HookOptions<typeof useManyOfField>>,
  Fits<DefinitionOf<'numeric'>, HookOptions<typeof useNumericField>>,
  Fits<DefinitionOf<'range'>, HookOptions<typeof useRangeField>>,
  Fits<DefinitionOf<'manyOfTree'>, HookOptions<typeof useManyOfTreeField>>,
  Fits<DefinitionOf<'oneOfTree'>, HookOptions<typeof useOneOfTreeField>>,
  Fits<DefinitionOf<'text'>, HookOptions<typeof useTextField>>,
];

const NOT_STORABLE = 'a mixed-boolean field is an aggregate of other data and cannot be stored';

/** A definition whose kind is none of FieldKind's (plain data can carry anything): fail loudly rather than give nothing. */
function unknownKind(definition: never): never {
  const { id, kind } = definition as { id: string; kind: unknown };
  throw new Error(`Field '${id}': unknown kind '${String(kind)}'`);
}

/** The choices of a one-of or many-of definition, resolved as the hooks resolve them. */
function choicesOf(definition: { id: string; choices: ValueOrFn<OneOfChoice[]> }, ctx: FieldCtx): OneOfChoiceControls[] {
  const { id, choices } = definition;
  return resolveIn<OneOfChoice[]>(choices, [], ctx, `Field '${id}': option 'choices'`).map((c) => resolveChoice(id, c));
}

/** Every node's value, at any depth. */
function nodeValues(nodes: TreeNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(node.value);
    if (node.children) nodeValues(node.children, into);
  }
  return into;
}

/** A tree definition's nodes, resolved as useManyOfTreeField resolves them. */
function nodesOf(definition: { id: string; nodes: ValueOrFn<TreeNode[]> }, ctx: FieldCtx): TreeNode[] {
  return resolveIn<TreeNode[]>(definition.nodes, [], ctx, `Field '${definition.id}': option 'nodes'`);
}

/**
 * A definition's default: `initialValue` resolved with the field context, else its kind's
 * implicit initial value (false; the first enabled choice; the empty list; `min`, or 0, clamped
 * into the bounds; `[min, max]`; the empty string). A many-of tree's comes normalized under its
 * selection, as the hook shows it, so a value equal to what the field shows by default is equal
 * to the default too; a one-of tree's is `''` when `optional`, else the first node it can choose
 * in pre-order, else `''` (none can be chosen). It is what a store falls back to, what a reset
 * restores, and what "is it set?" compares against; the kind's hook starts at the same value.
 */
export function initialValueOf(definition: FieldDefinition, ctx: FieldCtx): unknown {
  const { id } = definition;
  switch (definition.kind) {
    case 'boolean': return boolInitialValue(definition, ctx, id);
    case 'mixed-boolean': return mixedBoolInitialValue(definition, ctx, id);
    case 'oneOf': return oneOfInitialValue(definition, ctx, id, choicesOf(definition, ctx));
    case 'manyOf': return manyOfInitialValue(definition, ctx, id);
    case 'numeric': return numericInitialValue(definition, ctx, id);
    case 'range': return rangeInitialValue(definition, ctx, id);
    case 'manyOfTree':
      return normalizeTreeValue(nodesOf(definition, ctx), manyOfTreeInitialValue(definition, ctx, id), definition.selection ?? 'topmost');
    case 'oneOfTree': return oneOfTreeInitialValue(definition, ctx, id, nodesOf(definition, ctx));
    case 'text': return textInitialValue(definition, ctx, id);
    default: return unknownKind(definition);
  }
}

/** How a kind's value is kept in a store. A mixed-boolean field shows an aggregate of other data, so it has none and throws. */
export function valueTypeOf(kind: FieldKind): ValueType<any> {
  switch (kind) {
    case 'boolean': return booleanType;
    case 'oneOf':
    case 'oneOfTree':
    case 'text': return stringType;
    case 'manyOf':
    case 'manyOfTree': return stringSetType;
    case 'numeric': return numberType;
    case 'range': return rangeType;
    case 'mixed-boolean': throw new Error(NOT_STORABLE);
    default: throw new Error(`unknown field kind '${String(kind as unknown)}'`);
  }
}

function warnDropped(id: string, among: 'choices' | 'nodes', dropped: string[], warn: (message: string) => void): void {
  if (dropped.length === 0) return;
  const listed = [...new Set(dropped)].map((v) => `'${v}'`).join(', ');
  warn(`Field '${id}': dropping stored values that are not among its ${among}: ${listed}`);
}

/**
 * A stored value (already parsed by the kind's value type) made fit for the definition as it is
 * now: choices, nodes and bounds follow the data, and an old URL may not. A one-of value that is
 * not a choice becomes the initial value; many-of values that are not choices or nodes are
 * dropped. A one-of tree value is replaced by the initial value too, when it names no node, when
 * the node it names cannot be chosen (a folder, or one a context change disabled), or when it is
 * `''` and the field is not optional. Numbers and ranges are clamped into the bounds, then
 * rounded when the field is `integer` (so a stored `2.5` reads `3`; a whole number inside the
 * bounds, see `fit`), with one warning for whichever of the two actually changed the value:
 * "outside its bounds" when clamping did (whether or not rounding also did), "not a whole
 * number" ("has ends that are not whole numbers" for a range) when only rounding did. Each such
 * change warns, naming the field: the value came from outside, so it is not an error. Reordering
 * is silent: lists come back in choice order or normalized under the tree's selection (a store
 * keeps them sorted, so a warning would come on every read), and a range's ends in order. The
 * warnings go to `warn`, console.warn unless a caller that only summarizes (useStoredFields)
 * silences them.
 */
export function sanitizeStored(
  definition: FieldDefinition,
  value: unknown,
  ctx: FieldCtx,
  warn: (message: string) => void = (message) => console.warn(message),
): unknown {
  const { id } = definition;
  switch (definition.kind) {
    case 'boolean':
    case 'text':
      return value;
    case 'mixed-boolean':
      throw new Error(`Field '${id}': ${NOT_STORABLE}`);
    case 'oneOf': {
      const choices = choicesOf(definition, ctx);
      if (choices.some((c) => c.value === value)) return value;
      const fallback = oneOfInitialValue(definition, ctx, id, choices);
      if (fallback !== value) warn(`Field '${id}': stored value '${value}' is not one of its choices, using '${fallback}'`);
      return fallback;
    }
    case 'manyOf': {
      const stored = value as string[];
      const known = choicesOf(definition, ctx).map((c) => c.value);
      warnDropped(id, 'choices', stored.filter((v) => !known.includes(v)), warn);
      return known.filter((v) => stored.includes(v));
    }
    case 'manyOfTree': {
      const stored = value as string[];
      const nodes = nodesOf(definition, ctx);
      const known = nodeValues(nodes);
      warnDropped(id, 'nodes', stored.filter((v) => !known.has(v)), warn);
      return normalizeTreeValue(nodes, stored.filter((v) => known.has(v)), definition.selection ?? 'topmost');
    }
    case 'oneOfTree': {
      const stored = value as string;
      const nodes = nodesOf(definition, ctx);
      if (stored === '') {
        if (definition.optional ?? false) return stored;
        const fallback = oneOfTreeInitialValue(definition, ctx, id, nodes);
        if (fallback !== stored) warn(`Field '${id}': stored value '' is empty but the field is not optional, using '${fallback}'`);
        return fallback;
      }
      if (choosableValues(nodes, definition.choose ?? 'any').includes(stored)) return stored;
      const fallback = oneOfTreeInitialValue(definition, ctx, id, nodes);
      const reason = nodeValues(nodes).has(stored) ? 'cannot be chosen' : 'names no node';
      if (fallback !== stored) warn(`Field '${id}': stored value '${stored}' ${reason}, using '${fallback}'`);
      return fallback;
    }
    case 'numeric': {
      const stored = value as number;
      const { min, max, integer } = resolveNumeric(id, definition, ctx);
      const clamped = clamp(stored, min, max);
      const fitted = fit(stored, min, max, integer);
      if (fitted !== stored) {
        if (clamped !== stored) warn(`Field '${id}': stored value ${stored} is outside its bounds, using ${fitted}`);
        else warn(`Field '${id}': stored value ${stored} is not a whole number, using ${fitted}`);
      }
      return fitted;
    }
    case 'range': {
      const stored = value as NumberRange;
      const { min, max, integer } = resolveNumeric(id, definition, ctx);
      const clampedChanged = clamp(stored[0], min, max) !== stored[0] || clamp(stored[1], min, max) !== stored[1];
      const from = fit(stored[0], min, max, integer);
      const to = fit(stored[1], min, max, integer);
      const sanitized: NumberRange = [Math.min(from, to), Math.max(from, to)];
      if (from !== stored[0] || to !== stored[1]) {
        if (clampedChanged) {
          warn(`Field '${id}': stored range ${rangeType.format(stored)} is outside its bounds, using ${rangeType.format(sanitized)}`);
        } else {
          warn(`Field '${id}': stored range ${rangeType.format(stored)} has ends that are not whole numbers, using ${rangeType.format(sanitized)}`);
        }
      }
      return sanitized;
    }
    default: return unknownKind(definition);
  }
}
