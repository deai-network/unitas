import type { ArgStore } from './argStore.js';

/**
 * An ArgStore over `window.localStorage` (Praeceptor's print options), items kept under
 * `${prefix}.${key}`. Guarded for SSR/Node (`typeof window === 'undefined'`), so creating one
 * outside a browser does not crash: reads then give `undefined` and writes are no-ops. A write
 * notifies this store's own subscribers; a `storage` event (another tab changed a key under the
 * prefix) notifies them too.
 */
export function localStorageStore(prefix: string): ArgStore {
  const hasWindow = typeof window !== 'undefined';
  const listeners = new Set<() => void>();
  const storageKey = (key: string) => `${prefix}.${key}`;
  // `null` means "another tab cleared the whole storage" (localStorage.clear()): every key under
  // the prefix may have changed, so this counts as ours too.
  const isOwnStorageKey = (key: string | null) => key === null || key.startsWith(`${prefix}.`);

  if (hasWindow) {
    window.addEventListener('storage', (event) => {
      if (isOwnStorageKey(event.key)) listeners.forEach((listener) => listener());
    });
  }

  return {
    read(key) {
      if (!hasWindow) return undefined;
      return window.localStorage.getItem(storageKey(key)) ?? undefined;
    },
    write(changes, _method) {
      if (!hasWindow) return;
      for (const { key, raw } of changes) {
        if (raw === undefined) window.localStorage.removeItem(storageKey(key));
        else window.localStorage.setItem(storageKey(key), raw);
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
