import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  createHashRouter, createMemoryRouter, createPath, MemoryRouter, Route, RouterProvider, Routes, type Location,
} from 'react-router';
import {
  setArg, stringSetType, stringType, useArg, useArgWriter,
  type ArgControls, type ArgDefinition, type ArgStore,
} from 'vultus-core';
import { ReactRouterArgStore, useRouterArgStore } from '../index.js';

const rounds: ArgDefinition<string[]> = { key: 'rounds', valueType: stringSetType, default: ['final'] };
const q: ArgDefinition<string> = { key: 'q', valueType: stringType, default: 'all' };

interface Seen {
  rounds: ArgControls<string[]>;
  q: ArgControls<string>;
  write: ReturnType<typeof useArgWriter>;
  store: ArgStore;
}

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

function pathOf(location: Pick<Location, 'pathname' | 'search' | 'hash'>): string {
  return createPath(location);
}

/**
 * A memory router whose `/m` route renders the store around a probe. The probe is a static
 * element, so a location change re-renders it only through the store's notification.
 * `navigations` lists every location the router moved to, as `'PUSH /m?…'` / `'REPLACE /m?…'`.
 * A `loader` makes every navigation to `/m` wait for it (the first render does not).
 */
function setup(entries: string[], { loader }: { loader?: () => Promise<null> } = {}) {
  const seen = {} as Seen;
  function Probe() {
    seen.rounds = useArg(rounds);
    seen.q = useArg(q);
    seen.write = useArgWriter();
    seen.store = useRouterArgStore();
    return <span data-testid="value">{`${seen.rounds.value.join(',')}|${seen.q.value}`}</span>;
  }
  const router = createMemoryRouter(
    [
      { id: 'm', path: '/m', loader, element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> },
      { path: '/start', element: null },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1, hydrationData: { loaderData: { m: null } } },
  );
  const navigations: string[] = [];
  let last = router.state.location;
  const unsubscribe = router.subscribe((state) => {
    if (state.location === last) return;
    last = state.location;
    navigations.push(`${state.historyAction} ${pathOf(state.location)}`);
  });
  disposers.push(() => {
    unsubscribe();
    router.dispose();
  });
  render(<RouterProvider router={router} />);
  return { seen, router, navigations, url: () => pathOf(router.state.location) };
}

describe('ReactRouterArgStore: reading', () => {
  it('reads raw values from the location query', () => {
    const { seen } = setup(['/m?rounds=final,regional&q=x']);
    expect(seen.store.read('rounds')).toBe('final,regional');
    expect(seen.store.read('q')).toBe('x');
    expect(seen.store.read('absent')).toBeUndefined();
  });

  it('useArg over it gives the parsed value', () => {
    const { seen } = setup(['/m?rounds=regional,final&q=x']);
    expect(seen.rounds.value).toEqual(['final', 'regional']);
    expect(seen.q.value).toBe('x');
    expect(screen.getByTestId('value').textContent).toBe('final,regional|x');
  });

  it('a location change from outside (Back, a link) reaches the arguments', async () => {
    const { router } = setup(['/m?q=x']);
    await act(async () => {
      await router.navigate('/m?q=y&rounds=regional');
    });
    expect(screen.getByTestId('value').textContent).toBe('regional|y');
  });

  it('keeps one store object across location changes', async () => {
    const { seen, router } = setup(['/m?q=x']);
    const first = seen.store;
    await act(async () => {
      await router.navigate('/m?q=y');
    });
    expect(seen.store).toBe(first);
  });

  it('throws outside a router', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<ReactRouterArgStore />)).toThrow(/<Router>/);
    } finally {
      error.mockRestore();
    }
  });
});

describe('ReactRouterArgStore: writing', () => {
  it('a set navigates with replace: no new history entry', async () => {
    const { seen, router, navigations, url } = setup(['/start', '/m?rounds=final,regional&q=x']);
    await act(async () => {
      seen.q.set('y');
    });
    expect(navigations).toEqual(['REPLACE /m?rounds=final,regional&q=y']);
    expect(screen.getByTestId('value').textContent).toBe('final,regional|y');
    await act(async () => {
      await router.navigate(-1);
    });
    expect(url()).toBe('/start');
  });

  it('useArgWriter with two changes and push makes one navigation and one history entry', async () => {
    const { seen, router, navigations, url } = setup(['/start', '/m?rounds=final,regional&q=x']);
    await act(async () => {
      seen.write([setArg(rounds, ['regional']), setArg(q, 'y')], 'push');
    });
    expect(navigations).toEqual(['PUSH /m?rounds=regional&q=y']);
    await act(async () => {
      await router.navigate(-1);
    });
    expect(url()).toBe('/m?rounds=final,regional&q=x');
  });

  it('several writes in one tick, a push among replaces: one navigation, a push, path and other parameters kept', async () => {
    const { seen, router, navigations, url } = setup(['/start', '/m?keep=1&rounds=final,regional&q=x#sec']);
    await act(async () => {
      seen.q.set('y');
      seen.write([setArg(rounds, ['regional'])], 'push');
      seen.store.write([{ key: 'extra', raw: 'e' }], 'replace');
    });
    expect(navigations).toEqual(['PUSH /m?keep=1&rounds=regional&q=y&extra=e#sec']);
    await act(async () => {
      await router.navigate(-1);
    });
    expect(url()).toBe('/m?keep=1&rounds=final,regional&q=x#sec');
  });

  it('two set calls in one act land together, in one navigation', async () => {
    const { seen, navigations } = setup(['/m?rounds=final,regional&q=x']);
    await act(async () => {
      seen.rounds.set(['regional']);
      seen.q.set('y');
    });
    expect(navigations).toEqual(['REPLACE /m?rounds=regional&q=y']);
    expect(screen.getByTestId('value').textContent).toBe('regional|y');
  });

  it('a batch builds on the store\'s own last navigation, not on a location that has not rendered yet', async () => {
    const { seen, url } = setup(['/m?rounds=final,regional&q=x']);
    await act(async () => {
      seen.q.set('y');
      await Promise.resolve();
      await Promise.resolve();
      // The first batch has navigated; React has not rendered the new location inside act.
      expect(seen.store.read('q')).toBe('x');
      seen.rounds.set(['regional']);
    });
    expect(url()).toBe('/m?rounds=regional&q=y');
  });

  it('a batch builds on the store\'s own navigation while that navigation is still loading', async () => {
    let finishLoading = () => {};
    const loader = () => new Promise<null>((resolve) => {
      finishLoading = () => resolve(null);
    });
    const { seen, router, url } = setup(['/m?rounds=final,regional&q=x'], { loader });
    await act(async () => {
      seen.q.set('y');
    });
    // The router stays where it was until the loader is done.
    expect(url()).toBe('/m?rounds=final,regional&q=x');
    expect(router.state.navigation.state).toBe('loading');
    await act(async () => {
      seen.rounds.set(['regional']);
    });
    await act(async () => {
      finishLoading();
    });
    expect(url()).toBe('/m?rounds=regional&q=y');
    expect(screen.getByTestId('value').textContent).toBe('regional|y');
  });

  it('after Back, a batch builds on the location Back went to, not on the store\'s earlier navigation', async () => {
    const { seen, router, url } = setup(['/m?q=x']);
    await act(async () => {
      seen.q.set('y', 'push');
    });
    await act(async () => {
      await router.navigate(-1);
    });
    expect(url()).toBe('/m?q=x');
    await act(async () => {
      seen.rounds.set(['regional']);
    });
    expect(url()).toBe('/m?q=x&rounds=regional');
  });

  it('a batch builds on a navigation from outside in the same tick, not on the rendered location', async () => {
    const { seen, router, url } = setup(['/m?rounds=final,regional&q=x']);
    await act(async () => {
      void router.navigate('/m?q=z&k=1');
      seen.rounds.set(['regional']);
    });
    expect(url()).toBe('/m?q=z&k=1&rounds=regional');
  });

  it('keeps the path, the hash and the other parameters in their order', async () => {
    const { seen, url } = setup(['/m?a=1&q=x&b=2&a=3#sec']);
    await act(async () => {
      seen.q.set('y');
    });
    expect(url()).toBe('/m?a=1&q=y&b=2&a=3#sec');
  });

  it('an empty raw value keeps the key: ?rounds=', async () => {
    const { seen, router } = setup(['/m']);
    await act(async () => {
      seen.rounds.set([]);
    });
    expect(router.state.location.search).toBe('?rounds=');
    expect(seen.rounds.value).toEqual([]);
  });

  it('removing the last key leaves no ?', async () => {
    const { seen, router, url } = setup(['/m?rounds=regional']);
    await act(async () => {
      seen.rounds.reset();
    });
    expect(router.state.location.search).toBe('');
    expect(url()).toBe('/m');
  });

  it('commas stay literal in location.search', async () => {
    const { seen, router } = setup(['/m']);
    await act(async () => {
      seen.rounds.set(['a', 'b', 'c']);
    });
    expect(router.state.location.search).toBe('?rounds=a,b,c');
  });

  it('a write that changes nothing does not navigate', async () => {
    const { seen, navigations } = setup(['/m?q=x']);
    await act(async () => {
      seen.q.set('x');
      seen.store.write([], 'push');
    });
    expect(navigations).toEqual([]);
  });
});

describe('ReactRouterArgStore: hrefFor', () => {
  it('gives the current path with the changed query', () => {
    const { seen } = setup(['/m?rounds=final,regional&q=x#sec']);
    expect(seen.q.hrefFor('y')).toBe('/m?rounds=final,regional&q=y#sec');
    expect(seen.store.hrefFor?.([{ key: 'rounds', raw: undefined }, { key: 'n', raw: 'a b' }])).toBe('/m?q=x&n=a%20b#sec');
  });
});

describe('ReactRouterArgStore with a basename', () => {
  it('reads, writes and links within the basename', async () => {
    let store = undefined as unknown as ArgStore;
    function Probe() {
      store = useRouterArgStore();
      return null;
    }
    const router = createMemoryRouter(
      [{ path: '/m', element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }],
      { basename: '/app', initialEntries: ['/app/m?q=x'] },
    );
    disposers.push(() => router.dispose());
    render(<RouterProvider router={router} />);

    expect(store.read('q')).toBe('x');
    expect(store.hrefFor?.([{ key: 'q', raw: 'y' }])).toBe('/app/m?q=y');
    await act(async () => {
      store.write([{ key: 'q', raw: 'y' }], 'replace');
    });
    expect(pathOf(router.state.location)).toBe('/app/m?q=y');
    await act(async () => {
      store.write([{ key: 'n', raw: '1' }], 'replace');
    });
    expect(pathOf(router.state.location)).toBe('/app/m?q=y&n=1');
  });
});

describe('ReactRouterArgStore under a declarative <MemoryRouter>', () => {
  it('reads and writes the location, several writes in one navigation', async () => {
    const seen = {} as Seen;
    function Probe() {
      seen.rounds = useArg(rounds);
      seen.q = useArg(q);
      seen.store = useRouterArgStore();
      return <span data-testid="value">{`${seen.rounds.value.join(',')}|${seen.q.value}`}</span>;
    }
    render(
      <MemoryRouter initialEntries={['/m?q=x#sec']}>
        <ReactRouterArgStore>
          <Routes>
            <Route path="/m" element={<Probe />} />
          </Routes>
        </ReactRouterArgStore>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value').textContent).toBe('final|x');
    await act(async () => {
      seen.q.set('y');
      seen.rounds.set(['a', 'b']);
    });
    expect(screen.getByTestId('value').textContent).toBe('a,b|y');
    expect(seen.q.hrefFor('z')).toBe('/m?q=z&rounds=a,b#sec');
  });
});

describe('ReactRouterArgStore under a hash router', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/m?x=0');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reads the query inside the hash, writes it back there, and hrefFor gives a hash link', async () => {
    let store = undefined as unknown as ArgStore;
    function Probe() {
      store = useRouterArgStore();
      return null;
    }
    const router = createHashRouter([{ path: '/m', element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }]);
    disposers.push(() => router.dispose());
    render(<RouterProvider router={router} />);

    expect(store.read('x')).toBe('0');
    expect(store.hrefFor?.([{ key: 'x', raw: '1' }])).toBe('#/m?x=1');

    await act(async () => {
      store.write([{ key: 'x', raw: '2' }, { key: 'list', raw: 'a,b' }], 'replace');
    });
    expect(window.location.hash).toBe('#/m?x=2&list=a,b');
    expect(store.read('x')).toBe('2');
  });
});
