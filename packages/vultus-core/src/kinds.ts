import { resolveChoice, type OneOfChoice, type OneOfChoiceControls } from './choices.js';
import type { FieldBaseOptions, FieldKind } from './field.js';
import type { FieldCtx } from './FieldContext.js';
import { clamp, resolveNumeric } from './numeric.js';
import { resolveIn } from './resolve.js';
import { normalizeTreeValue, type TreeNode } from './tree.js';
import type { ValueOrFn } from './types.js';
import { boolInitialValue, type useBoolField } from './useBoolField.js';
import { manyOfInitialValue, type ManyOfOwnOptions, type useManyOfField } from './useManyOfField.js';
import { mixedBoolInitialValue, type MixedBool, type useMixedBoolField } from './useMixedBoolField.js';
import { numericInitialValue, type NumericOwnOptions, type useNumericField } from './useNumericField.js';
import { oneOfInitialValue, type OneOfOwnOptions, type useOneOfField } from './useOneOfField.js';
import { rangeInitialValue, type Range, type RangeOwnOptions, type useRangeField } from './useRangeField.js';
import { textInitialValue, type TextOwnOptions, type useTextField } from './useTextField.js';
import { treeInitialValue, type TreeOwnOptions, type useTreeField } from './useTreeField.js';
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
  | Definition<'range', Range, RangeOwnOptions<Ctx>, Ctx>
  | Definition<'tree', string[], TreeOwnOptions<string, Ctx>, Ctx>
  | Definition<'text', string, TextOwnOptions, Ctx>;

/** Compiles only when `A` is assignable to `B`. */
type Fits<A extends B, B> = A;
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
  Fits<DefinitionOf<'tree'>, HookOptions<typeof useTreeField>>,
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

/**
 * A definition's default: `initialValue` resolved with the field context, else its kind's
 * implicit initial value (false; the first enabled choice; the empty list; `min`, or 0, clamped
 * into the bounds; `[min, max]`; the empty string). It is what a store falls back to, what a
 * reset restores, and what "is it set?" compares against; the kind's hook starts at the same value.
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
    case 'tree': return treeInitialValue(definition, ctx, id);
    case 'text': return textInitialValue(definition, ctx, id);
    default: return unknownKind(definition);
  }
}

/** How a kind's value is kept in a store. A mixed-boolean field shows an aggregate of other data, so it has none and throws. */
export function valueTypeOf(kind: FieldKind): ValueType<any> {
  switch (kind) {
    case 'boolean': return booleanType;
    case 'oneOf':
    case 'text': return stringType;
    case 'manyOf':
    case 'tree': return stringSetType;
    case 'numeric': return numberType;
    case 'range': return rangeType;
    case 'mixed-boolean': throw new Error(NOT_STORABLE);
    default: throw new Error(`unknown field kind '${String(kind as unknown)}'`);
  }
}

function warnDropped(id: string, among: 'choices' | 'nodes', dropped: string[]): void {
  if (dropped.length === 0) return;
  const listed = [...new Set(dropped)].map((v) => `'${v}'`).join(', ');
  console.warn(`Field '${id}': dropping stored values that are not among its ${among}: ${listed}`);
}

/**
 * A stored value (already parsed by the kind's value type) made fit for the definition as it is
 * now: choices, nodes and bounds follow the data, and an old URL may not. A one-of value that is
 * not a choice becomes the initial value; many-of and tree values that are not choices or nodes
 * are dropped; numbers and ranges are clamped into the bounds. Each such change warns, naming
 * the field: the value came from outside, so it is not an error. Reordering is silent: lists
 * come back in choice order or normalized under the tree's selection (a store keeps them
 * sorted, so a warning would come on every read), and a range's ends in order.
 */
export function sanitizeStored(definition: FieldDefinition, value: unknown, ctx: FieldCtx): unknown {
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
      if (fallback !== value) console.warn(`Field '${id}': stored value '${value}' is not one of its choices, using '${fallback}'`);
      return fallback;
    }
    case 'manyOf': {
      const stored = value as string[];
      const known = choicesOf(definition, ctx).map((c) => c.value);
      warnDropped(id, 'choices', stored.filter((v) => !known.includes(v)));
      return known.filter((v) => stored.includes(v));
    }
    case 'tree': {
      const stored = value as string[];
      const nodes = resolveIn<TreeNode[]>(definition.nodes, [], ctx, `Field '${id}': option 'nodes'`);
      const known = nodeValues(nodes);
      warnDropped(id, 'nodes', stored.filter((v) => !known.has(v)));
      return normalizeTreeValue(nodes, stored.filter((v) => known.has(v)), definition.selection ?? 'topmost');
    }
    case 'numeric': {
      const stored = value as number;
      const { min, max } = resolveNumeric(id, definition, ctx);
      const clamped = clamp(stored, min, max);
      if (clamped !== stored) console.warn(`Field '${id}': stored value ${stored} is outside its bounds, using ${clamped}`);
      return clamped;
    }
    case 'range': {
      const stored = value as Range;
      const { min, max } = resolveNumeric(id, definition, ctx);
      const from = clamp(stored[0], min, max);
      const to = clamp(stored[1], min, max);
      const sanitized: Range = [Math.min(from, to), Math.max(from, to)];
      if (from !== stored[0] || to !== stored[1]) {
        console.warn(`Field '${id}': stored range ${rangeType.format(stored)} is outside its bounds, using ${rangeType.format(sanitized)}`);
      }
      return sanitized;
    }
    default: return unknownKind(definition);
  }
}
