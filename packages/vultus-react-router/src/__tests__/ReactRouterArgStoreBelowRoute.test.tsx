import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest';
import { act, render } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import {
  createBrowserRouter, createHashRouter, createMemoryRouter, generatePath, MemoryRouter, parsePath, RouterProvider,
  type LoaderFunction, type Path, type RouteObject,
} from 'react-router';
import { stringType, useArg, type ArgDefinition, type ArgStore, type RawChange } from 'vultus-core';
import {
  ReactRouterArgStore, rest, useRouterArgStore, vanishing,
  type BelowRoute, type OneOfDefinition, type RouterArgStore,
} from '../index.js';

function arg(key: string, permanent?: boolean): ArgDefinition<string> {
  return { key, valueType: stringType, default: '', permanent };
}

const VARIANT: OneOfDefinition = { kind: 'oneOf', id: 'variant', choices: [{ value: 'plain' }, { value: 'modern' }, { value: 'old' }] };
const TASK = arg('task');
const AT = arg('at');
/** The probe's hooks declare these two: a filter that goes with the place, and one that stays. */
const TOC = arg('toc');
const LENS = arg('lens', true);
/** The store's route, and its tokens: a variant that vanishes, then the task. */
const PATTERN = ':lang/:module/*';
const PATH = [vanishing(VARIANT), rest(TASK)];

interface Seen {
  store: RouterArgStore;
  values: Record<string, string | undefined>;
}

let seen: Seen;
let warn: MockInstance<typeof console.warn>;
const disposers: (() => void)[] = [];

beforeEach(() => {
  seen = { values: {} } as Seen;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  warn.mockRestore();
  window.history.replaceState(null, '', '/');
});

function useRaw(store: ArgStore, key: string): string | undefined {
  return useSyncExternalStore((listener) => store.subscribe(listener), () => store.read(key));
}

/** Declares `toc` (not permanent) and `lens` (permanent), and reads the keys through the store. */
function Probe() {
  const store = useRouterArgStore();
  useArg(TOC);
  useArg(LENS);
  seen.store = store;
  seen.values = {
    variant: useRaw(store, 'variant'),
    task: useRaw(store, 'task'),
    at: useRaw(store, 'at'),
    toc: useRaw(store, 'toc'),
    lens: useRaw(store, 'lens'),
    link: useRaw(store, 'link'),
    q: useRaw(store, 'q'),
  };
  return null;
}

function changesOf(changes: Record<string, string | undefined>): RawChange[] {
  return Object.entries(changes).map(([key, raw]) => ({ key, raw }));
}

function write(changes: Record<string, string | undefined>) {
  seen.store.write(changesOf(changes), 'replace');
}

type RouterKind = 'memory' | 'browser' | 'hash';

function makeRouter(kind: RouterKind, entry: string, tree: RouteObject[], basename?: string) {
  const options = { basename, hydrationData: { loaderData: { page: null } } };
  const router = kind === 'memory'
    ? createMemoryRouter(tree, { ...options, initialEntries: [entry] })
    : kind === 'browser'
      ? (window.history.replaceState(null, '', entry), createBrowserRouter(tree, options))
      : (window.history.replaceState(null, '', `/#${entry}`), createHashRouter(tree, options));
  disposers.push(() => router.dispose());
  return router;
}

/** The store in its route (`:lang/:module/*`) around the probe, beside a `/start` route. */
function setup(entry: string, { kind = 'memory' as RouterKind, basename, loader }: { kind?: RouterKind; basename?: string; loader?: LoaderFunction } = {}) {
  const router = makeRouter(kind, entry, [
    { id: 'page', path: PATTERN, loader, element: <ReactRouterArgStore path={PATH} fragment={AT}><Probe /></ReactRouterArgStore> },
    { path: 'start', element: null },
  ], basename);
  render(<RouterProvider router={router} />);
  return router;
}

/**
 * What `belowRoute` should give for `href`: past the basename's `skip` segments and the route's two,
 * its path as it holds it (a doubled or trailing `/` kept), its query and hash.
 */
function cutOf(href: string, skip = 0): BelowRoute {
  const { pathname = '', search = '', hash = '' } = parsePath(href);
  let rest = pathname;
  for (let i = 0; i < skip + 2; i += 1) rest = rest.replace(/^\/*[^/]+/, '');
  return { pathname: rest.replace(/^\/+/, ''), search, hash };
}

/** Leaves the route, then opens `saved` again with react-router's `generatePath`, as an app's gallery would. */
async function reopen(router: ReturnType<typeof makeRouter>, module: string, saved: BelowRoute) {
  await act(async () => {
    await router.navigate('/start');
  });
  const pathname = generatePath(`/${PATTERN}`, { lang: 'hu', module, '*': saved.pathname });
  await act(async () => {
    await router.navigate({ pathname, search: saved.search, hash: saved.hash });
  });
  return pathname;
}

/** `belowRoute(undefined, changes)` and the cut of `hrefFor(changes)`, which must be one. */
function bothViews(changes: Record<string, string | undefined> = {}) {
  return {
    below: seen.store.belowRoute(undefined, changesOf(changes)),
    href: cutOf(seen.store.hrefFor!(changesOf(changes))),
  };
}

/** A loader that holds every call until `open()`, and answers every call after it at once. */
function gate() {
  const held: (() => void)[] = [];
  let opened = false;
  const loader: LoaderFunction = () => {
    if (opened) return null;
    return new Promise<null>((resolve) => {
      held.push(() => resolve(null));
    });
  };
  const open = () => {
    opened = true;
    held.splice(0).forEach((release) => release());
  };
  return { loader, open };
}

const idle = (router: { state: { navigation: { state: string } } }) =>
  act(() => vi.waitFor(() => expect(router.state.navigation.state).toBe('idle')));

/** Lets microtasks run until `done`, before React renders; bounded, so it fails a test instead of hanging it. */
async function microtasksUntil(done: () => boolean) {
  for (let i = 0; i < 1000 && !done(); i += 1) await Promise.resolve();
}

function expectWarningAbout(key: string) {
  const messages = warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes(`'${key}'`));
  expect(messages).not.toEqual([]);
}

describe.each(['memory', 'browser'] as const)('belowRoute under a %s router', (kind) => {
  describe('without a location: the part below the route of what hrefFor gives', () => {
    const OPENED = '/hu/mod/modern/s19?toc=a&lens=b#12.4';

    it.each([
      ['no changes', {}, { pathname: 'modern/s19', search: '?toc=a&lens=b', hash: '#12.4' }],
      ['a query key', { q: 'x' }, { pathname: 'modern/s19', search: '?toc=a&lens=b&q=x', hash: '#12.4' }],
      ['a query key removed', { toc: undefined }, { pathname: 'modern/s19', search: '?lens=b', hash: '#12.4' }],
      ['the fragment', { at: '3' }, { pathname: 'modern/s19', search: '?toc=a&lens=b', hash: '#3' }],
      ['a token that goes somewhere else', { variant: 'old' }, { pathname: 'old', search: '?lens=b', hash: '' }],
      ['a token and a filter named with it', { task: 's20', toc: 'z' }, { pathname: 'modern/s20', search: '?toc=z&lens=b', hash: '' }],
    ])('%s', (_name, changes, expected) => {
      setup(OPENED, { kind });
      const { below, href } = bothViews(changes);
      expect(below).toEqual(expected);
      expect(below).toEqual(href);
    });

    it.each([
      ['no changes', {}, { pathname: 'modern/s19/', search: '', hash: '' }],
      ['a query key', { q: 'x' }, { pathname: 'modern/s19/', search: '?q=x', hash: '' }],
    ])('a typed trailing slash: kept by both, %s', (_name, changes, expected) => {
      setup('/hu/mod/modern/s19/', { kind });
      const { below, href } = bothViews(changes);
      expect(below).toEqual(expected);
      expect(below).toEqual(href);
    });

    it('without arguments at all: the same as no changes', () => {
      setup(OPENED, { kind });
      expect(seen.store.belowRoute()).toEqual({ pathname: 'modern/s19', search: '?toc=a&lens=b', hash: '#12.4' });
    });

    it('a change that cannot be represented: left out with a warning, as hrefFor leaves it out', () => {
      setup(OPENED, { kind });
      const { below, href } = bothViews({ task: '..' });
      expect(below).toEqual({ pathname: 'modern/s19', search: '?toc=a&lens=b', hash: '#12.4' });
      expect(below).toEqual(href);
      expectWarningAbout('task');
    });

    it('with the store\'s own writes before they navigate', async () => {
      setup(OPENED, { kind });
      await act(async () => {
        write({ task: 's20' });
        const { below, href } = bothViews();
        expect(below).toEqual({ pathname: 'modern/s20', search: '?lens=b', hash: '' });
        expect(below).toEqual(href);
        expect(bothViews({ at: '1' }).below).toEqual(bothViews({ at: '1' }).href);
      });
    });

    it('while the store\'s navigation is in flight on a loader, and after it renders', async () => {
      const { loader, open } = gate();
      const router = setup(OPENED, { kind, loader });
      await act(async () => write({ task: 's20' }));
      expect(router.state.navigation.state).toBe('loading');
      expect(seen.store.readRendered('task')).toBe('s19');
      const { below, href } = bothViews();
      expect(below).toEqual({ pathname: 'modern/s20', search: '?lens=b', hash: '' });
      expect(below).toEqual(href);
      expect(bothViews({ variant: 'old' }).below).toEqual(bothViews({ variant: 'old' }).href);
      await act(async () => open());
      await idle(router);
      expect(seen.store.readRendered('task')).toBe('s20');
      expect(seen.store.belowRoute()).toEqual({ pathname: 'modern/s20', search: '?lens=b', hash: '' });
    });
  });

  describe('with a location', () => {
    it('the router\'s location before it renders', async () => {
      const router = setup('/hu/mod/s19?toc=a', { kind });
      await act(async () => {
        void router.navigate('/en/masik/old/x/y?toc=c&q=1#9');
        await microtasksUntil(() => router.state.location.pathname === '/en/masik/old/x/y');
        expect(seen.store.readRendered('task')).toBe('s19');
        expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: 'old/x/y', search: '?toc=c&q=1', hash: '#9' });
        expect(seen.store.belowRoute(router.state.location, changesOf({ toc: undefined }))).toEqual({ pathname: 'old/x/y', search: '?q=1', hash: '#9' });
      });
    });

    it('the store\'s own pending writes do not count there', async () => {
      const router = setup('/hu/mod/modern/s19?toc=a#12.4', { kind });
      await act(async () => {
        write({ task: 's20', q: 'x' });
        expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: 'modern/s19', search: '?toc=a', hash: '#12.4' });
        expect(seen.store.belowRoute(router.state.location, changesOf({ at: '1' }))).toEqual({ pathname: 'modern/s19', search: '?toc=a', hash: '#1' });
      });
    });

    it('without changes, exactly as it holds it: a typed query, an escape, a trailing slash', () => {
      const router = setup('/hu/mod/s19/?a=b+c&x=%7e#a%20b', { kind });
      const held = { pathname: 's19/', search: '?a=b+c&x=%7e', hash: '#a%20b' };
      expect(seen.store.belowRoute(router.state.location)).toEqual(held);
      expect(seen.store.belowRoute(router.state.location, [])).toEqual(held);
    });

    describe('changes apply on top of it as hrefFor applies them on top of the store\'s view', () => {
      // Not where the store is: the expansion reads this location's tokens and query.
      const ELSEWHERE: Path = { pathname: '/en/masik/modern/s30', search: '?toc=a&lens=b&a=b+c', hash: '#12.4' };

      it.each([
        ['a query key: the query spelled as a write spells it', { q: 'x' }, { pathname: 'modern/s30', search: '?toc=a&lens=b&a=b%20c&q=x', hash: '#12.4' }],
        ['query keys removed, one of them absent', { toc: undefined, link: undefined }, { pathname: 'modern/s30', search: '?lens=b&a=b%20c', hash: '#12.4' }],
        ['the fragment: the query as typed', { at: '3' }, { pathname: 'modern/s30', search: '?toc=a&lens=b&a=b+c', hash: '#3' }],
        ['a token that goes somewhere else: the later token, the declared filter and the fragment go, the permanent filter stays', { variant: 'old' }, { pathname: 'old', search: '?lens=b&a=b%20c', hash: '' }],
        ['the last token: the variant it reads there stays', { task: 's31' }, { pathname: 'modern/s31', search: '?lens=b&a=b%20c', hash: '' }],
        ['a task named like a variant, after the variant it holds', { task: 'old' }, { pathname: 'modern/old', search: '?lens=b&a=b%20c', hash: '' }],
      ])('%s', (_name, changes, expected) => {
        setup('/hu/mod/s19', { kind });
        expect(seen.store.belowRoute(ELSEWHERE, changesOf(changes))).toEqual(expected);
        expect(warn).not.toHaveBeenCalled();
      });

      it('a refusal warns and gives it unchanged', () => {
        setup('/hu/mod/s19', { kind });
        expect(seen.store.belowRoute(ELSEWHERE, changesOf({ task: '..', q: 'x' }))).toEqual({ pathname: 'modern/s30', search: '?toc=a&lens=b&a=b+c', hash: '#12.4' });
        expectWarningAbout('task');
        warn.mockClear();
        expect(seen.store.belowRoute(ELSEWHERE, changesOf({ variant: 'nope' }))).toEqual({ pathname: 'modern/s30', search: '?toc=a&lens=b&a=b+c', hash: '#12.4' });
        expectWarningAbout('variant');
      });

      it('what is refused depends on that location: there the store\'s view would refuse a task named like a variant', () => {
        setup('/hu/mod/s19', { kind });
        expect(seen.store.belowRoute(undefined, changesOf({ task: 'old' }))).toEqual({ pathname: 's19', search: '', hash: '' });
        expectWarningAbout('task');
      });
    });

    it('too short to hold the route: undefined; at the route\'s base: an empty pathname', () => {
      setup('/hu/mod/s19', { kind });
      const { store } = seen;
      expect(store.belowRoute({ pathname: '/hu', search: '?x=1', hash: '' })).toBeUndefined();
      expect(store.belowRoute({ pathname: '/', search: '', hash: '' })).toBeUndefined();
      expect(store.belowRoute({ pathname: '/hu', search: '', hash: '' }, changesOf({ task: 's20' }))).toBeUndefined();
      expect(store.belowRoute({ pathname: '/hu/mod', search: '?x=1', hash: '#2' })).toEqual({ pathname: '', search: '?x=1', hash: '#2' });
      expect(store.belowRoute({ pathname: '/hu/mod', search: '', hash: '' }, changesOf({ task: 's20' }))).toEqual({ pathname: 's20', search: '', hash: '' });
      expect(warn).not.toHaveBeenCalled();
    });

    it('under a basename: as the router holds it, the basename included; outside it, undefined', async () => {
      const router = setup('/app/hu/mod/s19?x=1#2', { kind, basename: '/app' });
      const { store } = seen;
      expect(router.state.location.pathname).toBe('/app/hu/mod/s19');
      expect(store.belowRoute(router.state.location)).toEqual({ pathname: 's19', search: '?x=1', hash: '#2' });
      expect(store.belowRoute(router.state.location, changesOf({ task: 's20' }))).toEqual({ pathname: 's20', search: '?x=1', hash: '' });
      expect(store.belowRoute({ pathname: '/app', search: '', hash: '' })).toBeUndefined();
      expect(store.belowRoute({ pathname: '/other/hu/mod/s19', search: '', hash: '' })).toBeUndefined();
      expect(store.belowRoute()).toEqual({ pathname: 's19', search: '?x=1', hash: '#2' });
      expect(store.belowRoute()).toEqual(cutOf(store.hrefFor!([]), 1));
      expect(store.belowRoute(undefined, changesOf({ variant: 'old' }))).toEqual(cutOf(store.hrefFor!(changesOf({ variant: 'old' })), 1));
    });

    it('accents, as the location holds them', () => {
      const router = setup('/hu/egyh%C3%A1z/t%C3%B6rt?q=%C3%A1#%C3%A9', { kind });
      expect(seen.values).toMatchObject({ task: 'tört', q: 'á', at: 'é' });
      expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: 't%C3%B6rt', search: '?q=%C3%A1', hash: '#%C3%A9' });
      expect(seen.store.belowRoute(router.state.location, changesOf({ task: 'tört2' }))).toEqual({ pathname: 't%C3%B6rt2', search: '?q=%C3%A1', hash: '' });
      expect(seen.store.belowRoute(router.state.location, changesOf({ at: 'ő' }))).toEqual({ pathname: 't%C3%B6rt', search: '?q=%C3%A1', hash: '#%C5%91' });
      expect(bothViews({ task: 'tört2' }).below).toEqual(bothViews({ task: 'tört2' }).href);
      if (kind === 'browser') expect(window.location.pathname).toBe('/hu/egyh%C3%A1z/t%C3%B6rt');
    });
  });

  describe('a round trip: saved, rebuilt with react-router\'s generatePath, opened again', () => {
    const OPENED = '/hu/egyh%C3%A1z/modern/a%20b@c/d?toc=s19&lens=big&link=x#12.4';
    const READ = { variant: 'modern', task: 'a b@c/d', toc: 's19', lens: 'big', at: '12.4' };

    it('from the router\'s location, leaving a key out', async () => {
      const router = setup(OPENED, { kind });
      expect(seen.values).toMatchObject({ ...READ, link: 'x' });
      const saved = seen.store.belowRoute(router.state.location, changesOf({ link: undefined }))!;
      expect(saved).toEqual({ pathname: 'modern/a%20b@c/d', search: '?toc=s19&lens=big', hash: '#12.4' });
      expect(await reopen(router, 'egyház', saved)).toBe('/hu/egyh%C3%A1z/modern/a%20b@c/d');
      expect(seen.values).toMatchObject({ ...READ, link: undefined });
    });

    it('from the store\'s view, with a write of its own not yet shown', async () => {
      const router = setup('/hu/egyh%C3%A1z/s19?link=x', { kind });
      let saved!: BelowRoute;
      await act(async () => {
        seen.store.write(changesOf({ variant: 'modern', task: 'a b@c/d', toc: 's19', lens: 'big', at: '12.4' }), 'replace');
        saved = seen.store.belowRoute(undefined, changesOf({ link: undefined }))!;
      });
      expect(await reopen(router, 'egyház', saved)).toBe('/hu/egyh%C3%A1z/modern/a%20b@c/d');
      expect(seen.values).toMatchObject({ ...READ, link: undefined });
    });
  });
});

describe('belowRoute under a memory router only', () => {
  it('a path typed raw stays raw: nothing is re-encoded', () => {
    const router = setup('/hu/egyház/tört a@b?q=á');
    expect(seen.values.task).toBe('tört a@b');
    expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: 'tört a@b', search: '?q=á', hash: '' });
  });
});

describe('an address typed with // or a dot segment: belowRoute gives it raw, react-router normalizes it', () => {
  it('a doubled /: hrefFor collapses it, belowRoute keeps it, and reopened it lands collapsed, reading the same', async () => {
    const router = setup('/hu/mod/c//d');
    expect(seen.values.task).toBe('c/d');
    expect(seen.store.hrefFor!([])).toBe('/hu/mod/c/d');
    expect(seen.store.belowRoute()).toEqual({ pathname: 'c//d', search: '', hash: '' });
    const saved = seen.store.belowRoute(router.state.location)!;
    expect(saved).toEqual({ pathname: 'c//d', search: '', hash: '' });
    expect(await reopen(router, 'mod', saved)).toBe('/hu/mod/c//d');
    expect(router.state.location.pathname).toBe('/hu/mod/c/d');
    expect(seen.values.task).toBe('c/d');
  });

  it('a . segment: hrefFor resolves it, belowRoute keeps it, and reopened it lands resolved, reading another value', async () => {
    const router = setup('/hu/mod/./c');
    expect(seen.values.task).toBe('./c');
    expect(seen.store.hrefFor!([])).toBe('/hu/mod/c');
    expect(seen.store.belowRoute()).toEqual({ pathname: './c', search: '', hash: '' });
    const saved = seen.store.belowRoute(router.state.location)!;
    expect(saved.pathname).toBe('./c');
    await reopen(router, 'mod', saved);
    expect(router.state.location.pathname).toBe('/hu/mod/c');
    expect(seen.values.task).toBe('c');
  });

  it('a .. segment: the same, one segment up', () => {
    setup('/hu/mod/a/../c');
    expect(seen.values.task).toBe('a/../c');
    expect(seen.store.hrefFor!([])).toBe('/hu/mod/c');
    expect(seen.store.belowRoute()).toEqual({ pathname: 'a/../c', search: '', hash: '' });
  });

  it('a token change rebuilds the path below the route, and the two agree again', () => {
    setup('/hu/mod/./c');
    const { below, href } = bothViews({ task: 's20' });
    expect(below).toEqual({ pathname: 's20', search: '', hash: '' });
    expect(below).toEqual(href);
  });

  it('under a hash router, a typed %2E reads as a dot segment and is saved as typed; reopened, the URL parser resolves it', async () => {
    const router = setup('/hu/mod/%2E/c', { kind: 'hash' });
    expect(seen.values.task).toBe('./c');
    expect(seen.store.hrefFor!([])).toBe('#/hu/mod/%2E/c');
    const saved = seen.store.belowRoute(router.state.location)!;
    expect(saved.pathname).toBe('%2E/c');
    expect(await reopen(router, 'mod', saved)).toBe('/hu/mod/%2E/c');
    expect(router.state.location.pathname).toBe('/hu/mod/c');
    expect(seen.values.task).toBe('c');
  });
});

describe('belowRoute in a store without `path`', () => {
  it('in a route that ends in no *: nothing below it, and the query and fragment', async () => {
    const router = makeRouter('memory', '/m/1?q=a+b#h', [{ path: '/m/:id', element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }]);
    render(<RouterProvider router={router} />);
    expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: '', search: '?q=a+b', hash: '#h' });
    // As hrefFor gives it: a store without a fragment spells the query its own way.
    expect(seen.store.belowRoute()).toEqual({ pathname: '', search: '?q=a%20b', hash: '#h' });
    expect(seen.store.belowRoute(router.state.location, changesOf({ q: 'y', task: 's20' }))).toEqual({ pathname: '', search: '?q=y&task=s20', hash: '#h' });
    await act(async () => seen.store.write(changesOf({ q: 'z' }), 'replace'));
    expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: '', search: '?q=z', hash: '#h' });
  });

  it('in a route that ends in *: what is below it', () => {
    const router = makeRouter('memory', '/docs/a/b?q=1', [{ path: 'docs/*', element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }]);
    render(<RouterProvider router={router} />);
    expect(seen.store.belowRoute(router.state.location)).toEqual({ pathname: 'a/b', search: '?q=1', hash: '' });
    expect(seen.store.belowRoute()).toEqual({ pathname: 'a/b', search: '?q=1', hash: '' });
  });

  it('outside any route: the whole path', () => {
    render(
      <MemoryRouter initialEntries={['/m/x?q=a+b']}>
        <ReactRouterArgStore><Probe /></ReactRouterArgStore>
      </MemoryRouter>,
    );
    expect(seen.store.belowRoute({ pathname: '/m/x', search: '?q=a+b', hash: '' })).toEqual({ pathname: 'm/x', search: '?q=a+b', hash: '' });
    expect(seen.store.belowRoute()).toEqual({ pathname: 'm/x', search: '?q=a%20b', hash: '' });
    expect(seen.store.belowRoute({ pathname: '/', search: '', hash: '' })).toEqual({ pathname: '', search: '', hash: '' });
  });
});
