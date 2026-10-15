import type { ArgStore } from './argStore.js';

/**
 * An ArgStore over `window.localStorage` (Praeceptor's print options), items kept under
 * `${prefix}.${key}`. Guarded for SSR/Node (`typeof window === 'undefined'`), so creating one
 * outside a browser does not crash: reads then give `undefined` and writes are no-ops. A browser
 * may block storage (a sandboxed frame, blocked site data) or refuse a write (quota), and then
 * reaching or using `localStorage` throws: a read that fails reads as absent and a write that
 * fails is skipped, with one warning per store rather than one per call.
 *
 * A write notifies this store's own subscribers; a `storage` event (another tab changed a key
 * under the prefix) notifies them too. The store listens for that event on `window` only while
 * it has subscribers, so a store that is dropped leaves no listener behind; still, create one
 * once (outside render, or in `useMemo`) rather than on every render.
 */
export function localStorageStore(prefix: string): ArgStore {
  const hasWindow = typeof window !== 'undefined';
  const listeners = new Set<() => void>();
  const storageKey = (key: string) => `${prefix}.${key}`;
  // `null` means "another tab cleared the whole storage" (localStorage.clear()): every key under
  // the prefix may have changed, so this counts as ours too.
  const isOwnStorageKey = (key: string | null) => key === null || key.startsWith(`${prefix}.`);
  const onStorage = (event: StorageEvent) => {
    if (isOwnStorageKey(event.key)) listeners.forEach((listener) => listener());
  };

  let warned = false;
  /** Runs a use of localStorage; if it throws, warns (the first time for this store) and gives `undefined`. */
  const guarded = <T>(what: string, use: (storage: Storage) => T): T | undefined => {
    try {
      return use(window.localStorage);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn(
          `localStorageStore('${prefix}'): cannot ${what} localStorage (${String(error)}); `
          + 'failing reads read as absent and failing writes are skipped, without further warnings',
        );
      }
      return undefined;
    }
  };

  return {
    read(key) {
      if (!hasWindow) return undefined;
      return guarded('read', (storage) => storage.getItem(storageKey(key))) ?? undefined;
    },
    write(changes, _method) {
      if (!hasWindow) return;
      for (const { key, raw } of changes) {
        guarded('write', (storage) => {
          if (raw === undefined) storage.removeItem(storageKey(key));
          else storage.setItem(storageKey(key), raw);
        });
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      if (hasWindow && listeners.size === 0) window.addEventListener('storage', onStorage);
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener)) return;
        if (hasWindow && listeners.size === 0) window.removeEventListener('storage', onStorage);
      };
    },
  };
}
