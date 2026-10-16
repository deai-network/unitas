import { useCallback, useRef, useState } from 'react';
import type { UpdateMethod } from './argStore.js';
import type { FieldControls } from './field.js';
import { useFieldContext, withFieldContext } from './FieldContext.js';
import { createGroupValues, type GroupValues } from './fieldGroupValues.js';
import { useKindField } from './kindHooks.js';
import { valueTypeOf, type FieldDefinition } from './kinds.js';
import { sameValue } from './useStoredField.js';

/** A field group's fields as one component runs them (see useFieldGroup). */
export interface FieldGroup {
  /** Each field's controls, exactly as its kind's hook returns them, in definition order: what the widgets render. */
  fields: FieldControls<any, any>[];
  /** The same controls, by field id. */
  byId: Record<string, FieldControls<any, any>>;
  /** The fields' shown values by id (after the fallback rule), as of this render: a plain object. */
  values: Readonly<Record<string, unknown>>;
  /** Whether the field with this id shows its current default; an id not in the group throws. */
  isDefault(id: string): boolean;
  /** How many of the fields do not show their defaults ("more filters (3)"). */
  changedCount: number;
  /** Every field back to its default: no field keeps a value any more. */
  resetAll(method?: UpdateMethod): void;
}

/** The values the group keeps, by field id; a field without one shows its current default. */
type Kept = Readonly<Record<string, unknown>>;

const NOTHING_KEPT: Kept = {};
const WHERE = 'Field group';

function silently(_id: string, _message: string): void {}

/** A field's kept value in `kept`, or `undefined` for none (an id such as `toString` is not Object's member). */
function keptIn(kept: Kept): (id: string) => unknown {
  return (id) => (Object.hasOwn(kept, id) ? kept[id] : undefined);
}

/** The ids and kinds of a list of definitions, in order: what has to stay the same across renders. */
function shapeOf(definitions: readonly FieldDefinition[]): string {
  return definitions.map(({ id, kind }) => `${id} (${String(kind)})`).join(', ');
}

/**
 * Whether a field shows its default, by useStoredField's rule: nothing is kept, or the kept
 * value equals the current default, or what it shows does (a kept value that falls back to it).
 */
function showsDefault(definition: FieldDefinition, kept: unknown, group: GroupValues): boolean {
  if (kept === undefined) return true;
  const { isEqual } = valueTypeOf(definition.kind);
  const fallback = group.defaultOf(definition.id);
  return isEqual(kept, fallback) || isEqual(group.valueOf(definition.id), fallback);
}

/**
 * Runs a list of field definitions together, as a group: every option function of each
 * definition (but `initialValue`) receives `ctx.values`, the fields' shown values by id, beside
 * the app's own field context, so a field's choices, bounds or visibility can follow another
 * field. A field's default is its `initialValue` (which cannot read `values`), else its kind's
 * implicit initial value from its options as they are now, so it moves with the fields those
 * read. It throws, naming the field (and the option), for an option reading an id not in the
 * group, two definitions with the same id, a mixed-boolean definition, an app context that
 * already has `values`, and fields whose values depend on each other (naming the cycle).
 *
 * The group keeps the values in its own state, as a store keeps them: a field never set, or set
 * to its current default, keeps nothing and shows its current default, which moves with the
 * fields its options read. A kept value that another field's change made invalid shows the
 * field's fallback, silently (that is how a group behaves, not bad input), and shows again once
 * it is valid again; it is never rewritten. `resetAll()` clears every kept value (the update
 * method is for a store; here it is ignored). `{ stored: true }` is not there yet: it throws.
 *
 * Each field runs its kind's hook with the definition in its outside form (the group's value and
 * writer), with the group's context as its field context, so its controls are the kind's own,
 * and a request goes through the kind's own checks before it is kept. The hooks run per field,
 * so the ids and kinds, in order, are kept from the first render: a list of another shape
 * throws (remount the component running the group, with a React `key`, to swap lists). The
 * definitions' contents may change, and new objects of the same shape on every render (inline
 * literals) are fine.
 *
 * A shown value keeps its identity while it stays the same element by element, as useStoredField's
 * does, so a list does not become a new array on every render.
 */
export function useFieldGroup(definitions: readonly FieldDefinition[], options: { stored?: boolean } = {}): FieldGroup {
  if (options.stored) throw new Error(`${WHERE}: { stored: true } is not yet supported`);
  const appCtx = useFieldContext();

  const shape = shapeOf(definitions);
  const shapeRef = useRef(shape);
  if (shape !== shapeRef.current) {
    throw new Error(`${WHERE}: the fields changed from ${shapeRef.current} to ${shape}; a group runs hooks per field, so it `
      + 'keeps the same ids and kinds, in order, across renders: to swap lists, remount the component running it with a React `key`');
  }

  const [kept, setKept] = useState<Kept>(NOTHING_KEPT);
  const resetAll = useCallback(() => setKept((state) => (Object.keys(state).length === 0 ? state : NOTHING_KEPT)), []);
  const shownRef = useRef(new Map<string, unknown>());

  const valuesUnder = (state: Kept) => createGroupValues({ definitions, appCtx, kept: keptIn(state), warn: silently });
  const group = valuesUnder(kept);

  const previous = shownRef.current;
  const shown = new Map<string, unknown>();
  for (const { id } of definitions) {
    const value = group.valueOf(id);
    shown.set(id, previous.has(id) && sameValue(previous.get(id), value) ? previous.get(id) : value);
  }
  shownRef.current = shown;

  // The default compared with is the one under the state the write applies to, so a write
  // batched after another field's (in one event) compares with the default that one gives.
  const write = ({ id, kind }: FieldDefinition) => (value: unknown) => setKept((state) => {
    if (!valueTypeOf(kind).isEqual(value, valuesUnder(state).defaultOf(id))) return { ...state, [id]: value };
    if (!Object.hasOwn(state, id)) return state;
    const { [id]: _dropped, ...rest } = state;
    return rest;
  });

  // One kind hook per definition, in order; the shape check above keeps the hooks' order.
  const fields = definitions.map((definition) => {
    const { initialValue: _default, ...outside } = definition;
    return withFieldContext(group.ctx, () => useKindField(definition, {
      ...outside, value: shown.get(definition.id), onChange: write(definition),
    }));
  });

  const changed = new Set(definitions.filter((d) => !showsDefault(d, keptIn(kept)(d.id), group)).map((d) => d.id));
  const isDefault = (id: string) => {
    if (!shown.has(id)) {
      throw new Error(`${WHERE}: no field '${id}' in the group (fields: ${definitions.map((d) => d.id).join(', ')})`);
    }
    return !changed.has(id);
  };

  return {
    fields,
    byId: Object.fromEntries(definitions.map((d, i) => [d.id, fields[i]])),
    values: Object.fromEntries(shown),
    isDefault,
    changedCount: changed.size,
    resetAll,
  };
}
