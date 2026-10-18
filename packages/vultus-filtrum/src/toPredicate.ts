import { and, eq, isIn, leaf, type Predicate } from 'filtrum-core';
// Types only: vultus-core's entry loads React, and this package runs where there is none.
import type { FieldDefinition, ValueOrFn } from 'vultus-core';

/** A filter whose kind has no predicate here (boolean, mixed-boolean, numeric, range, or a kind vultus-core does not know). */
export class UnsupportedFieldKindError extends Error {
  readonly fieldId: string;
  readonly kind: string;

  constructor(fieldId: string, kind: string) {
    super(`Field '${fieldId}': a filter of kind '${kind}' has no filtrum predicate (supported: ${Object.keys(LEAVES).join(', ')})`);
    this.name = 'UnsupportedFieldKindError';
    this.fieldId = fieldId;
    this.kind = kind;
  }
}

export interface ToPredicateOptions<Ctx> {
  /**
   * The field context the definitions' functions receive, as the browser gives it to them: with
   * a field group's `values` among its keys when `visible` or `hidden` read them.
   */
  ctx: Ctx;
  /** The record field each filter matches, by filter id; a filter not named here matches the field of its own id. */
  fields?: Readonly<Record<string, string>>;
}

/**
 * The leaf of each supported kind. A tree filter's record field holds the ids from the root down
 * to the record's own node, so `eq` and `in` match an element of it (MongoDB's array semantics).
 * A text filter gives the raw string to the `search` operator, which the backend splits.
 */
const LEAVES: Readonly<Record<string, (field: string, value: unknown) => Predicate>> = {
  oneOf: (field, value) => eq(field, value as string),
  manyOf: (field, value) => isIn(field, [...(value as Iterable<string>)]),
  oneOfTree: (field, value) => eq(field, value as string),
  manyOfTree: (field, value) => isIn(field, [...(value as Iterable<string>)]),
  text: (field, value) => leaf(field, 'search', value),
};

/** No value: `undefined`, `''`, an empty list or set. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Set) return value.size === 0;
  return false;
}

/** An option resolved as vultus-core's `resolveIn` resolves it with a context: a function that gives `undefined` (or `null`) counts as absent. */
function resolveOption<T, Ctx>(option: ValueOrFn<T, Ctx> | undefined, ctx: Ctx): T | undefined {
  if (option === undefined) return undefined;
  if (typeof option !== 'function') return option;
  return (option as (ctx: Ctx) => T)(ctx) ?? undefined;
}

/** Shown, as vultus-core's `calculateVisible` decides it: by default yes; `visible` and `hidden` must not contradict each other. */
function isVisible<Ctx>(definition: FieldDefinition<Ctx>, ctx: Ctx): boolean {
  const visible = resolveOption(definition.visible, ctx);
  const hidden = resolveOption(definition.hidden, ctx);
  if (visible === undefined) return hidden === undefined ? true : !hidden;
  if (hidden === undefined || visible !== hidden) return visible;
  throw new Error(`Field '${definition.id}': "visible" and "hidden" contradict each other`);
}

/**
 * The filtrum predicate that vultus filter definitions and their values amount to: one leaf per
 * filter that is shown for `ctx` and has a value, on the record field of the filter's id (or the
 * one `fields` names). `oneOf` and `oneOfTree` give `eq`, `manyOf` and `manyOfTree` give `in`,
 * `text` gives `search`; several leaves are ANDed, none give `{}` (everything matches). A filter
 * of any other kind throws UnsupportedFieldKindError, whatever its value and visibility.
 */
export function toPredicate<Ctx>(
  definitions: readonly FieldDefinition<Ctx>[],
  values: Readonly<Record<string, unknown>>,
  options: ToPredicateOptions<Ctx>,
): Predicate {
  const { ctx, fields } = options;
  const leaves: Predicate[] = [];
  for (const definition of definitions) {
    const { id } = definition;
    const kind: unknown = definition.kind;
    const toLeaf = typeof kind === 'string' && Object.hasOwn(LEAVES, kind) ? LEAVES[kind] : undefined;
    if (toLeaf === undefined) throw new UnsupportedFieldKindError(id, String(kind));
    if (!isVisible(definition, ctx)) continue;
    // Own keys only: a filter id such as `toString` must not find Object's member.
    const value = Object.hasOwn(values, id) ? values[id] : undefined;
    if (isEmpty(value)) continue;
    const field = fields !== undefined && Object.hasOwn(fields, id) ? fields[id] : id;
    leaves.push(toLeaf(field, value));
  }
  if (leaves.length === 0) return {};
  return leaves.length === 1 ? leaves[0] : and(...leaves);
}
