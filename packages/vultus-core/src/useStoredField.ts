import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import type { UpdateMethod } from './argStore.js';
import { useArgStore } from './ArgStoreContext.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { initialValueOf, sanitizeStored, valueTypeOf, type FieldDefinition } from './kinds.js';
import { useArg, type ArgDefinition } from './useArg.js';
import type { ValueType } from './valueTypes.js';

/**
 * The argument a field's value is stored as: the definition's `id` as key, its kind's value
 * type, and its initial value, resolved with the field context, as default — a value, so the
 * argument layer compares against the same default the field starts at. A mixed-boolean field
 * shows an aggregate of other data and cannot be stored: it throws, naming the field.
 */
export function argOf(definition: FieldDefinition, ctx: FieldCtx): ArgDefinition<any> {
  const { id, kind } = definition;
  let valueType: ValueType<any>;
  try {
    valueType = valueTypeOf(kind);
  } catch (error) {
    throw new Error(`Field '${id}': ${(error as Error).message}`);
  }
  return { key: id, valueType, default: initialValueOf(definition, ctx) };
}

function silently(_message: string): void {}

function warnOnConsole(message: string): void {
  console.warn(message);
}

/**
 * The same value element by element: a list in the same order, a range with the same ends, a
 * scalar. Stricter than the value types' `isEqual` (lists as sets), because the order a field
 * shows (choice order, tree order) matters to the identity kept below. Exported for the field
 * group (useFieldGroup), which keeps its values' identity by the same rule; not part of the
 * package's API.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}

/**
 * Whether a field shows its default: its stored value (parsed, or the default where absent or
 * unreadable) equals it, or fits the definition only as the default (a one-of value no longer
 * among the choices, a range clamped to bounds that are the default). `shown` is the sanitized
 * value, asked for only when the first test fails.
 */
function showsDefault(arg: ArgDefinition<any>, stored: unknown, shown: () => unknown): boolean {
  return arg.valueType.isEqual(stored, arg.default) || arg.valueType.isEqual(shown(), arg.default);
}

/**
 * A field kept in the nearest ArgStore: its options for the kind's hook, and whether it shows
 * its default. `options` follows `D` member by member, so options of a definition typed as the
 * FieldDefinition union still narrow by `kind`.
 */
export interface StoredField<D extends FieldDefinition = FieldDefinition> {
  /** The definition in its outside form, for the kind's hook (`useManyOfField(stored.options)`). */
  options: D extends any
    ? Omit<D, 'initialValue'> & { value: any; onChange(value: any): void; hrefFor(value: any): string | undefined }
    : never;
  isDefault: boolean;
  /** Removes the field's key from the store, so it shows its default again. */
  reset(method?: UpdateMethod): void;
}

/** A compile-time check: options of a FieldDefinition-typed definition narrow by `kind` (the Omit distributes over the union). */
function optionsNarrowByKind(stored: StoredField<FieldDefinition>): unknown {
  return stored.options.kind === 'manyOf' ? stored.options.choices : undefined;
}

/**
 * A field whose value lives in the nearest ArgStore (the URL, localStorage) under its `id`,
 * with its initial value as the default (see argOf). `options.value` is the stored value made
 * fit for the definition as it is now (sanitizeStored: choices, nodes and bounds follow the
 * data); `onChange` writes with `'replace'`.
 *
 * A stored value that does not fit warns once per field and raw value: not again when only the
 * definition or the field context is a new object (a provider given `value={{...}}` makes one
 * on every render). With the key absent the default is the definer's, not stored input, and is
 * sanitized silently.
 *
 * `options.value` keeps its identity while it stays the same element by element, so a list
 * does not become a new array on every render (effects keyed on it would re-run), even when
 * the field context is a new object each time. The default keeps its identity while it is
 * `isEqual` to the freshly resolved one, so `onChange` and `options` keep theirs too.
 */
export function useStoredField<D extends FieldDefinition>(definition: D): StoredField<D> {
  const store = useArgStore();
  const ctx = useFieldContext();

  const fresh = argOf(definition, ctx);
  const argRef = useRef<ArgDefinition<any> | undefined>(undefined);
  const previousArg = argRef.current;
  const arg = previousArg !== undefined && previousArg.key === fresh.key && previousArg.valueType === fresh.valueType
    && fresh.valueType.isEqual(previousArg.default, fresh.default)
    ? previousArg
    : fresh;
  argRef.current = arg;

  const { value: stored, set, reset, hrefFor } = useArg(arg);
  // Called on the store, not passed detached: a store written as a class uses `this`.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const read = useCallback(() => store.read(definition.id), [store, definition.id]);
  const raw = useSyncExternalStore(subscribe, read);

  const warnedRef = useRef<string | undefined>(undefined);
  const sanitized = useMemo(() => {
    const input = raw === undefined ? undefined : JSON.stringify([definition.id, raw]);
    const warn = input !== undefined && input !== warnedRef.current ? warnOnConsole : silently;
    warnedRef.current = input;
    return sanitizeStored(definition, stored, ctx, warn);
  }, [definition, stored, ctx, raw]);

  const previousRef = useRef<{ value: unknown } | undefined>(undefined);
  const value = previousRef.current !== undefined && sameValue(previousRef.current.value, sanitized)
    ? previousRef.current.value
    : sanitized;
  previousRef.current = { value };

  const onChange = useCallback((next: unknown) => set(next, 'replace'), [set]);
  const options = useMemo(() => {
    const { initialValue: _inside, ...rest } = definition;
    return { ...rest, value, onChange, hrefFor } as StoredField<D>['options'];
  }, [definition, value, onChange, hrefFor]);

  return { options, isDefault: showsDefault(arg, stored, () => value), reset };
}

/** Several stored fields at once: "more filters (3)" and "clear all". */
export interface StoredFields {
  /** Whether the field with this id shows its default; an id not among the fields throws. */
  isDefault(id: string): boolean;
  /** How many of the fields do not show their defaults. */
  changedCount: number;
  /** Removes every field's key in one store write (one history entry). */
  resetAll(method?: UpdateMethod): void;
}

/** A compile-time check: useStoredFields takes a `readonly` list of definitions (an `as const` module constant). */
function takesReadonlyDefinitions(definitions: readonly FieldDefinition[]): Parameters<typeof useStoredFields>[0] {
  return definitions;
}

/** One field's answer in useStoredFields, with what it was computed from. */
interface FieldReading {
  definition: FieldDefinition;
  raw: string | null;
  ctx: FieldCtx;
  isDefault: boolean;
}

/** Whether a field with this raw value shows its default, by useStoredField's rule; silent, as a summary does not warn. */
function readsAsDefault(definition: FieldDefinition, raw: string | null, ctx: FieldCtx): boolean {
  const arg = argOf(definition, ctx);
  const stored = (raw === null ? undefined : arg.valueType.parse(raw)) ?? arg.default;
  return showsDefault(arg, stored, () => sanitizeStored(definition, stored, ctx, silently));
}

/**
 * Whether stored fields show their defaults, by the same rule as useStoredField, with one store
 * subscription for all of them: its snapshot is their raw values joined into one string, which
 * changes exactly when one of them does. It is a summary, so it never warns (the fields do).
 * Each field is re-read only when its raw value, its definition or the field context changes,
 * so typing into one field does not re-read its siblings.
 */
export function useStoredFields(definitions: readonly FieldDefinition[]): StoredFields {
  const store = useArgStore();
  const ctx = useFieldContext();
  // Called on the store, not passed detached: a store written as a class uses `this`.
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const readAll = useCallback(() => JSON.stringify(definitions.map((d) => store.read(d.id) ?? null)), [store, definitions]);
  const snapshot = useSyncExternalStore(subscribe, readAll);

  const readingsRef = useRef(new Map<string, FieldReading>());
  const changed = useMemo(() => {
    const raws = JSON.parse(snapshot) as (string | null)[];
    const previous = readingsRef.current;
    const readings = new Map<string, FieldReading>();
    definitions.forEach((definition, i) => {
      const raw = raws[i];
      const before = previous.get(definition.id);
      const reading: FieldReading = before !== undefined && before.definition === definition && before.raw === raw && before.ctx === ctx
        ? before
        : { definition, raw, ctx, isDefault: readsAsDefault(definition, raw, ctx) };
      readings.set(definition.id, reading);
    });
    readingsRef.current = readings;
    return new Set([...readings.values()].filter((r) => !r.isDefault).map((r) => r.definition.id));
  }, [snapshot, definitions, ctx]);

  const isDefault = useCallback(
    (id: string) => {
      if (!definitions.some((d) => d.id === id)) throw new Error(`Field '${id}': not among the fields given to useStoredFields`);
      return !changed.has(id);
    },
    [definitions, changed],
  );
  const resetAll = useCallback(
    (method: UpdateMethod = 'replace') => {
      store.write(definitions.map((d) => ({ key: d.id, raw: undefined })), method);
    },
    [store, definitions],
  );

  return { isDefault, changedCount: changed.size, resetAll };
}
