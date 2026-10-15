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

/**
 * The same value element by element: a list in the same order, a range with the same ends, a
 * scalar. Stricter than the value types' `isEqual` (lists as sets), because the order a field
 * shows (choice order, tree order) matters to the identity kept below.
 */
function sameValue(a: unknown, b: unknown): boolean {
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

/** A field kept in the nearest ArgStore: its options for the kind's hook, and whether it shows its default. */
export interface StoredField<D extends FieldDefinition = FieldDefinition> {
  /** The definition in its outside form, for the kind's hook (`useManyOfField(stored.options)`). */
  options: Omit<D, 'initialValue'> & { value: any; onChange(value: any): void };
  isDefault: boolean;
  /** Removes the field's key from the store, so it shows its default again. */
  reset(method?: UpdateMethod): void;
}

/**
 * A field whose value lives in the nearest ArgStore (the URL, localStorage) under its `id`,
 * with its initial value as the default (see argOf). `options.value` is the stored value made
 * fit for the definition as it is now (sanitizeStored: choices, nodes and bounds follow the
 * data); `onChange` writes with `'replace'`.
 *
 * `options.value` keeps its identity while it stays the same element by element, so a list
 * does not become a new array on every render (effects keyed on it would re-run) even when the
 * field context is a fresh object each time. Sanitizing runs again, and warns again about a
 * stored value that does not fit, only when the stored value, the definition or the field
 * context changes: a definition is data, best kept stable.
 */
export function useStoredField<D extends FieldDefinition>(definition: D): StoredField<D> {
  const ctx = useFieldContext();
  const arg = argOf(definition, ctx);
  const { value: stored, set, reset } = useArg(arg);

  const sanitized = useMemo(() => sanitizeStored(definition, stored, ctx), [definition, stored, ctx]);
  const previousRef = useRef<{ value: unknown } | undefined>(undefined);
  const value = previousRef.current !== undefined && sameValue(previousRef.current.value, sanitized)
    ? previousRef.current.value
    : sanitized;
  previousRef.current = { value };

  const onChange = useCallback((next: unknown) => set(next, 'replace'), [set]);
  const options = useMemo(() => {
    const { initialValue: _inside, ...rest } = definition;
    return { ...rest, value, onChange };
  }, [definition, value, onChange]);

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

/**
 * Whether stored fields show their defaults, by the same rule as useStoredField, with one store
 * subscription for all of them: its snapshot is their raw values joined into one string, which
 * changes exactly when one of them does. A fresh array of the same definitions (one built in
 * render) counts as unchanged, so it does not re-read every render.
 */
export function useStoredFields(definitions: FieldDefinition[]): StoredFields {
  const store = useArgStore();
  const ctx = useFieldContext();

  const definitionsRef = useRef(definitions);
  if (!sameValue(definitionsRef.current, definitions)) definitionsRef.current = definitions;
  const stable = definitionsRef.current;

  const snapshot = useSyncExternalStore(store.subscribe, () => JSON.stringify(stable.map((d) => store.read(d.id) ?? null)));

  const changed = useMemo(() => {
    const raws = JSON.parse(snapshot) as (string | null)[];
    const ids = new Set<string>();
    stable.forEach((definition, i) => {
      const arg = argOf(definition, ctx);
      const raw = raws[i];
      const stored = (raw === null ? undefined : arg.valueType.parse(raw)) ?? arg.default;
      if (!showsDefault(arg, stored, () => sanitizeStored(definition, stored, ctx))) ids.add(definition.id);
    });
    return ids;
  }, [snapshot, stable, ctx]);

  const isDefault = useCallback(
    (id: string) => {
      if (!stable.some((d) => d.id === id)) throw new Error(`Field '${id}': not among the fields given to useStoredFields`);
      return !changed.has(id);
    },
    [stable, changed],
  );
  const resetAll = useCallback(
    (method: UpdateMethod = 'replace') => {
      store.write(stable.map((d) => ({ key: d.id, raw: undefined })), method);
    },
    [store, stable],
  );

  return { isDefault, changedCount: changed.size, resetAll };
}
