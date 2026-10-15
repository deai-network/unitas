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
