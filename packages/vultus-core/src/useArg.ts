import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { RawChange, UpdateMethod } from './argStore.js';
import { useArgStore } from './ArgStoreContext.js';
import { useFieldContext } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import type { ValueOrFn } from './types.js';
import type { ValueType } from './valueTypes.js';

/** An argument's shape (moxb's url-arg definition, without a `permanent` flag — that is a router concern). */
export interface ArgDefinition<T, Ctx = any> {
  key: string;
  valueType: ValueType<T>;
  default: ValueOrFn<T, Ctx>;
}

export interface ArgControls<T> {
  value: T;
  isDefault: boolean;
  set(value: T, method?: UpdateMethod): void;
  reset(method?: UpdateMethod): void;
  /** The href `set(value)` would produce, where the store supports it (a URL store); `undefined` otherwise. */
  hrefFor(value: T): string | undefined;
}

/** The raw value a write needs for `value`: `undefined` (removes the key) when it equals the default, else its formatted form. */
function rawFor<T>(value: T, defaultValue: T, valueType: ValueType<T>): string | undefined {
  return valueType.isEqual(value, defaultValue) ? undefined : valueType.format(value);
}

/**
 * An argument read from and written to the nearest ArgStore. An absent key reads as the default;
 * writing the default removes the key. The parsed value keeps its identity across renders while
 * the store's raw string for this key does not change, so effects keyed on it do not re-run on
 * every render; a raw value that does not parse falls back to the default and warns once per raw
 * value (both follow from caching the parse on the raw string, below).
 */
export function useArg<T>(definition: ArgDefinition<T>): ArgControls<T> {
  const { key, valueType, default: defaultOrFn } = definition;
  const store = useArgStore();
  const ctx = useFieldContext();
  const raw = useSyncExternalStore(store.subscribe, () => store.read(key));
  const defaultValue = resolveIn<T>(defaultOrFn, undefined as T, ctx, `Argument '${key}': option 'default'`);

  const cacheRef = useRef<{ raw: string; value: T } | undefined>(undefined);
  let value: T;
  if (raw === undefined) {
    value = defaultValue;
  } else if (cacheRef.current !== undefined && cacheRef.current.raw === raw) {
    value = cacheRef.current.value;
  } else {
    const parsed = valueType.parse(raw);
    if (parsed === undefined) {
      console.warn(`Argument '${key}': cannot read '${raw}', using the default`);
      value = defaultValue;
    } else {
      value = parsed;
    }
    cacheRef.current = { raw, value };
  }

  const set = useCallback(
    (next: T, method: UpdateMethod = 'replace') => {
      store.write([{ key, raw: rawFor(next, defaultValue, valueType) }], method);
    },
    [store, key, valueType, defaultValue],
  );
  const reset = useCallback(
    (method: UpdateMethod = 'replace') => {
      store.write([{ key, raw: undefined }], method);
    },
    [store, key],
  );
  const hrefFor = useCallback(
    (next: T): string | undefined => {
      if (!store.hrefFor) return undefined;
      return store.hrefFor([{ key, raw: rawFor(next, defaultValue, valueType) }]);
    },
    [store, key, valueType, defaultValue],
  );

  return { value, isDefault: valueType.isEqual(value, defaultValue), set, reset, hrefFor };
}

/** One argument's planned change in a batch (moxb's ArgChange): a new value, or a reset. */
export type ArgChange = { definition: ArgDefinition<any>; value?: unknown; reset?: true };

export function setArg<T>(definition: ArgDefinition<T>, value: T): ArgChange {
  return { definition, value };
}

export function resetArg(definition: ArgDefinition<any>): ArgChange {
  return { definition, reset: true };
}

/**
 * Applies several argument changes as one store write (one history entry: "clear all", a chip
 * that also closes a task). Each change's default is resolved at call time, from the field
 * context captured when this hook rendered.
 */
export function useArgWriter(): (changes: ArgChange[], method?: UpdateMethod) => void {
  const store = useArgStore();
  const ctx = useFieldContext();
  return useCallback(
    (changes: ArgChange[], method: UpdateMethod = 'replace') => {
      const rawChanges: RawChange[] = changes.map((change) => {
        const { key, valueType, default: defaultOrFn } = change.definition;
        if (change.reset) return { key, raw: undefined };
        const defaultValue = resolveIn(defaultOrFn, undefined, ctx, `Argument '${key}': option 'default'`);
        return { key, raw: rawFor(change.value, defaultValue, valueType) };
      });
      store.write(rawChanges, method);
    },
    [store, ctx],
  );
}
