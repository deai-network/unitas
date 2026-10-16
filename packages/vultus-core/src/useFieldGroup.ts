import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { ArgStore, UpdateMethod } from './argStore.js';
import { useArgStore } from './ArgStoreContext.js';
import type { FieldControls } from './field.js';
import { useFieldContext, withFieldContext, type FieldCtx } from './FieldContext.js';
import { createGroupValues, type GroupValues } from './fieldGroupValues.js';
import { useKindField } from './kindHooks.js';
import { valueTypeOf, type FieldDefinition } from './kinds.js';
import { rawFor } from './useArg.js';
import { sameValue } from './useStoredField.js';
import type { ValueType } from './valueTypes.js';

/** A field group's fields as one component runs them (see useFieldGroup). */
export interface FieldGroup {
  /** Each field's controls, exactly as its kind's hook returns them, in definition order: what the widgets render. */
  fields: FieldControls<any, any>[];
  /** The same controls, by field id. */
  byId: Record<string, FieldControls<any, any>>;
  /**
   * The fields' shown values by id (after the fallback rule), as of this render: a plain object,
   * which keeps its identity until a shown value changes (an effect keyed on it runs only then).
   */
  values: Readonly<Record<string, unknown>>;
  /** Whether the field with this id shows its current default; an id not in the group throws. */
  isDefault(id: string): boolean;
  /** How many of the fields do not show their defaults ("more filters (3)"). */
  changedCount: number;
  /**
   * Every field back to its default: no field keeps a value any more. Stored, one store write
   * removes every field's key (`method`, 'replace' unless told otherwise); the group's own state
   * ignores `method`.
   */
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

/** Where a group keeps its values, in the words of the error for a change of it. */
function storageOf(stored: boolean): string {
  return stored ? 'the nearest ArgStore ({ stored: true })' : "the group's own state";
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
 * A field's default under the given kept values (the state a write applies to, not necessarily
 * this render's), computed afresh and silently. A write compares with it, so a write batched
 * after another field's (in one event) compares with the default that one gives.
 */
function defaultUnder(
  definitions: readonly FieldDefinition[], appCtx: FieldCtx, kept: (id: string) => unknown, id: string,
): unknown {
  return createGroupValues({ definitions, appCtx, kept, warn: silently }).defaultOf(id);
}

/** A field's writer and link, as its kind's hook takes them (the outside form's `onChange` and `hrefFor`). */
interface Outside {
  onChange(value: unknown): void;
  hrefFor?(value: unknown): string | undefined;
}

/** Where a group keeps its values (its own state, or the nearest ArgStore), as one render sees them. */
interface Keeping {
  /** A field's kept value; `undefined` for none, so the field shows its current default. */
  kept(id: string): unknown;
  /** Where a kept value's sanitizing warnings go, with the field's id (see createGroupValues). */
  warn(id: string, message: string): void;
  /** A field's writer and link, given this render's values. */
  outside(definition: FieldDefinition, group: GroupValues): Outside;
  /** Every field back to its default (see FieldGroup). */
  resetAll(method?: UpdateMethod): void;
}

/**
 * The group's own state: the kept values by id. A write keeps the value unless it equals the
 * field's default under the state the write applies to, so a write batched after another
 * field's (in one event) compares with the default that one gives. A fallback is silent: a value
 * another field made invalid is how a group behaves, not bad input. There are no links.
 */
function useOwnState(definitions: readonly FieldDefinition[], appCtx: FieldCtx): Keeping {
  const [kept, setKept] = useState<Kept>(NOTHING_KEPT);
  const resetAll = useCallback(() => setKept((state) => (Object.keys(state).length === 0 ? state : NOTHING_KEPT)), []);

  const write = ({ id, kind }: FieldDefinition) => (value: unknown) => setKept((state) => {
    if (!valueTypeOf(kind).isEqual(value, defaultUnder(definitions, appCtx, keptIn(state), id))) return { ...state, [id]: value };
    if (!Object.hasOwn(state, id)) return state;
    const { [id]: _dropped, ...rest } = state;
    return rest;
  });

  return { kept: keptIn(kept), warn: silently, outside: (definition) => ({ onChange: write(definition) }), resetAll };
}

/** How a field's value is kept in a store; an unknown kind throws, naming the field (as argOf does). */
function valueTypeFor({ id, kind }: FieldDefinition): ValueType<any> {
  try {
    return valueTypeOf(kind);
  } catch (error) {
    throw new Error(`Field '${id}': ${(error as Error).message}`);
  }
}

/** A stored raw value as the field's value: `undefined` for an absent key, or for a raw value its kind's value type cannot read. */
function parseRaw(definition: FieldDefinition, raw: string | undefined): unknown {
  return raw === undefined ? undefined : valueTypeFor(definition).parse(raw);
}

/** A field's link, with what it was made from: kept while those stay the same, so the controls' `hrefFor` keeps its identity. */
interface Link {
  store: ArgStore;
  defaultValue: unknown;
  hrefFor(value: unknown): string | undefined;
}

/**
 * The nearest ArgStore, under each field's id, as useStoredField keeps a field there, read in one
 * subscription (as useStoredFields): its snapshot is the fields' raw values joined into one
 * string, which changes exactly when one of them does. A raw value is parsed by the kind's value
 * type; one that does not parse is no kept value, so the field shows its current default.
 *
 * A write carries the value's raw form, the key absent when the value equals the field's default
 * as the store has it at that moment: the values computed afresh, silently, from the store's
 * current raw values, which include its own writes not rendered yet (every store reads them back
 * at once). So, as in the group's own state, a write batched after another field's (in one
 * event) compares with the default that one gives. A link (the store's `hrefFor`, where it has
 * one) is the render's: its key is absent when the value equals the default as rendered, and it
 * keeps its identity while the store and that default stay the same (a tree list rebuilds its
 * rows for a new one, and asks again when a link is used).
 *
 * A raw value warns (it does not parse, or it falls back) once, as useStoredField's does: in the
 * render that first reads it, not again on a re-render, nor when another field's change makes it
 * fall back later; another raw value warns again.
 */
function useStoredValues(definitions: readonly FieldDefinition[], appCtx: FieldCtx): Keeping {
  const store = useArgStore();
  // The first render's ids: the shape check keeps them the same.
  const [ids] = useState(() => definitions.map((definition) => definition.id));
  // Called on the store, not passed detached: a store written as a class uses `this`.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const readAll = useCallback(() => JSON.stringify(ids.map((id) => store.read(id) ?? null)), [store, ids]);
  const snapshot = useSyncExternalStore(subscribe, readAll);
  const rawList = JSON.parse(snapshot) as (string | null)[];
  const raws = new Map(ids.map((id, i) => [id, rawList[i]]));

  const seenRef = useRef(new Map<string, string | null>());
  const seen = seenRef.current;
  /** The fields whose raw value this render reads first: each may warn, once. */
  const fresh = new Set(ids.filter((id) => raws.get(id) !== null && raws.get(id) !== seen.get(id)));
  seenRef.current = raws;
  const warn = (id: string, message: string) => {
    if (fresh.delete(id)) console.warn(message);
  };

  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const parsed = new Map<string, unknown>();
  const kept = (id: string) => {
    if (!parsed.has(id)) {
      const raw = raws.get(id) ?? undefined;
      const value = parseRaw(byId.get(id)!, raw);
      if (raw !== undefined && value === undefined) warn(id, `Argument '${id}': cannot read '${raw}', using the default`);
      parsed.set(id, value);
    }
    return parsed.get(id);
  };

  /** A field's default as the store has it now: under its current raw values, its own writes not rendered yet included. */
  const defaultNow = (id: string) => defaultUnder(definitions, appCtx, (key) => parseRaw(byId.get(key)!, store.read(key)), id);

  const linksRef = useRef(new Map<string, Link>());
  const outside = (definition: FieldDefinition, group: GroupValues): Outside => {
    const { id } = definition;
    const valueType = valueTypeFor(definition);
    const onChange = (value: unknown) => store.write([{ key: id, raw: rawFor(value, defaultNow(id), valueType) }], 'replace');
    if (store.hrefFor === undefined) return { onChange };
    const defaultValue = group.defaultOf(id);
    let link = linksRef.current.get(id);
    if (link === undefined || link.store !== store || !valueType.isEqual(link.defaultValue, defaultValue)) {
      link = { store, defaultValue, hrefFor: (value) => store.hrefFor?.([{ key: id, raw: rawFor(value, defaultValue, valueType) }]) };
      linksRef.current.set(id, link);
    }
    return { onChange, hrefFor: link.hrefFor };
  };

  const resetAll = useCallback(
    (method: UpdateMethod = 'replace') => store.write(ids.map((id) => ({ key: id, raw: undefined })), method),
    [store, ids],
  );

  return { kept, warn, outside, resetAll };
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
 * Storage, for the whole group, is the caller's choice. By default the group keeps the values in
 * its own state, as a store keeps them: a field never set, or set to its current default, keeps
 * nothing and shows its current default, which moves with the fields its options read. A kept
 * value that another field's change made invalid shows the field's fallback, silently (that is
 * how a group behaves, not bad input), and shows again once it is valid again; it is never
 * rewritten. `resetAll()` clears every kept value (the update method is for a store; here it is
 * ignored).
 *
 * With `{ stored: true }` the values live in the nearest ArgStore (the URL, localStorage) under
 * each field's id, as useStoredField keeps a field there, all read in one subscription: an absent
 * key reads as the field's current default, and a value equal to it is written as an absent key
 * (`'replace'`). The default compared with is the one under the store's values at the moment of
 * the write, as in the group's own state, so a write batched after another field's (in one
 * event) compares with the default that one gives. The controls' `hrefFor` links a value
 * through the store's `hrefFor` (`undefined` where the store has none), as rendered. The fallback
 * rule is the same, and the stored value is never rewritten either, but a raw value that does not
 * parse, or falls back, warns once, as useStoredField's does: an unparsable one reads as the
 * current default. `resetAll(method = 'replace')` removes every field's key in one write.
 *
 * Each field runs its kind's hook with the definition in its outside form (the group's value and
 * writer), with the group's context as its field context, so its controls are the kind's own,
 * and a request goes through the kind's own checks before it is kept. The hooks run per field,
 * so the ids and kinds, in order, are kept from the first render, and so is the storage: a list
 * of another shape, or another `stored`, throws (remount the component running the group, with a
 * React `key`, to swap lists). The definitions' contents may change, and new objects of the same
 * shape on every render (inline literals) are fine.
 *
 * A field's shown value, in `values` and as passed to its kind's hook, keeps its identity while it
 * stays equal (element by element, as useStoredField's does), so a list does not become a new array
 * on every render; the `values` object keeps its identity until a shown value changes, so an
 * effect keyed on it (one that loads data, say, and feeds the app's field context) runs only
 * then. A kind's own controls may still rebuild a composite value: range's `[from, to]` pair is
 * put in order and within bounds anew on every render.
 */
export function useFieldGroup(definitions: readonly FieldDefinition[], options: { stored?: boolean } = {}): FieldGroup {
  const stored = options.stored === true;
  const appCtx = useFieldContext();

  const shape = shapeOf(definitions);
  const firstRef = useRef({ shape, stored });
  const first = firstRef.current;
  if (stored !== first.stored) {
    throw new Error(`${WHERE}: the storage changed from ${storageOf(first.stored)} to ${storageOf(stored)}; a group runs `
      + 'other hooks for each, so it keeps its storage across renders: to switch, remount the component running it with a React `key`');
  }
  if (shape !== first.shape) {
    throw new Error(`${WHERE}: the fields changed from ${first.shape} to ${shape}; a group runs hooks per field, so it `
      + 'keeps the same ids and kinds, in order, across renders: to swap lists, remount the component running it with a React `key`');
  }

  const shownRef = useRef(new Map<string, unknown>());
  const valuesRef = useRef<Readonly<Record<string, unknown>> | undefined>(undefined);
  // The storage is the first render's (checked above), so the hooks it runs stay the same.
  const keeping = stored ? useStoredValues(definitions, appCtx) : useOwnState(definitions, appCtx);
  const group = createGroupValues({ definitions, appCtx, kept: keeping.kept, warn: keeping.warn });

  const previous = shownRef.current;
  const shown = new Map<string, unknown>();
  for (const { id } of definitions) {
    const value = group.valueOf(id);
    shown.set(id, previous.has(id) && sameValue(previous.get(id), value) ? previous.get(id) : value);
  }
  shownRef.current = shown;
  // The previous object while every shown value is the previous one (kept above while it stays
  // equal): a host's effect keyed on `values` runs when a value changes, not on every render.
  const unchanged = valuesRef.current !== undefined
    && definitions.every(({ id }) => previous.has(id) && Object.is(previous.get(id), shown.get(id)));
  const values = unchanged ? valuesRef.current! : Object.fromEntries(shown);
  valuesRef.current = values;

  // One kind hook per definition, in order; the shape check above keeps the hooks' order.
  const fields = definitions.map((definition) => {
    const { initialValue: _default, ...outside } = definition;
    const { onChange, hrefFor } = keeping.outside(definition, group);
    return withFieldContext(group.ctx, () => useKindField(definition, {
      ...outside, value: shown.get(definition.id), onChange, hrefFor,
    }));
  });

  const changed = new Set(definitions.filter((d) => !showsDefault(d, keeping.kept(d.id), group)).map((d) => d.id));
  const isDefault = (id: string) => {
    if (!shown.has(id)) {
      throw new Error(`${WHERE}: no field '${id}' in the group (fields: ${definitions.map((d) => d.id).join(', ')})`);
    }
    return !changed.has(id);
  };

  return {
    fields,
    byId: Object.fromEntries(definitions.map((d, i) => [d.id, fields[i]])),
    values,
    isDefault,
    changedCount: changed.size,
    resetAll: keeping.resetAll,
  };
}
