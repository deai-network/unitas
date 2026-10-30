import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  BrowserRouter, createBrowserRouter, createHashRouter, createMemoryRouter, createPath, MemoryRouter, Outlet, redirect, Route,
  RouterProvider, Routes, useBlocker, useNavigate, useRouteError,
  type LoaderFunction, type NavigateFunction, type RouteObject,
} from 'react-router';
import {
  ArgStoreProvider, FieldContextProvider, stringType, useArg, useFieldGroup, useStoredField,
  type ArgDefinition, type ArgStore, type FieldDefinition, type RawChange, type StoredField, type UpdateMethod,
} from 'vultus-core';
import { ReactRouterArgStore, rest, token, useRouterArgStore, vanishing, type OneOfDefinition, type PathToken, type RouterArgStore } from '../index.js';

function arg(key: string, permanent?: boolean): ArgDefinition<string> {
  return { key, valueType: stringType, default: '', permanent };
}

const VARIANT: OneOfDefinition = { kind: 'oneOf', id: 'variant', choices: [{ value: 'plain' }, { value: 'modern' }, { value: 'old' }] };
const SECTION = arg('section');
const TASK = arg('task');
const AT = arg('at');
/** The probe's hooks declare these two: a filter that goes with the place, and one that stays. */
const TOC = arg('toc');
const LENS = arg('lens', true);
/** The route's tokens in most tests: a variant that vanishes, then the task. */
const PATH = [vanishing(VARIANT), rest(TASK)];
const INDEPENDENT_VARIANT = [vanishing(VARIANT, { independent: true }), rest(TASK)];

interface Seen {
  store: RouterArgStore;
  values: Record<string, string | undefined>;
  setKept: (value: string) => void;
  navigate: NavigateFunction;
  variant: StoredField<OneOfDefinition>;
}

let seen: Seen;
let mounts: number;
let warn: MockInstance<typeof console.warn>;
const disposers: (() => void)[] = [];

beforeEach(() => {
  seen = { values: {} } as Seen;
  mounts = 0;
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

/** Reads every key through the store; a static element, so it re-renders only on the store's notification. */
function Probe() {
  const store = useRouterArgStore();
  useArg(TOC);
  useArg(LENS);
  seen.store = store;
  seen.navigate = useNavigate();
  seen.values = {
    section: useRaw(store, 'section'),
    variant: useRaw(store, 'variant'),
    task: useRaw(store, 'task'),
    at: useRaw(store, 'at'),
    toc: useRaw(store, 'toc'),
    lens: useRaw(store, 'lens'),
    q: useRaw(store, 'q'),
  };
  return null;
}

/** The page: counts its mounts, keeps a useState value. */
function Page() {
  const [kept, setKept] = useState('initial');
  useEffect(() => {
    mounts += 1;
  }, []);
  seen.setKept = setKept;
  return <span data-testid="page">{kept}</span>;
}

function DeclaresAt() {
  useArg(AT);
  return null;
}

const PERMANENT_AT = arg('at', true);
function DeclaresAtPermanent() {
  useArg(PERMANENT_AT);
  return null;
}

function StoredVariant() {
  seen.variant = useStoredField(VARIANT);
  return null;
}

function changesOf(changes: Record<string, string | undefined>): RawChange[] {
  return Object.entries(changes).map(([key, raw]) => ({ key, raw }));
}

function write(changes: Record<string, string | undefined>, method: UpdateMethod = 'replace') {
  seen.store.write(changesOf(changes), method);
}

function hrefFor(changes: Record<string, string | undefined>): string {
  return seen.store.hrefFor!(changesOf(changes));
}

type RouterKind = 'memory' | 'browser';

interface Options {
  kind?: RouterKind;
  path?: readonly PathToken[];
  fragment?: ArgDefinition<any> | FieldDefinition;
  loader?: LoaderFunction;
  routes?: RouteObject[];
  beside?: ReactNode;
  basename?: string;
  pattern?: string;
  strict?: boolean;
}

function makeRouter(kind: RouterKind, entry: string, tree: RouteObject[], basename: string | undefined) {
  const options = { basename, hydrationData: { loaderData: { page: null } } };
  if (kind === 'memory') return createMemoryRouter(tree, { ...options, initialEntries: [entry] });
  window.history.replaceState(null, '', entry);
  return createBrowserRouter(tree, options);
}

/** Every location `router` moves to from now on, as `'PUSH /…'` / `'REPLACE /…'`; it goes with the test. */
function navigationsOf(router: ReturnType<typeof makeRouter>): string[] {
  const navigations: string[] = [];
  let last = router.state.location;
  const unsubscribe = router.subscribe((state) => {
    if (state.location === last) return;
    last = state.location;
    navigations.push(`${state.historyAction} ${createPath(state.location)}`);
  });
  disposers.push(() => {
    unsubscribe();
    router.dispose();
  });
  return navigations;
}

/**
 * The store with its route (`:lang/:module/*`) around the probe and the page, beside a `/start`
 * route. `navigations` lists every location the router moved to.
 */
function setup(entry: string, { kind = 'memory', path = PATH, fragment = AT, loader, routes = [], beside, basename, pattern = ':lang/:module/*', strict = false }: Options = {}) {
  const element = <ReactRouterArgStore path={path} fragment={fragment}><Probe /><Page />{beside}</ReactRouterArgStore>;
  const tree: RouteObject[] = [
    { id: 'page', path: pattern, loader, element },
    { path: 'start', element: null },
    ...routes,
  ];
  const router = makeRouter(kind, entry, tree, basename);
  const navigations = navigationsOf(router);
  const provider = <RouterProvider router={router} />;
  render(strict ? <StrictMode>{provider}</StrictMode> : provider);
  return { router, navigations, url: () => createPath(router.state.location) };
}

/** A loader that holds every call whose URL `holds` until `open()`, and answers the rest (and every call after `open`) at once. */
function gate(holds: (url: URL) => boolean = () => true) {
  const held: (() => void)[] = [];
  const requests: Request[] = [];
  let opened = false;
  const loader: LoaderFunction = ({ request }) => {
    requests.push(request);
    if (opened || !holds(new URL(request.url))) return null;
    return new Promise<null>((resolve) => {
      held.push(() => resolve(null));
    });
  };
  const open = () => {
    opened = true;
    held.splice(0).forEach((release) => release());
  };
  return { loader, requests, open };
}

const idle = (router: { state: { navigation: { state: string } } }) =>
  act(() => vi.waitFor(() => expect(router.state.navigation.state).toBe('idle')));

/** Lets microtasks run until `done`, before React renders; bounded, so a navigation that never comes fails its test instead of hanging it. */
async function microtasksUntil(done: () => boolean) {
  for (let i = 0; i < 1000 && !done(); i += 1) await Promise.resolve();
}

/** The warning that names `key`, as a refusal gives it. */
function expectWarningAbout(key: string, reason?: RegExp) {
  const messages = warn.mock.calls.map(([message]) => String(message)).filter((message) => message.includes(`'${key}'`));
  expect(messages).not.toEqual([]);
  if (reason !== undefined) expect(messages.join('\n')).toMatch(reason);
}

describe.each(['memory', 'browser'] as const)('the store under a %s router', (kind) => {
  describe('reading', () => {
    it('reads the part below the route, the query and the fragment, each as its plain key', () => {
      setup('/hu/mod/modern/s19/x?toc=a&q=b#12.4', { kind });
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's19/x', at: '12.4', toc: 'a', q: 'b' });
    });

    it('a vanished token reads absent, and its segment goes to the next token', () => {
      setup('/hu/mod/s19', { kind });
      expect(seen.values).toMatchObject({ variant: undefined, task: 's19' });
    });

    it('without segments below the route every token reads absent, and so does the fragment without a hash', () => {
      setup('/hu/mod', { kind });
      expect(seen.values).toMatchObject({ variant: undefined, task: undefined, at: undefined });
    });

    it('a / in a token\'s segment stays inside it, and a literal %2F round-trips', async () => {
      const { url } = setup('/hu/mod/a%2Fb/x/y', { kind, path: [token(SECTION), rest(TASK)] });
      expect(seen.values).toMatchObject({ section: 'a/b', task: 'x/y' });
      await act(async () => write({ task: 'p%2Fq' }));
      expect(url()).toBe('/hu/mod/a%2Fb/p%252Fq');
      expect(seen.values.task).toBe('p%2Fq');
    });

    it('segments beyond the tokens are ignored', () => {
      setup('/hu/mod/a/stray', { kind, path: [token(SECTION)] });
      expect(seen.values).toMatchObject({ section: 'a', task: undefined });
    });

    it('a malformed escape in a typed address reads raw, with no error', () => {
      setup('/hu/mod/50%', { kind });
      expect(seen.values.task).toBe('50%');
    });

    it('a key that is a token or the fragment does not read the query', () => {
      setup('/hu/mod/s19?task=other&at=there', { kind });
      expect(seen.values).toMatchObject({ task: 's19', at: undefined });
    });
  });

  describe('writing', () => {
    it('one write across path, query and fragment is one navigation, and hrefFor is its address', async () => {
      const { navigations } = setup('/hu/mod/s19?keep=1', { kind });
      const href = hrefFor({ task: 's20', q: 'x', at: '12.4' });
      await act(async () => write({ task: 's20', q: 'x', at: '12.4' }, 'push'));
      expect(navigations).toEqual(['PUSH /hu/mod/s20?keep=1&q=x#12.4']);
      expect(href).toBe('/hu/mod/s20?keep=1&q=x#12.4');
      expect(seen.values).toMatchObject({ task: 's20', q: 'x', at: '12.4' });
      if (kind === 'browser') expect(window.location.pathname + window.location.search + window.location.hash).toBe(href);
    });

    it('a replace by default; several writes in one tick are one navigation, a push if any asked for one', async () => {
      const { navigations } = setup('/hu/mod/s19', { kind });
      await act(async () => write({ task: 's20' }));
      await act(async () => {
        write({ task: 's21' });
        write({ q: 'x' }, 'push');
        write({ at: '1' });
      });
      expect(navigations).toEqual(['REPLACE /hu/mod/s20', 'PUSH /hu/mod/s21?q=x#1']);
    });

    it('an absent vanishing or rest token leaves no segment: no task gives the route\'s own path', async () => {
      const { url } = setup('/hu/mod/modern/s19', { kind, path: INDEPENDENT_VARIANT });
      await act(async () => write({ variant: undefined }));
      expect(url()).toBe('/hu/mod/s19');
      await act(async () => write({ task: undefined }));
      expect(url()).toBe('/hu/mod');
      expect(seen.values).toMatchObject({ variant: undefined, task: undefined });
      expect(mounts).toBe(1);
    });

    it('an empty raw value on a path key or the fragment is removal, so it never reads back as empty', async () => {
      const { url } = setup('/hu/mod/s19?q=x#12.4', { kind });
      act(() => {
        write({ at: '' });
        expect(seen.store.read('at')).toBeUndefined();
        write({ task: '' });
        expect(seen.store.read('task')).toBeUndefined();
      });
      expect(seen.values).toMatchObject({ task: undefined, at: undefined });
      await act(async () => {});
      expect(url()).toBe('/hu/mod?q=x');
    });

    it('an empty raw value on a query key stays as it is today', async () => {
      const { url } = setup('/hu/mod/s19', { kind });
      await act(async () => write({ q: '' }));
      expect(url()).toBe('/hu/mod/s19?q=');
      expect(seen.values.q).toBe('');
    });

    it('query and fragment writes keep the path as typed', async () => {
      const { url } = setup('/hu/mod/s19/', { kind, path: [token(TASK)] });
      await act(async () => write({ q: 'x' }));
      expect(url()).toBe('/hu/mod/s19/?q=x');
      await act(async () => write({ at: '1' }));
      expect(url()).toBe('/hu/mod/s19/?q=x#1');
    });

    it.each([
      ['s19~modern', 's19~modern'],
      ['resz.1-kep', 'resz.1-kep'],
      ['a@b_c', 'a@b_c'],
      ['a:b,c', 'a:b,c'],
      ['a b', 'a%20b'],
      ['50%', '50%25'],
      ['a/b', 'a/b'],
      ['a?b#c+d', 'a%3Fb%23c%2Bd'],
      ['egyháztörténelem', 'egyh%C3%A1zt%C3%B6rt%C3%A9nelem'],
    ])('the task %j goes in the address as %j and reads back', async (value, encoded) => {
      const { router } = setup('/hu/mod/s19', { kind });
      const href = hrefFor({ task: value });
      await act(async () => write({ task: value }));
      expect(router.state.location.pathname).toBe(`/hu/mod/${encoded}`);
      expect(href).toBe(`/hu/mod/${encoded}`);
      expect(seen.values.task).toBe(value);
      if (kind === 'browser') expect(window.location.pathname).toBe(`/hu/mod/${encoded}`);
    });

    it('the fragment: plain where it can be, encoded with the same encoder, read back', async () => {
      const { router } = setup('/hu/mod/s19', { kind });
      await act(async () => write({ at: '12.4' }));
      expect(router.state.location.hash).toBe('#12.4');
      expect(seen.values.at).toBe('12.4');
      await act(async () => write({ at: 'a b#c/d@e' }));
      expect(router.state.location.hash).toBe('#a%20b%23c%2Fd@e');
      expect(seen.values.at).toBe('a b#c/d@e');
      expect(hrefFor({ at: undefined })).toBe('/hu/mod/s19');
    });

    it('a write of the fragment\'s own value does not navigate', async () => {
      // Its encoder would write it as #a@b: the address stays as it was typed.
      const { navigations } = setup('/hu/mod/s19#a%40b', { kind });
      await act(async () => write({ at: 'a@b' }));
      expect(navigations).toEqual([]);
    });

    it('an accent in the route\'s base stays as the location has it', async () => {
      const { router } = setup('/hu/egyh%C3%A1z/s19', { kind });
      expect(seen.values.task).toBe('s19');
      expect(hrefFor({ task: 'tört' })).toBe('/hu/egyh%C3%A1z/t%C3%B6rt');
      await act(async () => write({ task: 'tört' }));
      expect(router.state.location.pathname).toBe('/hu/egyh%C3%A1z/t%C3%B6rt');
      expect(seen.values.task).toBe('tört');
      await act(async () => write({ task: 's20', variant: 'modern' }));
      expect(router.state.location.pathname).toBe('/hu/egyh%C3%A1z/modern/s20');
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's20' });
    });

    it('a slash, a space and a @ in the route\'s base count as what they are', async () => {
      const { router } = setup('/h%20u/a%2Fb@c/s19', { kind });
      expect(seen.values.task).toBe('s19');
      await act(async () => write({ task: 's20' }));
      expect(router.state.location.pathname).toBe('/h%20u/a%2Fb@c/s20');
    });

    it('the page stays mounted across token writes, its state kept', async () => {
      const { url } = setup('/hu/mod/modern/s19', { kind });
      act(() => seen.setKept('changed'));
      expect(mounts).toBe(1);
      await act(async () => write({ task: 's20' }));
      await act(async () => write({ variant: 'old' }));
      await act(async () => write({ task: undefined, variant: undefined }));
      await act(async () => write({ task: 's21' }));
      expect(url()).toBe('/hu/mod/s21');
      expect(mounts).toBe(1);
      expect(screen.getByTestId('page').textContent).toBe('changed');
    });

    it('a stored field at its default leaves its segment out, and the next token reads the right segment', async () => {
      const { url } = setup('/hu/mod/modern/s19', { kind, path: INDEPENDENT_VARIANT, beside: <StoredVariant /> });
      expect(seen.variant.options.value).toBe('modern');
      await act(async () => seen.variant.options.onChange('plain'));
      expect(url()).toBe('/hu/mod/s19');
      expect(seen.values).toMatchObject({ variant: undefined, task: 's19' });
      expect(seen.variant.options.value).toBe('plain');
      await act(async () => seen.variant.options.onChange('old'));
      expect(url()).toBe('/hu/mod/old/s19');
      expect(seen.values).toMatchObject({ variant: 'old', task: 's19' });
    });
  });

  describe('going somewhere else', () => {
    it('later tokens and declared non-permanent keys go; permanent and undeclared ones stay; one navigation', async () => {
      const { navigations } = setup('/hu/mod/modern/s19?toc=a&lens=b&q=c#12.4', { kind, beside: <DeclaresAt /> });
      await act(async () => write({ variant: 'old' }));
      expect(navigations).toEqual(['REPLACE /hu/mod/old?lens=b&q=c']);
      expect(seen.values).toMatchObject({ variant: 'old', task: undefined, toc: undefined, at: undefined, lens: 'b', q: 'c' });
    });

    it('a token that is declared itself is not cut as a query key is', async () => {
      const { url } = setup('/hu/mod/modern/s19?toc=a', { kind, beside: <StoredVariant /> });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/modern/s20');
    });

    it('a permanent fragment stays, with no hook on it', async () => {
      const { url } = setup('/hu/mod/s19#12.4', { kind, fragment: PERMANENT_AT });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/s20#12.4');
    });

    it('a permanent fragment stays, its hook saying the same', async () => {
      const { url } = setup('/hu/mod/s19#12.4', { kind, fragment: PERMANENT_AT, beside: <DeclaresAtPermanent /> });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/s20#12.4');
    });

    it('a non-permanent fragment goes, with no hook on it', async () => {
      const { url } = setup('/hu/mod/s19#12.4', { kind });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/s20');
    });

    it('a link computed in the first render already leaves a non-permanent fragment out', () => {
      let link: string | undefined;
      function Link() {
        link ??= useRouterArgStore().hrefFor!([{ key: 'task', raw: 's20' }]);
        return null;
      }
      setup('/hu/mod/s19#12.4', { kind, beside: <Link /> });
      expect(link).toBe('/hu/mod/s20');
    });

    it.each([
      ['earlier first', { variant: 'old', task: 's20', toc: 'x', at: '1' }],
      ['later first', { at: '1', toc: 'x', task: 's20', variant: 'old' }],
    ])('keys named in the same write stay, %s', async (_order, changes) => {
      const { navigations } = setup('/hu/mod/modern/s19?toc=a&q=c#12.4', { kind, beside: <DeclaresAt /> });
      const href = hrefFor(changes);
      await act(async () => write(changes));
      expect(navigations).toEqual(['REPLACE /hu/mod/old/s20?toc=x&q=c#1']);
      expect(href).toBe('/hu/mod/old/s20?toc=x&q=c#1');
    });

    it('changing an independent token cuts nothing', async () => {
      const { url } = setup('/hu/mod/modern/s19?toc=a#12.4', { kind, path: INDEPENDENT_VARIANT, beside: <DeclaresAt /> });
      await act(async () => write({ variant: 'old' }));
      expect(url()).toBe('/hu/mod/old/s19?toc=a#12.4');
    });

    it('an independent token after the cut is cut; changing it cuts nothing', async () => {
      const { url } = setup('/hu/mod/a/s19?toc=x', { kind, path: [token(SECTION), rest(TASK, { independent: true })] });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/a/s20?toc=x');
      await act(async () => write({ section: 'b' }));
      expect(url()).toBe('/hu/mod/b');
    });

    it('a same-value write cuts nothing and does not navigate; stray segments stay until the next real path write', async () => {
      const { navigations, url } = setup('/hu/mod/a/stray?toc=x', { kind, path: [token(SECTION)] });
      await act(async () => write({ section: 'a' }));
      expect(navigations).toEqual([]);
      await act(async () => write({ section: 'a', q: 'y' }));
      expect(url()).toBe('/hu/mod/a/stray?toc=x&q=y');
      await act(async () => write({ section: 'b' }));
      expect(url()).toBe('/hu/mod/b?q=y');
    });

    it('writing an absent token as removed, or as empty, is no change', async () => {
      const { navigations } = setup('/hu/mod/s19?toc=x', { kind });
      await act(async () => write({ variant: undefined }));
      await act(async () => write({ variant: '' }));
      expect(navigations).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('a query-only or fragment-only write never cuts anything', async () => {
      const { url } = setup('/hu/mod/modern/s19?toc=a#12.4', { kind, beside: <DeclaresAt /> });
      await act(async () => write({ q: 'x' }));
      await act(async () => write({ toc: 'b' }));
      await act(async () => write({ at: '1' }));
      expect(url()).toBe('/hu/mod/modern/s19?toc=b&q=x#1');
    });

    it('the removals read back at once, before the navigation, and hrefFor includes them', async () => {
      const { url } = setup('/hu/mod/modern/s19?toc=a&q=c#12.4', { kind, beside: <DeclaresAt /> });
      expect(hrefFor({ variant: 'old' })).toBe('/hu/mod/old?q=c');
      act(() => {
        write({ variant: 'old' });
        expect(seen.store.read('variant')).toBe('old');
        expect(seen.store.read('task')).toBeUndefined();
        expect(seen.store.read('toc')).toBeUndefined();
        expect(seen.store.read('at')).toBeUndefined();
        expect(seen.store.read('q')).toBe('c');
        expect(seen.store.hrefFor!([])).toBe('/hu/mod/old?q=c');
      });
      expect(url()).toBe('/hu/mod/modern/s19?toc=a&q=c#12.4');
      await act(async () => {});
      expect(url()).toBe('/hu/mod/old?q=c');
    });

    it('a pending own change that set a declared key goes with the place; one written after stays', async () => {
      const { url } = setup('/hu/mod/s19', { kind });
      await act(async () => {
        write({ toc: 'set' });
        write({ task: 's20' });
      });
      expect(url()).toBe('/hu/mod/s20');
      await act(async () => {
        write({ task: 's21' });
        write({ toc: 'set' });
      });
      expect(url()).toBe('/hu/mod/s21?toc=set');
    });

    it('a later token goes even when its definition says permanent: permanence is about query and fragment arguments', async () => {
      const PERMANENT_TASK = arg('task', true);
      function DeclaresTask() {
        useArg(PERMANENT_TASK);
        return null;
      }
      const { url } = setup('/hu/mod/a/s19', { kind, path: [token(SECTION), rest(PERMANENT_TASK)], beside: <DeclaresTask /> });
      act(() => {
        write({ section: 'b' });
        expect(seen.store.read('task')).toBeUndefined();
      });
      await act(async () => {});
      expect(url()).toBe('/hu/mod/b');
      expect(seen.values.task).toBeUndefined();
    });

    it('under <StrictMode>: the hooks declare, a token change goes somewhere else in one navigation, and the store stays one', async () => {
      const { navigations } = setup('/hu/mod/modern/s19?toc=a&lens=b&q=c#12.4', { kind, strict: true, beside: <DeclaresAt /> });
      const { store } = seen;
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's19', toc: 'a', at: '12.4' });
      act(() => {
        write({ variant: 'old' });
        expect(seen.store.read('toc')).toBeUndefined();
      });
      await act(async () => {});
      expect(navigations).toEqual(['REPLACE /hu/mod/old?lens=b&q=c']);
      expect(seen.store).toBe(store);
      expect(seen.values).toMatchObject({ variant: 'old', task: undefined, toc: undefined, at: undefined, lens: 'b', q: 'c' });
    });

    it('under <StrictMode>: a navigation on its way, and a batch that changes nothing', async () => {
      const { loader, open } = gate();
      const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, strict: true, loader });
      await act(async () => {
        write({ task: 's20' });
        write({ task: 's19' });
      });
      expect(navigations).toEqual([]);
      expect(seen.values).toMatchObject({ task: 's19', toc: 'a' });
      await act(async () => write({ task: 's20' }));
      expect(router.state.navigation.state).toBe('loading');
      expect(seen.values).toMatchObject({ task: 's20', toc: undefined });
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['REPLACE /hu/mod/s20']);
      expect(seen.values).toMatchObject({ task: 's20', toc: undefined });
    });

    it('a stored field\'s permanence reaches the store through its hook, and a field group\'s, hidden fields too', async () => {
      const definitions: FieldDefinition[] = [
        { kind: 'text', id: 'groupGoes' },
        { kind: 'text', id: 'groupStays', permanent: true },
        { kind: 'text', id: 'groupHidden', hidden: true },
      ];
      function Fields() {
        useStoredField(useState<FieldDefinition>({ kind: 'text', id: 'goes' })[0]);
        useStoredField(useState<FieldDefinition>({ kind: 'text', id: 'stays', permanent: true })[0]);
        useFieldGroup(definitions, { stored: true });
        return null;
      }
      const { url } = setup('/hu/mod/s19?goes=1&stays=2&groupGoes=3&groupStays=4&groupHidden=5&other=6', { kind, beside: <Fields /> });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/s20?stays=2&groupStays=4&other=6');
    });

    describe('under a wrapper store', () => {
      const FILTER = arg('filter');

      function wrap(store: ArgStore, forward: boolean): ArgStore {
        return {
          read: (key) => store.read(key),
          write: (changes, method) => store.write(changes, method),
          subscribe: (listener) => store.subscribe(listener),
          hrefFor: (changes) => store.hrefFor!(changes),
          ...(forward ? { declare: (key: string, facts: { permanent: boolean }) => store.declare?.(key, facts) } : {}),
        };
      }

      function Wrapped({ forward, children = <Filter /> }: { forward: boolean; children?: ReactNode }) {
        const store = useRouterArgStore();
        const [wrapper] = useState(() => wrap(store, forward));
        return <ArgStoreProvider store={wrapper}>{children}</ArgStoreProvider>;
      }

      function Filter() {
        useArg(FILTER);
        return null;
      }

      it('that does not forward declare: today\'s behaviour, the key stays', async () => {
        const { url } = setup('/hu/mod/s19?filter=a', { kind, beside: <Wrapped forward={false} /> });
        await act(async () => write({ task: 's20' }));
        expect(url()).toBe('/hu/mod/s20?filter=a');
      });

      it('that forwards declare: the key goes', async () => {
        const { url } = setup('/hu/mod/s19?filter=a', { kind, beside: <Wrapped forward /> });
        await act(async () => write({ task: 's20' }));
        expect(url()).toBe('/hu/mod/s20');
      });

      it('that does not forward declare: the query key stays, a non-permanent fragment still goes', async () => {
        const { url } = setup('/hu/mod/s19?filter=a#12.4', {
          kind,
          beside: <Wrapped forward={false}><Filter /><DeclaresAt /></Wrapped>,
        });
        await act(async () => write({ task: 's20' }));
        expect(url()).toBe('/hu/mod/s20?filter=a');
      });

      it('that does not forward declare: a permanent fragment stays', async () => {
        const { url } = setup('/hu/mod/s19#12.4', {
          kind,
          fragment: PERMANENT_AT,
          beside: <Wrapped forward={false}><DeclaresAtPermanent /></Wrapped>,
        });
        await act(async () => write({ task: 's20' }));
        expect(url()).toBe('/hu/mod/s20#12.4');
      });
    });
  });

  describe('writes that cannot be represented', () => {
    it.each([
      ['. as a value', { task: '.' }, 'task'],
      ['.. as a value', { task: '..' }, 'task'],
      ['.. inside a rest', { task: 'a/../b' }, 'task'],
      ['a leading / in a rest', { task: '/a' }, 'task'],
      ['a trailing / in a rest', { task: 'a/' }, 'task'],
      ['a doubled / in a rest', { task: 'a//b' }, 'task'],
      ['a vanishing value outside its allowed values', { variant: 'nope' }, 'variant'],
      ['a value whose first segment an earlier vanished token would claim', { task: 'modern' }, 'task'],
      ['a rest whose first segment an earlier vanished token would claim', { task: 'old/s20' }, 'task'],
    ])('%s: refused whole, nothing reaches the router, nothing is notified, a warning names the key', async (_name, changes, key) => {
      const { navigations, url } = setup('/hu/mod/s19?keep=1', { kind });
      const listener = vi.fn();
      const unsubscribe = seen.store.subscribe(listener);
      await act(async () => write({ ...changes, q: 'x' }, 'push'));
      unsubscribe();
      expect(navigations).toEqual([]);
      expect(url()).toBe('/hu/mod/s19?keep=1');
      expect(seen.values).toMatchObject({ task: 's19', variant: undefined, q: undefined });
      expect(seen.store.read('q')).toBeUndefined();
      expect(listener).not.toHaveBeenCalled();
      expectWarningAbout(key);
      if (kind === 'browser') expect(window.location.pathname).toBe('/hu/mod/s19');
    });

    it('.. in a token\'s value is refused, and a / in one is not', async () => {
      const { navigations, url } = setup('/hu/mod/a/s19', { kind, path: [token(SECTION), rest(TASK)] });
      await act(async () => write({ section: '..' }));
      expect(navigations).toEqual([]);
      expectWarningAbout('section', /\.\./);
      await act(async () => write({ section: 'a/b', task: 's19' }));
      expect(url()).toBe('/hu/mod/a%2Fb/s19');
      expect(seen.values.section).toBe('a/b');
    });

    it('removing a token while a later token keeps a value is refused', async () => {
      const { navigations } = setup('/hu/mod/a/s19', { kind, path: [token(SECTION, { independent: true }), rest(TASK)] });
      await act(async () => write({ section: undefined }));
      expect(navigations).toEqual([]);
      expect(seen.values).toMatchObject({ section: 'a', task: 's19' });
      expectWarningAbout('section', /shift/);
    });

    it('removing a token and naming a later one with a value is refused; removing a token cuts the later ones that are not named', async () => {
      const { navigations, url } = setup('/hu/mod/a/s19', { kind, path: [token(SECTION), rest(TASK)] });
      await act(async () => write({ section: undefined, task: 's20' }));
      expect(navigations).toEqual([]);
      expectWarningAbout('section', /shift/);
      await act(async () => write({ section: undefined }));
      expect(url()).toBe('/hu/mod');
    });

    it('a refused write leaves no push behind, and the store goes on', async () => {
      const { navigations } = setup('/hu/mod/s19', { kind });
      await act(async () => {
        write({ task: '..' }, 'push');
        write({ q: 'x' });
      });
      expect(navigations).toEqual(['REPLACE /hu/mod/s19?q=x']);
      await act(async () => write({ task: 's20' }));
      expect(navigations).toEqual(['REPLACE /hu/mod/s19?q=x', 'REPLACE /hu/mod/s20?q=x']);
    });

    it('in one tick, a refused write does not take the batch with it', async () => {
      const { navigations } = setup('/hu/mod/s19', { kind });
      await act(async () => {
        write({ task: 's20' });
        write({ task: '..' });
      });
      expect(navigations).toEqual(['REPLACE /hu/mod/s20']);
      expect(seen.values.task).toBe('s20');
    });

    it('hrefFor of a change that cannot be represented: the current href, with a warning', async () => {
      const { loader, open } = gate();
      const { router } = setup('/hu/mod/s19?keep=1#1', { kind, loader });
      expect(hrefFor({ task: '..' })).toBe('/hu/mod/s19?keep=1#1');
      expectWarningAbout('task');
      warn.mockClear();
      expect(hrefFor({ task: '..', q: 'x' })).toBe('/hu/mod/s19?keep=1#1');
      await act(async () => write({ q: 'y' }));
      expect(router.state.navigation.state).toBe('loading');
      expect(hrefFor({ variant: 'nope' })).toBe('/hu/mod/s19?keep=1&q=y#1');
      expectWarningAbout('variant');
      await act(async () => open());
      await idle(router);
    });
  });

  describe('an address a write could not make', () => {
    it('whose rest cannot be rebuilt: a filter write lands and keeps the path, a fragment write too', async () => {
      const { navigations, url } = setup('/hu/m/a%2F..%2Fb?toc=x', { kind, beside: <DeclaresAt /> });
      expect(seen.values.task).toBe('a/../b');
      await act(async () => write({ toc: 'y' }));
      expect(navigations).toEqual(['REPLACE /hu/m/a%2F..%2Fb?toc=y']);
      await act(async () => write({ at: '1' }));
      expect(url()).toBe('/hu/m/a%2F..%2Fb?toc=y#1');
      expect(warn).not.toHaveBeenCalled();
    });

    it('a write that names the rest as it reads changes nothing and is not refused', async () => {
      const { navigations } = setup('/hu/m/a%2F..%2Fb', { kind });
      await act(async () => write({ task: 'a/../b' }));
      expect(navigations).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('a write of an earlier independent token, which would rebuild the rest, is refused; replacing the rest is not', async () => {
      const { navigations, url } = setup('/hu/m/a%2F..%2Fb', { kind, path: INDEPENDENT_VARIANT });
      await act(async () => write({ variant: 'old' }));
      expect(navigations).toEqual([]);
      expectWarningAbout('task', /\.\./);
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/m/s20');
    });
  });

  describe('readRendered', () => {
    const KEYS = ['task', 'q', 'at'] as const;

    it('while a write is on its way, read shows the new value and readRendered the old; once its location renders, they agree', async () => {
      const { loader, open } = gate();
      const { router } = setup('/hu/mod/s19?q=x#1', { kind, loader });
      const rendered = { task: 's19', q: 'x', at: '1' };
      const written = { task: 's20', q: 'y', at: '2' };
      const reads = () => Object.fromEntries(KEYS.map((key) => [key, seen.store.read(key)]));
      const readsRendered = () => Object.fromEntries(KEYS.map((key) => [key, seen.store.readRendered(key)]));
      expect(reads()).toEqual(rendered);
      expect(readsRendered()).toEqual(rendered);
      // In the batch, before the navigation is made.
      act(() => {
        write(written);
        expect(reads()).toEqual(written);
        expect(readsRendered()).toEqual(rendered);
      });
      // The navigation is made and loading.
      await act(async () => {});
      expect(router.state.navigation.state).toBe('loading');
      expect(reads()).toEqual(written);
      expect(readsRendered()).toEqual(rendered);
      await act(async () => open());
      await idle(router);
      expect(reads()).toEqual(written);
      expect(readsRendered()).toEqual(written);
    });

    it('the removals a write implies: read shows them gone, readRendered still has them', async () => {
      const { loader, open } = gate();
      const { router } = setup('/hu/mod/modern/s19?toc=a#1', { kind, loader, beside: <DeclaresAt /> });
      await act(async () => write({ variant: 'old' }));
      expect(router.state.navigation.state).toBe('loading');
      for (const key of ['task', 'toc', 'at']) expect(seen.store.read(key)).toBeUndefined();
      expect(seen.store.readRendered('variant')).toBe('modern');
      expect(seen.store.readRendered('task')).toBe('s19');
      expect(seen.store.readRendered('toc')).toBe('a');
      expect(seen.store.readRendered('at')).toBe('1');
      await act(async () => open());
      await idle(router);
      for (const key of ['task', 'toc', 'at']) expect(seen.store.readRendered(key)).toBeUndefined();
      expect(seen.store.readRendered('variant')).toBe('old');
    });

    it('a key that is absent there is undefined, one that only the store has written too', async () => {
      setup('/hu/mod', { kind });
      act(() => {
        write({ task: 's20', q: 'y', at: '2' });
        for (const key of KEYS) expect(seen.store.readRendered(key)).toBeUndefined();
      });
      await act(async () => {});
      expect(seen.store.readRendered('task')).toBe('s20');
    });

    it('a refused write shows nowhere', async () => {
      setup('/hu/mod/s19', { kind });
      await act(async () => write({ task: '..' }));
      expect(seen.store.read('task')).toBe('s19');
      expect(seen.store.readRendered('task')).toBe('s19');
    });

    it('with neither prop, it reads the query alone, a key named as a token too', async () => {
      const { loader, open } = gate();
      const router = createMemoryRouter(
        [{ id: 'page', path: '/m/:id', loader, element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }],
        { initialEntries: ['/m/1?task=a#12.4'], hydrationData: { loaderData: { page: null } } },
      );
      disposers.push(() => router.dispose());
      render(<RouterProvider router={router} />);
      expect(seen.store.readRendered('at')).toBeUndefined();
      await act(async () => write({ task: 'b' }));
      expect(seen.store.read('task')).toBe('b');
      expect(seen.store.readRendered('task')).toBe('a');
      await act(async () => open());
      await idle(router);
      expect(seen.store.readRendered('task')).toBe('b');
    });
  });

  describe('a query as it was typed', () => {
    it('a fragment-only write keeps it: a hash-only navigation, which runs no loader', async () => {
      const loader = vi.fn(() => null);
      const { navigations } = setup('/hu/mod/s19?a=b+c', { kind, loader });
      expect(hrefFor({ at: '1' })).toBe('/hu/mod/s19?a=b+c#1');
      await act(async () => write({ at: '1' }));
      expect(navigations).toEqual(['REPLACE /hu/mod/s19?a=b+c#1']);
      expect(loader).not.toHaveBeenCalled();
      expect(seen.store.read('a')).toBe('b c');
      expect(seen.values.at).toBe('1');
      await act(async () => write({ at: '2' }));
      expect(navigations).toEqual(['REPLACE /hu/mod/s19?a=b+c#1', 'REPLACE /hu/mod/s19?a=b+c#2']);
      expect(loader).not.toHaveBeenCalled();
    });

    it('a write of the fragment\'s own value over it does not navigate', async () => {
      const { navigations } = setup('/hu/mod/s19?a=b+c#1', { kind });
      await act(async () => write({ at: '1' }));
      expect(navigations).toEqual([]);
    });

    it('a write that names no query key keeps it, a token\'s too', async () => {
      const { url } = setup('/hu/mod/s19?a=b+c', { kind });
      await act(async () => write({ task: 's20' }));
      expect(url()).toBe('/hu/mod/s20?a=b+c');
    });

    it('a write of a query key respells it, as every query write does', async () => {
      const { navigations } = setup('/hu/mod/s19?a=b+c', { kind });
      await act(async () => write({ q: 'x', at: '1' }));
      expect(navigations).toEqual(['REPLACE /hu/mod/s19?a=b%20c&q=x#1']);
    });

    it('with neither prop, hrefFor and every write respell it, as they did before these props', async () => {
      const router = makeRouter(kind, '/m/1?a=b+c', [{ path: '/m/:id', element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }], undefined);
      const navigations = navigationsOf(router);
      render(<RouterProvider router={router} />);
      expect(seen.store.hrefFor!([])).toBe('/m/1?a=b%20c');
      await act(async () => write({ a: 'b c' }));
      expect(navigations).toEqual([]);
      await act(async () => write({ q: 'x' }));
      expect(navigations).toEqual(['REPLACE /m/1?a=b%20c&q=x']);
    });
  });

  describe('a basename', () => {
    it('the root below it: hrefFor gives the basename, and a write goes there', async () => {
      const { router } = setup('/app/modern/s19', { kind, pattern: '*', basename: '/app' });
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's19' });
      expect(hrefFor({ variant: undefined, task: undefined })).toBe('/app');
      await act(async () => write({ variant: undefined, task: undefined }));
      expect(router.state.location.pathname).toBe('/app');
      expect(seen.values).toMatchObject({ variant: undefined, task: undefined });
      if (kind === 'browser') expect(window.location.pathname).toBe('/app');
    });

    it('with an accent in the route\'s base and in a value', async () => {
      const { router } = setup('/app/hu/egyh%C3%A1z/s19', { kind, basename: '/app' });
      expect(seen.values.task).toBe('s19');
      expect(hrefFor({ task: 'tört' })).toBe('/app/hu/egyh%C3%A1z/t%C3%B6rt');
      await act(async () => write({ task: 'tört' }));
      expect(router.state.location.pathname).toBe('/app/hu/egyh%C3%A1z/t%C3%B6rt');
      expect(seen.values.task).toBe('tört');
      if (kind === 'browser') expect(window.location.pathname).toBe('/app/hu/egyh%C3%A1z/t%C3%B6rt');
      await act(async () => write({ task: 's20', variant: 'modern' }));
      expect(router.state.location.pathname).toBe('/app/hu/egyh%C3%A1z/modern/s20');
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's20' });
    });

    it('reads, writes and links within it', async () => {
      const { router } = setup('/app/hu/mod/s19?keep=1', { kind, basename: '/app' });
      expect(seen.values.task).toBe('s19');
      expect(hrefFor({ task: 's20', at: '1' })).toBe('/app/hu/mod/s20?keep=1#1');
      await act(async () => write({ task: 's20' }));
      expect(router.state.location.pathname).toBe('/app/hu/mod/s20');
      expect(seen.values.task).toBe('s20');
      if (kind === 'browser') expect(window.location.pathname).toBe('/app/hu/mod/s20');
      await act(async () => write({ task: undefined }));
      expect(router.state.location.pathname).toBe('/app/hu/mod');
      expect(hrefFor({ task: 'a b' })).toBe('/app/hu/mod/a%20b?keep=1');
    });
  });

  describe('the route the store sits in', () => {
    it('takes the part below a nested route', async () => {
      const element = <ReactRouterArgStore path={PATH} fragment={AT}><Probe /></ReactRouterArgStore>;
      const router = makeRouter(kind, '/hu/mod/modern/s19', [
        { path: ':lang', element: <Outlet />, children: [{ path: ':module/*', element }] },
      ], undefined);
      disposers.push(() => router.dispose());
      render(<RouterProvider router={router} />);
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's19' });
      await act(async () => write({ variant: 'old', task: 's20' }));
      expect(router.state.location.pathname).toBe('/hu/mod/old/s20');
    });

    describe('inside descendant <Routes>, under a data router', () => {
      /** The data router's matches do not hold the store's route here: it knows only `:lang/*`. */
      function inDescendantRoutes(entry: string, { loader, routes = [] }: { loader?: LoaderFunction; routes?: RouteObject[] } = {}) {
        const element = <ReactRouterArgStore path={PATH} fragment={AT}><Probe /><Page /></ReactRouterArgStore>;
        function Inner() {
          return <Routes><Route path=":module/*" element={element} /></Routes>;
        }
        const router = makeRouter(kind, entry, [
          { id: 'page', path: ':lang/*', loader, element: <Inner /> },
          { path: 'start', element: null },
          ...routes,
        ], undefined);
        const navigations = navigationsOf(router);
        render(<RouterProvider router={router} />);
        return { router, navigations };
      }

      it('takes the part below its own route', async () => {
        const { router } = inDescendantRoutes('/hu/egyh%C3%A1z/modern/s19');
        expect(seen.values).toMatchObject({ variant: 'modern', task: 's19' });
        expect(hrefFor({ task: 'a b' })).toBe('/hu/egyh%C3%A1z/modern/a%20b');
        await act(async () => write({ task: 's20', q: 'x' }));
        expect(createPath(router.state.location)).toBe('/hu/egyh%C3%A1z/modern/s20?q=x');
        expect(seen.values).toMatchObject({ variant: 'modern', task: 's20', q: 'x' });
        expect(mounts).toBe(1);
      });

      it('a batch that waited lands below where the router settled, by the depth the store rendered with', async () => {
        const { loader, open } = gate();
        const { router, navigations } = inDescendantRoutes('/hu/mod/s19', { loader });
        await act(async () => {
          write({ task: 's20' });
          void router.navigate('/en/masik/x?k=1');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /en/masik/x?k=1', 'REPLACE /en/masik/s20?k=1']);
        expect(warn).not.toHaveBeenCalled();
      });

      it('a batch that waited, and the router went somewhere too short to hold the route: the path change is dropped with a warning', async () => {
        const { loader, open } = gate();
        const { router, navigations } = inDescendantRoutes('/hu/mod/s19?toc=a', { loader });
        await act(async () => {
          write({ task: 's20', q: 'y' });
          void router.navigate('/start?toc=1');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start?toc=1', 'REPLACE /start?toc=1&q=y']);
        expectWarningAbout('task');
      });

      it('the known limit: it cannot tell that a route as deep as its own is another route, so the path change lands below it', async () => {
        const { loader, open } = gate();
        const { router, navigations } = inDescendantRoutes('/hu/mod/s19', { loader, routes: [{ path: 'about/us', element: null }] });
        await act(async () => {
          write({ task: 's20' });
          void router.navigate('/about/us');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /about/us', 'REPLACE /about/us/s20']);
        expect(warn).not.toHaveBeenCalled();
      });
    });

    it('a route that is only a splat owns the whole path', async () => {
      const { url } = setup('/modern/s19', { kind, pattern: '*' });
      expect(seen.values).toMatchObject({ variant: 'modern', task: 's19' });
      await act(async () => write({ variant: undefined, task: undefined }));
      expect(url()).toBe('/');
      await act(async () => write({ task: 'a/b' }));
      expect(url()).toBe('/a/b');
      expect(seen.values.task).toBe('a/b');
    });

    it('a static route part: the same', async () => {
      const { url } = setup('/x/y/s19', { kind, pattern: 'x/y/*' });
      expect(seen.values.task).toBe('s19');
      await act(async () => write({ task: undefined }));
      expect(url()).toBe('/x/y');
    });

    it('the pattern not ending in * throws, and an error boundary sees it', () => {
      function Caught() {
        return <span data-testid="caught">{(useRouteError() as Error).message}</span>;
      }
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const router = makeRouter(kind, '/hu/mod', [{
          path: ':lang/:module',
          errorElement: <Caught />,
          element: <ReactRouterArgStore path={PATH}><Probe /></ReactRouterArgStore>,
        }], undefined);
        disposers.push(() => router.dispose());
        render(<RouterProvider router={router} />);
        expect(screen.getByTestId('caught').textContent).toMatch(/':lang\/:module'.*\*/);
      } finally {
        error.mockRestore();
      }
    });
  });

  describe('in-flight navigations', () => {
    it('a task write reads back at once and while its navigation loads; once rendered, from the location', async () => {
      const { loader, open } = gate();
      const { router, url } = setup('/hu/mod/s19', { kind, loader, path: INDEPENDENT_VARIANT });
      act(() => {
        write({ task: 's20' });
        expect(seen.store.read('task')).toBe('s20');
      });
      expect(seen.values.task).toBe('s20');
      await act(async () => {});
      expect(router.state.navigation.state).toBe('loading');
      expect(router.state.navigation.location?.pathname).toBe('/hu/mod/s20');
      expect(url()).toBe('/hu/mod/s19');
      expect(seen.values.task).toBe('s20');
      expect(hrefFor({ variant: 'old' })).toBe('/hu/mod/old/s20');
      await act(async () => open());
      await idle(router);
      expect(url()).toBe('/hu/mod/s20');
      expect(seen.values.task).toBe('s20');
    });

    it('a batch builds on the store\'s own path navigation while it loads, the first aborted', async () => {
      const { loader, requests, open } = gate();
      const { router, url } = setup('/hu/mod/s19?q=x', { kind, loader, path: INDEPENDENT_VARIANT });
      await act(async () => write({ task: 's20' }));
      expect(router.state.navigation.state).toBe('loading');
      await act(async () => write({ variant: 'old', q: 'y' }));
      expect(requests).toHaveLength(2);
      expect(requests[0].signal.aborted).toBe(true);
      expect(seen.values).toMatchObject({ variant: 'old', task: 's20', q: 'y' });
      await act(async () => open());
      await idle(router);
      expect(url()).toBe('/hu/mod/old/s20?q=y');
      expect(seen.values).toMatchObject({ variant: 'old', task: 's20', q: 'y' });
    });

    it('a fragment write on the store\'s own path navigation builds on it', async () => {
      const { loader, open } = gate();
      const { router, url } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => write({ task: 's20' }));
      await act(async () => write({ at: '1' }));
      expect(seen.values).toMatchObject({ task: 's20', at: '1' });
      await act(async () => open());
      await idle(router);
      expect(url()).toBe('/hu/mod/s20#1');
    });

    it.each([['write first'], ['navigation first']])('%s, in one tick with a navigation from outside to another module: it completes, the task lands on top', async (order) => {
      const { loader, requests, open } = gate();
      const { router, navigations, url } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => {
        if (order === 'write first') write({ task: 's20' });
        void router.navigate('/en/masik/x?k=1');
        if (order === 'navigation first') write({ task: 's20' });
      });
      expect(router.state.navigation.location?.pathname).toBe('/en/masik/x');
      expect(requests).toHaveLength(1);
      expect(requests[0].signal.aborted).toBe(false);
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/x?k=1', 'REPLACE /en/masik/s20?k=1']);
      expect(url()).toBe('/en/masik/s20?k=1');
      expect(seen.values.task).toBe('s20');
    });

    it('writes made while the batch waits join it: one navigation, a push if any asked for one', async () => {
      const { loader, open } = gate();
      const { router, navigations } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => {
        write({ q: 'y' });
        void router.navigate('/en/masik/x');
      });
      await act(async () => write({ task: 's20' }, 'push'));
      expect(navigations).toEqual([]);
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/x', 'PUSH /en/masik/s20?q=y']);
    });

    it('the removals of a batch that waited were decided at write time, and apply where the router settled', async () => {
      const { loader, open } = gate();
      const { router, navigations } = setup('/hu/mod/modern/s19?toc=a', { kind, loader });
      await act(async () => {
        write({ variant: 'old' });
        void router.navigate('/en/masik/modern/x?toc=b&q=1');
      });
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/modern/x?toc=b&q=1', 'REPLACE /en/masik/old?q=1']);
    });

    it('a declared key that was not there at write time is not among those removals: where the router settled it stays', async () => {
      const { loader, open } = gate();
      const { router, navigations } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => {
        write({ task: 's20' });
        void router.navigate('/en/masik/x?toc=b');
      });
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/x?toc=b', 'REPLACE /en/masik/s20?toc=b']);
    });

    it('a navigation from outside that redirects within the route: the task lands where the router settled', async () => {
      let release = () => {};
      const { router, navigations, url } = setup('/hu/mod/s19', {
        kind,
        routes: [{
          path: 'old',
          loader: () => new Promise((resolve) => {
            release = () => resolve(redirect('/en/masik/z'));
          }),
          element: null,
        }],
      });
      await act(async () => {
        void router.navigate('/old');
        write({ task: 's20' });
      });
      await act(async () => release());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/z', 'REPLACE /en/masik/s20']);
      expect(url()).toBe('/en/masik/s20');
    });

    it.each([
      ['/start', '/start'],
      ['a route as deep as the store\'s', '/admin/seeds'],
    ])('a batch that waited, and the router left the route, to %s: the path change is dropped with a warning, the rest lands', async (_name, target) => {
      let release = () => {};
      const { router, navigations } = setup('/hu/mod/s19', {
        kind,
        routes: [
          {
            path: 'old',
            loader: () => new Promise((resolve) => {
              release = () => resolve(redirect(target));
            }),
            element: null,
          },
          { path: 'admin/*', element: null },
        ],
      });
      await act(async () => {
        void router.navigate('/old');
        write({ task: 's20', q: 'y' });
      });
      await act(async () => release());
      await idle(router);
      expect(navigations).toEqual([`PUSH ${target}`, `REPLACE ${target}?q=y`]);
      expectWarningAbout('task');
    });

    it('a batch that waited, and the path change no longer fits: dropped with a warning, the rest lands, and the token reads the location', async () => {
      const { loader, open } = gate();
      const { router, navigations, url } = setup('/hu/mod/old/s19', { kind, loader });
      await act(async () => {
        // It fits here, after the variant; where the router goes there is no variant, and it would read as one.
        write({ task: 'modern', q: 'y' });
        void router.navigate('/en/masik/s21');
      });
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/s21', 'REPLACE /en/masik/s21?q=y']);
      expect(url()).toBe('/en/masik/s21?q=y');
      expectWarningAbout('task', /would read as/);
      expect(seen.values).toMatchObject({ task: 's21', q: 'y' });
    });

    it('while the rest of such a batch is loading, the dropped change no longer stands in for the location', async () => {
      const { loader, open } = gate((target) => target.search === '?q=y');
      const { router, url } = setup('/hu/mod/old/s19', { kind, loader });
      await act(async () => {
        write({ task: 'modern', q: 'y' });
        void router.navigate('/en/masik/s21');
      });
      await act(() => vi.waitFor(() => expect(router.state.navigation.location?.search).toBe('?q=y')));
      expect(url()).toBe('/en/masik/s21');
      expect(seen.store.read('task')).toBe('s21');
      expect(seen.store.read('q')).toBe('y');
      await act(async () => open());
      await idle(router);
      expect(url()).toBe('/en/masik/s21?q=y');
    });

    it('a batch of path changes only that no longer fit: dropped with a warning, no navigation of its own, the token reads the location', async () => {
      const { loader, open } = gate();
      const { router, navigations } = setup('/hu/mod/old/s19', { kind, loader });
      await act(async () => {
        write({ task: 'modern' });
        void router.navigate('/en/masik/s21');
      });
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /en/masik/s21']);
      expectWarningAbout('task');
      expect(seen.values.task).toBe('s21');
    });

    describe('a batch whose path changes are dropped did not go somewhere else', () => {
      /** A route at `/old` whose loader redirects to `target` once released. */
      function redirectingTo(target: string) {
        let release = () => {};
        const route: RouteObject = {
          path: 'old',
          loader: () => new Promise((resolve) => {
            release = () => resolve(redirect(target));
          }),
          element: null,
        };
        return { route, release: () => release() };
      }

      it('it left the route: a key the write would have removed stays, a named change lands, the warning still fires', async () => {
        const { route, release } = redirectingTo('/start?toc=1');
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, routes: [route] });
        await act(async () => {
          void router.navigate('/old');
          write({ task: 's20', q: 'y' });
          // Until the router settles, the write shows what it implies.
          expect(seen.store.read('toc')).toBeUndefined();
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start?toc=1', 'REPLACE /start?toc=1&q=y']);
        expectWarningAbout('task');
      });

      it('with nothing else in the batch: no navigation of its own, the key stays, the warning still fires', async () => {
        const { route, release } = redirectingTo('/start?toc=1');
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, routes: [route] });
        await act(async () => {
          void router.navigate('/old');
          write({ task: 's20' });
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start?toc=1']);
        expectWarningAbout('task');
      });

      it('the same key named in the same write lands', async () => {
        const { route, release } = redirectingTo('/start?toc=1');
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, routes: [route] });
        await act(async () => {
          void router.navigate('/old');
          write({ task: 's20', toc: 'named' });
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start?toc=1', 'REPLACE /start?toc=named']);
      });

      it.each([
        ['before', [{ toc: 'named' }, { task: 's20' }]],
        ['after', [{ task: 's20' }, { toc: 'named' }]],
      ])('a key named in another write of the batch, %s the one that implied its removal, lands', async (_order, writes) => {
        const { route, release } = redirectingTo('/start?toc=1');
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, routes: [route] });
        await act(async () => {
          void router.navigate('/old');
          for (const changes of writes) write(changes);
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start?toc=1', 'REPLACE /start?toc=named']);
      });

      it('the fragment the write would have removed stays', async () => {
        const { route, release } = redirectingTo('/start#2');
        const { router, navigations } = setup('/hu/mod/s19#1', { kind, routes: [route], beside: <DeclaresAt /> });
        await act(async () => {
          void router.navigate('/old');
          write({ task: 's20' });
          expect(seen.store.read('at')).toBeUndefined();
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start#2']);
      });

      it('a fragment named in the same write lands', async () => {
        const { route, release } = redirectingTo('/start#2');
        const { router, navigations } = setup('/hu/mod/s19#1', { kind, routes: [route], beside: <DeclaresAt /> });
        await act(async () => {
          void router.navigate('/old');
          write({ task: 's20', at: 'named' });
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start#2', 'REPLACE /start#named']);
      });

      it('on the route, where the change no longer fits: read-your-writes lets the removals go, while the rest of the batch loads', async () => {
        const { loader, open } = gate((target) => target.search.includes('q=y'));
        const { router, url } = setup('/hu/mod/old/s19?toc=a#1', { kind, loader, beside: <DeclaresAt /> });
        await act(async () => {
          write({ task: 'modern', q: 'y' });
          expect(seen.store.read('toc')).toBeUndefined();
          expect(seen.store.read('at')).toBeUndefined();
          void router.navigate('/en/masik/s21?toc=1#2');
        });
        await act(() => vi.waitFor(() => expect(router.state.navigation.location?.search).toBe('?toc=1&q=y')));
        expect(url()).toBe('/en/masik/s21?toc=1#2');
        expect(seen.values).toMatchObject({ task: 's21', toc: '1', at: '2', q: 'y' });
        expect(seen.store.read('toc')).toBe('1');
        expectWarningAbout('task', /would read as/);
        await act(async () => open());
        await idle(router);
        expect(url()).toBe('/en/masik/s21?toc=1&q=y#2');
      });

      it('it left the route, and the write only removed a token that has no value there: nothing to warn of, and still nothing else goes', async () => {
        const { route, release } = redirectingTo('/start?toc=1');
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, routes: [route] });
        await act(async () => {
          void router.navigate('/old');
          write({ task: undefined });
        });
        await act(async () => release());
        await idle(router);
        expect(navigations).toEqual(['PUSH /start?toc=1']);
        expect(warn).not.toHaveBeenCalled();
      });

      it('path changes that do fit where it settled still take their removals along', async () => {
        const { loader, open } = gate();
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, loader });
        await act(async () => {
          write({ task: 's20' });
          void router.navigate('/en/masik/x?toc=1&q=2');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /en/masik/x?toc=1&q=2', 'REPLACE /en/masik/s20?q=2']);
        expect(warn).not.toHaveBeenCalled();
      });
    });

    describe('a batch that changes no token where it applies cuts nothing', () => {
      it('a navigation from outside went to that very task: its query stays, nothing of the store\'s to navigate', async () => {
        const { loader, open } = gate();
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, loader });
        await act(async () => {
          write({ task: 's20' });
          void router.navigate('/hu/mod/s20?toc=b');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /hu/mod/s20?toc=b']);
        expect(seen.values).toMatchObject({ task: 's20', toc: 'b' });
        expect(warn).not.toHaveBeenCalled();
      });

      it('the same with a named change in the batch: it lands, and the query stays', async () => {
        const { loader, open } = gate();
        const { router, navigations } = setup('/hu/mod/s19?toc=a', { kind, loader });
        await act(async () => {
          write({ task: 's20', q: 'y' });
          void router.navigate('/hu/mod/s20?toc=b');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /hu/mod/s20?toc=b', 'REPLACE /hu/mod/s20?toc=b&q=y']);
      });

      it('a navigation from outside already went to that variant: the later token it chose stays', async () => {
        const { loader, open } = gate();
        const { router, navigations } = setup('/hu/mod/modern/s19', { kind, loader });
        await act(async () => {
          write({ variant: 'old' });
          // Until the router settles, the write shows what it implies, a later token's removal too.
          expect(seen.store.read('task')).toBeUndefined();
          void router.navigate('/hu/mod/old/s30');
        });
        await act(async () => open());
        await idle(router);
        expect(navigations).toEqual(['PUSH /hu/mod/old/s30']);
        expect(seen.values).toMatchObject({ variant: 'old', task: 's30' });
      });

      it('a round trip in one tick: nothing goes, no navigation, and everything reads as it was', async () => {
        const { navigations } = setup('/hu/mod/s19?toc=a#1', { kind, beside: <DeclaresAt /> });
        const listener = vi.fn();
        const unsubscribe = seen.store.subscribe(listener);
        await act(async () => {
          write({ task: 's20' });
          expect(seen.store.read('toc')).toBeUndefined();
          write({ task: 's19' });
        });
        unsubscribe();
        expect(navigations).toEqual([]);
        expect(seen.values).toMatchObject({ task: 's19', toc: 'a', at: '1' });
        expect(seen.store.read('toc')).toBe('a');
        expect(listener).toHaveBeenCalled();
      });

      it('a round trip through an earlier token: the later token and the query stay', async () => {
        const { navigations } = setup('/hu/mod/modern/s19?toc=a', { kind });
        await act(async () => {
          write({ variant: 'old' });
          write({ variant: 'modern' });
        });
        expect(navigations).toEqual([]);
        expect(seen.values).toMatchObject({ variant: 'modern', task: 's19', toc: 'a' });
      });

      it('a round trip with a named change: it lands alone', async () => {
        const { navigations } = setup('/hu/mod/s19?toc=a', { kind });
        await act(async () => {
          write({ task: 's20' });
          write({ task: 's19', q: 'x' });
        });
        expect(navigations).toEqual(['REPLACE /hu/mod/s19?toc=a&q=x']);
      });

      it('a round trip, and an independent token that does change: that alone goes nowhere, so nothing is cut', async () => {
        const { navigations } = setup('/hu/mod/s19?toc=a', { kind, path: INDEPENDENT_VARIANT });
        await act(async () => {
          write({ task: 's20' });
          write({ task: 's19' });
          write({ variant: 'old' });
        });
        expect(navigations).toEqual(['REPLACE /hu/mod/old/s19?toc=a']);
      });

      it('hrefFor of a round trip on a pending write gives what the batch would: nothing is cut', async () => {
        setup('/hu/mod/s19?toc=a', { kind });
        await act(async () => {
          write({ task: 's20' });
          expect(hrefFor({ task: 's19' })).toBe('/hu/mod/s19?toc=a');
        });
      });

      it('a navigation of the store\'s on its way has gone somewhere else: going back in a later tick does not bring the key back, and hrefFor says so', async () => {
        const { loader, open } = gate();
        const { router, url } = setup('/hu/mod/s19?toc=a', { kind, loader });
        await act(async () => write({ task: 's20' }));
        expect(router.state.navigation.state).toBe('loading');
        expect(hrefFor({ task: 's19' })).toBe('/hu/mod/s19');
        await act(async () => write({ task: 's19' }));
        await act(async () => open());
        await idle(router);
        expect(url()).toBe('/hu/mod/s19');
      });
    });

    it('a 404 under a router with only this route: it has left the route, so the path change is dropped with a warning and the rest lands', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const element = <ReactRouterArgStore path={PATH} fragment={AT}><Probe /></ReactRouterArgStore>;
        const router = makeRouter(kind, '/hu/mod/s19?toc=a', [{ id: 'page', path: ':lang/:module/*', errorElement: <span />, element }], undefined);
        const navigations = navigationsOf(router);
        render(<RouterProvider router={router} />);
        await act(async () => {
          void router.navigate('/nope?toc=1');
          write({ task: 's20', q: 'y' });
        });
        await idle(router);
        expect(navigations).toEqual(['PUSH /nope?toc=1', 'REPLACE /nope?toc=1&q=y']);
        expectWarningAbout('task');
      } finally {
        error.mockRestore();
      }
    });

    it('the store\'s own navigation that its loader redirects: its value goes, it reads where the redirect went', async () => {
      let release = () => {};
      const loader: LoaderFunction = ({ params }) => {
        if (params['*'] !== 'gone') return null;
        return new Promise((resolve) => {
          release = () => resolve(redirect('/hu/mod/new'));
        });
      };
      const { router, url } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => write({ task: 'gone' }));
      expect(router.state.navigation.state).toBe('loading');
      expect(seen.values.task).toBe('gone');
      await act(async () => release());
      await idle(router);
      expect(url()).toBe('/hu/mod/new');
      expect(seen.values.task).toBe('new');
    });

    it('the store\'s own navigation that a blocker blocks: it reads the location again, and the next write builds on it', async () => {
      function Blocker() {
        useBlocker(({ nextLocation }) => nextLocation.pathname.endsWith('/s20'));
        return null;
      }
      const { router, url } = setup('/hu/mod/s19?toc=a', { kind, beside: <Blocker /> });
      act(() => write({ task: 's20' }));
      expect(seen.values).toMatchObject({ task: 's20', toc: undefined });
      await act(async () => {});
      expect([...router.state.blockers.values()][0].state).toBe('blocked');
      expect(url()).toBe('/hu/mod/s19?toc=a');
      expect(seen.values).toMatchObject({ task: 's19', toc: 'a' });
      await act(async () => write({ q: 'y' }));
      expect(url()).toBe('/hu/mod/s19?toc=a&q=y');
    });

    it('the store\'s own navigation cancelled by one from outside: it reads where that one goes', async () => {
      const { loader, open } = gate();
      const { router, url } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => write({ task: 's20' }));
      expect(seen.values.task).toBe('s20');
      await act(async () => {
        void router.navigate('/hu/mod/s21');
      });
      expect(router.state.navigation.location?.pathname).toBe('/hu/mod/s21');
      // The rendered location is still s19 until the new one loads.
      expect(seen.values.task).toBe('s19');
      await act(async () => open());
      await idle(router);
      expect(url()).toBe('/hu/mod/s21');
      expect(seen.values.task).toBe('s21');
    });

    it('a navigation from outside after the store\'s (not loading) wins', async () => {
      const { router, url } = setup('/hu/mod/s19', { kind });
      await act(async () => {
        write({ task: 's20' });
        await microtasksUntil(() => router.state.location.pathname === '/hu/mod/s20');
        void router.navigate('/hu/mod/s21');
      });
      expect(url()).toBe('/hu/mod/s21');
      expect(seen.values.task).toBe('s21');
    });

    it('an earlier location rendering first does not drop the values of the store\'s path navigation still on its way', async () => {
      const { loader, open } = gate((target) => target.pathname.endsWith('/s20'));
      const { router, url } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => {
        void router.navigate('/hu/mod/s19?k=1');
        await microtasksUntil(() => router.state.location.search === '?k=1');
        write({ task: 's20' });
      });
      expect(url()).toBe('/hu/mod/s19?k=1');
      expect(router.state.navigation.location?.pathname).toBe('/hu/mod/s20');
      expect(seen.values.task).toBe('s20');
      expect(seen.store.read('k')).toBe('1');
      await act(async () => open());
      await idle(router);
      expect(url()).toBe('/hu/mod/s20?k=1');
      expect(seen.values.task).toBe('s20');
    });

    it('a fragment-only write while a navigation from outside loads: it waits, then lands on top without a loader', async () => {
      const { loader, requests, open } = gate();
      const { router, navigations } = setup('/hu/mod/s19', { kind, loader });
      await act(async () => {
        void router.navigate('/hu/mod/s21');
        write({ at: '12.4' });
      });
      await act(async () => open());
      await idle(router);
      expect(navigations).toEqual(['PUSH /hu/mod/s21', 'REPLACE /hu/mod/s21#12.4']);
      expect(requests).toHaveLength(1);
    });

    it('an encoded value (accent, space, @) through a loading navigation and a batch on top: the values hold, and the target is the store\'s string', async () => {
      const { loader, requests, open } = gate();
      const { router } = setup('/hu/egyh%C3%A1z/s19', { kind, loader, path: INDEPENDENT_VARIANT });
      await act(async () => write({ task: 'tört a@b~c', q: 'x y' }));
      expect(router.state.navigation.state).toBe('loading');
      expect(router.state.navigation.location?.pathname).toBe('/hu/egyh%C3%A1z/t%C3%B6rt%20a@b~c');
      expect(seen.values).toMatchObject({ task: 'tört a@b~c', q: 'x y' });
      await act(async () => write({ variant: 'old' }));
      expect(requests).toHaveLength(2);
      expect(requests[0].signal.aborted).toBe(true);
      expect(seen.values).toMatchObject({ variant: 'old', task: 'tört a@b~c', q: 'x y' });
      await act(async () => open());
      await idle(router);
      expect(router.state.location.pathname).toBe('/hu/egyh%C3%A1z/old/t%C3%B6rt%20a@b~c');
      expect(seen.values).toMatchObject({ variant: 'old', task: 'tört a@b~c', q: 'x y' });
      if (kind === 'browser') expect(window.location.pathname).toBe('/hu/egyh%C3%A1z/old/t%C3%B6rt%20a@b~c');
    });
  });
});

describe('the store under a memory router only', () => {
  it('a bare # is no fragment: it reads absent, removing it changes nothing, and a write replaces it', async () => {
    const { navigations, url } = setup('/hu/mod/s19#');
    expect(seen.values.at).toBeUndefined();
    await act(async () => write({ at: undefined }));
    expect(navigations).toEqual([]);
    await act(async () => write({ at: '1' }));
    expect(url()).toBe('/hu/mod/s19#1');
  });

  it('an address typed raw reads decoded, and keeps its base as it was typed', async () => {
    const { url } = setup('/hu/egyház/a@b');
    expect(seen.values.task).toBe('a@b');
    await act(async () => write({ task: 'tört' }));
    expect(url()).toBe('/hu/egyház/t%C3%B6rt');
    expect(seen.values.task).toBe('tört');
  });

  it('an address may hold what a write would refuse: a write that does not change the path does not look at it', async () => {
    const { url } = setup('/hu/mod/%2E%2E');
    expect(seen.values.task).toBe('..');
    await act(async () => write({ q: 'x', at: '1' }));
    expect(url()).toBe('/hu/mod/%2E%2E?q=x#1');
    await act(async () => write({ task: '..' }));
    expect(url()).toBe('/hu/mod/%2E%2E?q=x#1');
    expect(warn).not.toHaveBeenCalled();
    await act(async () => write({ task: 's20' }));
    expect(url()).toBe('/hu/mod/s20?q=x');
  });
});

describe('the store under a plain <BrowserRouter> + <Routes>', () => {
  function setupPlain(entry: string, basename?: string) {
    window.history.replaceState(null, '', entry);
    const element = <ReactRouterArgStore path={PATH} fragment={AT}><Probe /><Page /></ReactRouterArgStore>;
    render(
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path=":lang/:module/*" element={element} />
          <Route path="start" element={null} />
          <Route path="about/us" element={null} />
        </Routes>
      </BrowserRouter>,
    );
    return () => window.location.pathname + window.location.search + window.location.hash;
  }

  it('reads, writes and links, one navigation across path, query and fragment, the page kept', async () => {
    const url = setupPlain('/hu/egyh%C3%A1z/s19?keep=1');
    expect(seen.values.task).toBe('s19');
    act(() => seen.setKept('changed'));
    const href = hrefFor({ task: 'tört a@b', q: 'x', at: '12.4' });
    const length = window.history.length;
    await act(async () => write({ task: 'tört a@b', q: 'x', at: '12.4' }, 'push'));
    expect(url()).toBe('/hu/egyh%C3%A1z/t%C3%B6rt%20a@b?keep=1&q=x#12.4');
    expect(href).toBe(url());
    expect(window.history.length).toBe(length + 1);
    expect(seen.values).toMatchObject({ task: 'tört a@b', q: 'x', at: '12.4' });
    expect(mounts).toBe(1);
    expect(screen.getByTestId('page').textContent).toBe('changed');
  });

  it('.. is refused: nothing reaches the router', async () => {
    const url = setupPlain('/hu/mod/s19');
    await act(async () => write({ task: '..' }));
    expect(url()).toBe('/hu/mod/s19');
    expect(seen.values.task).toBe('s19');
    expectWarningAbout('task');
  });

  it('a basename', async () => {
    const url = setupPlain('/app/hu/mod/s19', '/app');
    expect(seen.values.task).toBe('s19');
    expect(hrefFor({ task: 's20' })).toBe('/app/hu/mod/s20');
    await act(async () => write({ task: 's20' }));
    expect(url()).toBe('/app/hu/mod/s20');
  });

  it('a navigation from outside in the same tick: the task lands on top of it', async () => {
    const url = setupPlain('/hu/mod/s19');
    await act(async () => {
      seen.navigate('/en/masik/x?k=1');
      write({ task: 's20' });
    });
    expect(url()).toBe('/en/masik/s20?k=1');
    expect(seen.values.task).toBe('s20');
  });

  it('a navigation from outside in the same tick that leaves for a shorter path: the path change is dropped with a warning, the rest lands', async () => {
    const url = setupPlain('/hu/mod/s19');
    await act(async () => {
      seen.navigate('/start');
      write({ task: 's20', q: 'y' });
    });
    expect(url()).toBe('/start?q=y');
    expectWarningAbout('task');
  });

  it('there too, a key the dropped path change would have removed stays', async () => {
    const url = setupPlain('/hu/mod/s19?toc=a');
    await act(async () => {
      seen.navigate('/start?toc=1');
      write({ task: 's20', q: 'y' });
    });
    expect(url()).toBe('/start?toc=1&q=y');
    expectWarningAbout('task');
  });

  it('the known limit: without a data router it cannot tell that a route as deep as its own is another route, so the path change lands below it', async () => {
    const url = setupPlain('/hu/mod/s19');
    await act(async () => {
      seen.navigate('/about/us');
      write({ task: 's20' });
    });
    expect(url()).toBe('/about/us/s20');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('the store under a plain <MemoryRouter> + <Routes>', () => {
  it('reads, writes and links', async () => {
    const element = <ReactRouterArgStore path={PATH} fragment={AT}><Probe /></ReactRouterArgStore>;
    render(
      <MemoryRouter initialEntries={['/hu/egyház/s19']}>
        <Routes>
          <Route path=":lang/:module/*" element={element} />
        </Routes>
      </MemoryRouter>,
    );
    expect(seen.values.task).toBe('s19');
    expect(hrefFor({ variant: 'modern' })).toBe('/hu/egyház/modern');
    await act(async () => write({ task: 's20', variant: 'modern' }));
    expect(seen.values).toMatchObject({ variant: 'modern', task: 's20' });
    expect(hrefFor({ at: '1' })).toBe('/hu/egyház/modern/s20#1');
  });
});

describe('the store under a hash router', () => {
  it('the path inside the hash, the fragment after it', async () => {
    window.history.replaceState(null, '', '/#/hu/mod/s19');
    const element = <ReactRouterArgStore path={PATH} fragment={AT}><Probe /></ReactRouterArgStore>;
    const router = createHashRouter([{ path: ':lang/:module/*', element }]);
    disposers.push(() => router.dispose());
    render(<RouterProvider router={router} />);
    expect(seen.values.task).toBe('s19');
    expect(hrefFor({ task: 'a b', at: '12.4' })).toBe('#/hu/mod/a%20b#12.4');
    expect(hrefFor({ q: 'x' })).toBe('#/hu/mod/s19?q=x');
    await act(async () => write({ task: 's20~modern', at: '12.4' }));
    expect(window.location.hash).toBe('#/hu/mod/s20~modern#12.4');
    expect(seen.values).toMatchObject({ task: 's20~modern', at: '12.4' });
  });
});

describe('placement', () => {
  function renderingThrows(element: ReactNode): string {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(element);
    } catch (thrown) {
      return (thrown as Error).message;
    } finally {
      error.mockRestore();
    }
    return 'it did not throw';
  }

  it('a `path` outside any route throws', () => {
    const message = renderingThrows(<MemoryRouter><ReactRouterArgStore path={PATH} /></MemoryRouter>);
    expect(message).toMatch(/`path`.*route/);
  });

  it('a `path` in a route whose pattern does not end in * throws, naming the pattern', () => {
    const message = renderingThrows(
      <MemoryRouter initialEntries={['/a/b']}>
        <Routes>
          <Route path="/a/:b" element={<ReactRouterArgStore path={PATH} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(message).toMatch(/`path`.*'\/a\/:b'.*\*/);
  });

  it('a `path` in a route without a pattern of its own throws', () => {
    const message = renderingThrows(
      <MemoryRouter initialEntries={['/a']}>
        <Routes>
          <Route element={<ReactRouterArgStore path={PATH} />}>
            <Route path="/a" element={null} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(message).toMatch(/`path`.*\*/);
  });

  it('the fragment\'s key also being a token\'s key throws, naming it', () => {
    const message = renderingThrows(
      <MemoryRouter initialEntries={['/a/b']}>
        <Routes>
          <Route path="/a/*" element={<ReactRouterArgStore path={PATH} fragment={TASK} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(message).toMatch(/'task'/);
  });

  it('a list of tokens that cannot work throws in the render', () => {
    const message = renderingThrows(
      <MemoryRouter initialEntries={['/a/b']}>
        <Routes>
          <Route path="/a/*" element={<ReactRouterArgStore path={[rest(TASK), token(SECTION)]} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(message).toMatch(/'task' must be the last/);
  });

  it('with `fragment` alone the store can sit anywhere, and the path stays', async () => {
    render(
      <MemoryRouter initialEntries={['/m/x?q=1#12.4']}>
        <ReactRouterArgStore fragment={AT}><Probe /></ReactRouterArgStore>
      </MemoryRouter>,
    );
    expect(seen.values).toMatchObject({ at: '12.4', q: '1' });
    expect(hrefFor({ at: '2' })).toBe('/m/x?q=1#2');
    await act(async () => write({ at: 'a b', q: '2' }));
    expect(seen.values).toMatchObject({ at: 'a b', q: '2' });
    expect(hrefFor({ at: undefined })).toBe('/m/x?q=2');
  });

  it('with neither prop every key is in the query, whatever it is called, and nothing is dropped', async () => {
    const router = createMemoryRouter(
      [{ path: '/m/:id', element: <ReactRouterArgStore><Probe /></ReactRouterArgStore> }],
      { initialEntries: ['/m/1?toc=a#12.4'] },
    );
    disposers.push(() => router.dispose());
    render(<RouterProvider router={router} />);
    expect(seen.values).toMatchObject({ task: undefined, at: undefined, toc: 'a' });
    await act(async () => write({ task: 'x', at: 'y' }));
    expect(createPath(router.state.location)).toBe('/m/1?toc=a&task=x&at=y#12.4');
    expect(seen.values).toMatchObject({ task: 'x', at: 'y', toc: 'a' });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('a vanishing token\'s allowed values from the field context', () => {
  const OF_CONTEXT: OneOfDefinition = {
    kind: 'oneOf',
    id: 'variant',
    choices: (ctx: { variants: string[] }) => ctx.variants.map((value) => ({ value })),
  };

  /** Reads through the store alone, and a static element: only the store's notification re-renders it. */
  function Reader() {
    const variant = useRaw(useRouterArgStore(), 'variant');
    return <span data-testid="variant">{variant ?? '-'}</span>;
  }
  const READER = <Reader />;

  function tree(variants: string[]) {
    return (
      <FieldContextProvider value={{ variants }}>
        <MemoryRouter initialEntries={['/hu/mod/modern/s19']}>
          <Routes>
            <Route
              path=":lang/:module/*"
              element={<ReactRouterArgStore path={[vanishing(OF_CONTEXT), rest(TASK)]}>{READER}<Probe /></ReactRouterArgStore>}
            />
          </Routes>
        </MemoryRouter>
      </FieldContextProvider>
    );
  }

  it('a function of the context is resolved with the store\'s field context', async () => {
    render(tree(['modern', 'old']));
    expect(seen.values).toMatchObject({ variant: 'modern', task: 's19' });
    await act(async () => write({ variant: 'nope' }));
    expectWarningAbout('variant');
    await act(async () => write({ variant: 'old' }));
    expect(seen.values).toMatchObject({ variant: 'old', task: undefined });
  });

  it('when the context changes what is allowed, the same address reads differently, and readers hear of it', () => {
    const { rerender } = render(tree(['old']));
    expect(seen.values).toMatchObject({ variant: undefined, task: 'modern/s19' });
    expect(screen.getByTestId('variant').textContent).toBe('-');
    rerender(tree(['modern', 'old']));
    expect(seen.values).toMatchObject({ variant: 'modern', task: 's19' });
    expect(screen.getByTestId('variant').textContent).toBe('modern');
  });

  function throwsWith(definition: OneOfDefinition, wrap: (element: ReactNode) => ReactNode): string {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const element = <ReactRouterArgStore path={[vanishing(definition), rest(TASK)]} />;
      render(wrap(
        <MemoryRouter initialEntries={['/hu/mod']}>
          <Routes>
            <Route path=":lang/:module/*" element={element} />
          </Routes>
        </MemoryRouter>,
      ));
    } catch (thrown) {
      return (thrown as Error).message;
    } finally {
      error.mockRestore();
    }
    return 'it did not throw';
  }

  it('ctx.values is not available there: the error names the field and the option', () => {
    const ofValues: OneOfDefinition = {
      kind: 'oneOf',
      id: 'variant',
      choices: (ctx: { values: Record<string, string> }) => [{ value: ctx.values.other }],
    };
    const message = throwsWith(ofValues, (element) => <FieldContextProvider value={{}}>{element}</FieldContextProvider>);
    expect(message).toBe("Field 'variant': option 'choices': ctx.values is only available inside a field group");
  });

  it('a function of the context without a provider: the error names the field and the option', () => {
    expect(throwsWith(OF_CONTEXT, (element) => element)).toBe("Field 'variant': option 'choices' is a function of the field context, but no FieldContextProvider is above it");
  });

  it('a function without parameters needs no provider', () => {
    const plain: OneOfDefinition = { kind: 'oneOf', id: 'variant', choices: () => [{ value: 'modern' }] };
    expect(throwsWith(plain, (element) => element)).toBe('it did not throw');
  });
});
