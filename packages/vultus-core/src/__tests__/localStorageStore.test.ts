import { describe, it, expect, vi, beforeEach } from 'vitest';
import { localStorageStore } from '../localStorageStore.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('localStorageStore', () => {
  it('writes and reads under the prefix', () => {
    const store = localStorageStore('p');
    store.write([{ key: 'x', raw: 'v' }], 'replace');
    expect(window.localStorage.getItem('p.x')).toBe('v');
    expect(store.read('x')).toBe('v');
  });

  it('removes the item when the raw value is undefined', () => {
    const store = localStorageStore('p');
    store.write([{ key: 'x', raw: 'v' }], 'replace');
    store.write([{ key: 'x', raw: undefined }], 'replace');
    expect(window.localStorage.getItem('p.x')).toBe(null);
    expect(store.read('x')).toBe(undefined);
  });

  it('notifies a subscriber on write', () => {
    const store = localStorageStore('p');
    const listener = vi.fn();
    store.subscribe(listener);
    store.write([{ key: 'x', raw: 'v' }], 'replace');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies a subscriber on a storage event for a key under the prefix, not for another prefix', () => {
    const store = localStorageStore('p');
    const listener = vi.fn();
    store.subscribe(listener);

    window.dispatchEvent(new StorageEvent('storage', { key: 'p.x' }));
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();
    window.dispatchEvent(new StorageEvent('storage', { key: 'other.x' }));
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies a subscriber on a storage event with key null (another tab cleared the whole storage)', () => {
    const store = localStorageStore('p');
    const listener = vi.fn();
    store.subscribe(listener);

    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('listens for storage events only while subscribed: stores created and unsubscribed leave no listeners', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const storageCalls = (spy: typeof add | typeof remove) => spy.mock.calls.filter(([type]) => type === 'storage');
      const stores = Array.from({ length: 5 }, (_, i) => localStorageStore(`p${i}`));
      expect(storageCalls(add)).toHaveLength(0);

      const unsubscribes = stores.flatMap((store) => [store.subscribe(() => {}), store.subscribe(() => {})]);
      expect(storageCalls(add)).toHaveLength(5);
      unsubscribes.forEach((unsubscribe) => unsubscribe());

      expect(storageCalls(remove)).toHaveLength(5);
      expect(storageCalls(remove).map(([, handler]) => handler)).toEqual(storageCalls(add).map(([, handler]) => handler));
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it('subscribing again after the last subscriber left listens for storage events again', () => {
    const store = localStorageStore('p');
    store.subscribe(() => {})();
    const listener = vi.fn();
    store.subscribe(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'p.x' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('when reaching localStorage throws (storage blocked), reads give undefined and writes are no-ops, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    try {
      const store = localStorageStore('p');
      const listener = vi.fn();
      store.subscribe(listener);
      expect(store.read('x')).toBe(undefined);
      expect(() => store.write([{ key: 'x', raw: 'v' }, { key: 'y', raw: undefined }], 'replace')).not.toThrow();
      expect(store.read('x')).toBe(undefined);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      blocked.mockRestore();
      warn.mockRestore();
    }
  });

  it('when localStorage\'s methods throw, reads give undefined and writes are no-ops, warning once per store', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fail = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    const broken = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(
      { getItem: fail, setItem: fail, removeItem: fail } as unknown as Storage,
    );
    try {
      const store = localStorageStore('p');
      expect(store.read('x')).toBe(undefined);
      store.write([{ key: 'x', raw: 'v' }], 'replace');
      store.write([{ key: 'x', raw: undefined }], 'replace');
      expect(store.read('x')).toBe(undefined);
      expect(warn).toHaveBeenCalledTimes(1);

      localStorageStore('q').read('x');
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      broken.mockRestore();
      warn.mockRestore();
    }
  });

  it('does not crash outside a browser: reads give undefined, writes are no-ops', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error -- simulating SSR/Node, where `window` does not exist.
    delete globalThis.window;
    try {
      const store = localStorageStore('p');
      expect(store.read('x')).toBe(undefined);
      expect(() => store.write([{ key: 'x', raw: 'v' }], 'replace')).not.toThrow();
      expect(store.read('x')).toBe(undefined);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
