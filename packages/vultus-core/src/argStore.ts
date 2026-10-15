/** Whether a write pushes a new history entry or replaces the current one; a store without history ignores it. */
export type UpdateMethod = 'push' | 'replace';

/** One key's new raw value, or `undefined` to remove it (the key reads back as its default). */
export interface RawChange {
  key: string;
  raw: string | undefined;
}

/**
 * A store for argument values kept as strings (moxb's url-arg backends, batched): a URL query,
 * localStorage, or (here) memory. `read` and `write` move raw strings only — parsing, defaults
 * and equality live in the value type and in useArg, not here. The hooks call its methods on
 * the store, never detached, so a store may be a class whose methods use `this`.
 */
export interface ArgStore {
  read(key: string): string | undefined;
  /** Applies every change, then notifies subscribers once — several keys changed together are one history entry. */
  write(changes: RawChange[], method: UpdateMethod): void;
  subscribe(listener: () => void): () => void;
  /** The href a write of `changes` would produce, where the store has one (a URL store); omitted otherwise. */
  hrefFor?(changes: RawChange[]): string;
}

/** An ArgStore over a plain object, for tests and demos. `snapshot()` is a copy, for assertions. */
export function memoryStore(initial: Record<string, string> = {}): ArgStore & { snapshot(): Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  const listeners = new Set<() => void>();

  return {
    read(key) {
      return data[key];
    },
    write(changes, _method) {
      for (const { key, raw } of changes) {
        if (raw === undefined) delete data[key];
        else data[key] = raw;
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot() {
      return { ...data };
    },
  };
}
