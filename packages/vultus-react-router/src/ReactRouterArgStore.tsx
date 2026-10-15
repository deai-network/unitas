import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
// The UNSAFE_ contexts (read only for the router's current location and a data router's
// navigation in flight, see `now` below) carry no semver promise; their shape was checked against
// react-router 7.0, 7.18 and 8.4, hence the peer range `>=7 <9`.
import {
  UNSAFE_DataRouterContext, UNSAFE_NavigationContext, useHref, useLocation, useNavigate,
  type Location, type NavigateFunction, type Path,
} from 'react-router';
import { ArgStoreProvider, type ArgStore, type RawChange, type UpdateMethod } from 'vultus-core';
import { applyChanges, readQuery, writeQuery } from './query.js';

/** A location in `useLocation`'s terms (the basename stripped), with its history state. */
type Place = Path & { state: unknown };

/**
 * Where the router is now: the location object it reports (`at`), and that location as a Place.
 * A data router's `state.location` and a memory history's `location` are the same object while
 * the router has not moved. A browser or hash history's `location` getter builds a new object on
 * every access, so there `at` never matches an earlier one — which is right for them: their
 * navigations are synchronous (no loaders), so the location read now already includes the store's
 * own last navigation.
 *
 * `rendered` says whether that location is the one the store last rendered (a data router
 * renders its updates later, in a transition), and `preventScrollReset` is a data router's
 * choice for the navigation that brought it there (`true` for other routers, which have no
 * `<ScrollRestoration>`).
 *
 * `loading` is a data router's navigation in flight (loading or submitting; the router's location
 * stays where it was until it completes): where it goes (`to`, `undefined` outside the basename),
 * and `settled(then)`, which calls `then` once, when the router is idle again.
 */
interface RouterNow {
  at: object;
  path: Place;
  rendered: boolean;
  preventScrollReset: boolean;
  loading?: { to: Path | undefined; settled(then: () => void): void };
}

function samePath(a: Path, b: Path): boolean {
  return a.pathname === b.pathname && a.search === b.search && a.hash === b.hash;
}

/** `pathname` without the router's basename, as `<Router>` strips it for `useLocation`; `undefined` when it lies outside the basename. */
function stripBasename(pathname: string, basename: string): string | undefined {
  if (basename === '/') return pathname;
  if (!pathname.toLowerCase().startsWith(basename.toLowerCase())) return undefined;
  const start = basename.endsWith('/') ? basename.length - 1 : basename.length;
  const next = pathname.charAt(start);
  if (next !== '' && next !== '/') return undefined;
  return pathname.slice(start) || '/';
}

/** The last of `changes` for `key`, if any. */
function lastChangeOf(changes: readonly RawChange[] | undefined, key: string): RawChange | undefined {
  if (changes === undefined) return undefined;
  for (let i = changes.length - 1; i >= 0; i -= 1) if (changes[i].key === key) return changes[i];
  return undefined;
}

/**
 * The ArgStore behind `<ReactRouterArgStore>`, one per component instance. The component hands it
 * what each render sees; `read` and `hrefFor` answer from the location of the latest render, with
 * the store's own writes that it does not show yet laid over it (see `read`).
 */
class RouterArgStore implements ArgStore {
  location!: Location;
  navigate!: NavigateFunction;
  /** `useHref` of the current path: the start of `hrefFor`'s links (`#/…` under a hash router, with the basename). */
  pathHref!: string;
  now!: () => RouterNow;
  /**
   * Calls `listener` on every change of a data router's state, until the returned function is
   * called; `undefined` under the other routers, whose navigations are made at once and cannot
   * be blocked.
   */
  follow: ((listener: () => void) => () => void) | undefined;

  /**
   * This store's last navigation while it has not rendered: where the router was when it was
   * made, its target, and the store's own changes the target carries that the rendered location
   * does not show (its batch's, after those of the store's navigations before it that had not
   * rendered either).
   */
  private navigated: { from: object; to: Place; changes: RawChange[] } | undefined;
  private batch: { changes: RawChange[]; push: boolean } | undefined;
  private readonly listeners = new Set<() => void>();
  private parsed = { search: '', query: new Map<string, string>() };
  /** Stops following a data router for the store's navigation (see `follow`). */
  private unfollow: (() => void) | undefined;

  /**
   * The key's raw value as the store's own writes left it: the batch not yet applied, then the
   * store's navigation that has not rendered yet (react-router renders it in a transition, and a
   * data router first runs its loaders), then the rendered location. So a widget that writes
   * reads its value back at once — a controlled input keeps its caret, a slider does not jump
   * back. The navigation's values go when its location renders, or when it will not: blocked,
   * cancelled, redirected, or overtaken by a navigation from outside, which wins.
   */
  read(key: string): string | undefined {
    const own = lastChangeOf(this.batch?.changes, key) ?? lastChangeOf(this.navigated?.changes, key);
    if (own !== undefined) return own.raw;
    const { search } = this.location;
    if (search !== this.parsed.search) this.parsed = { search, query: readQuery(search) };
    return this.parsed.query.get(key);
  }

  /**
   * Collects the changes of the current tick and notifies the subscribers at once (they read the
   * changes back, see `read`); a microtask applies them as one navigation, a push if any write
   * asked for one. While the batch waits for a navigation from outside (see `flush`), later
   * writes join it.
   */
  write(changes: RawChange[], method: UpdateMethod): void {
    if (this.batch === undefined) {
      this.batch = { changes: [], push: false };
      queueMicrotask(() => this.flush());
    }
    this.batch.changes.push(...changes);
    if (method === 'push') this.batch.push = true;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The rendered location's path and hash with its query changed: the store's own writes it does not show yet (as `read` has them), then `changes`. */
  hrefFor(changes: RawChange[]): string {
    const own = [...(this.navigated?.changes ?? []), ...(this.batch?.changes ?? [])];
    return this.pathHref + applyChanges(this.location.search, [...own, ...changes]) + this.location.hash;
  }

  /**
   * A new location has rendered; subscribers that did not re-render with it re-read. If it is
   * the target of the store's navigation, that navigation is done; if the router is still on
   * its way there (the location is one the router passed through first: a navigation from
   * outside the store's builds on, which renders before it), the store keeps standing in for
   * it; anywhere else, a navigation from outside has won.
   */
  rendered(): void {
    if (this.navigated !== undefined && (samePath(this.location, this.navigated.to) || !this.headingTo(this.navigated.to))) {
      this.landed();
    }
    this.notify();
  }

  /** Stops following the router, when the component goes. */
  dispose(): void {
    this.landed();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** Whether the router is at `to` (its location there, not rendered yet) or loading a navigation there. */
  private headingTo(to: Path): boolean {
    const now = this.now();
    return samePath(now.path, to) || (now.loading?.to !== undefined && samePath(now.loading.to, to));
  }

  /** The store's navigation is over (rendered, or it will not render): its values go. */
  private landed(): void {
    this.navigated = undefined;
    this.unfollow?.();
    this.unfollow = undefined;
  }

  /**
   * Under a data router, a navigation of the store's may never render: a blocker blocks it, a
   * navigation from outside cancels it (or overtakes it before it renders), a loader redirects
   * it. Each of those changes the router's state, so the store follows it while it has a
   * navigation on the way, and lets the navigation's values go once the router is neither at
   * its target nor loading it — notifying, so the location shows again.
   */
  private followRouter(): void {
    if (this.unfollow !== undefined || this.follow === undefined) return;
    this.unfollow = this.follow(() => {
      if (this.navigated === undefined || this.headingTo(this.navigated.to)) return;
      this.landed();
      this.notify();
    });
  }

  /**
   * Applies the batch on top of the latest location — not the rendered one, which lags behind
   * the router while its update renders (react-router renders in a transition): the router's
   * own location, or this store's last navigation while the router has not moved since (a
   * navigation still loading). The path, the hash and every other parameter are kept, and a
   * replace keeps the entry's history state.
   *
   * While a navigation that is not this store's own is loading, applying the batch would cancel
   * it (a navigation interrupts the one in flight), and the router's location does not show it
   * yet. So the batch waits, collecting the writes made meanwhile, until the router is idle, and
   * is then applied where the router settled: that navigation's target, wherever a redirect took
   * it, or where the router stayed if it was cancelled. The flush after it goes in a microtask,
   * not inside the router's notification, which is still completing the navigation.
   */
  private flush(): void {
    const now = this.now();
    const { loading } = now;
    const ownLoading = loading?.to !== undefined && this.navigated !== undefined && samePath(loading.to, this.navigated.to);
    if (loading !== undefined && !ownLoading) {
      loading.settled(() => queueMicrotask(() => this.flush()));
      return;
    }
    const { changes, push } = this.batch!;
    this.batch = undefined;
    const onOwn = this.navigated !== undefined && this.navigated.from === now.at;
    const base = onOwn ? this.navigated!.to : now.path;
    const search = applyChanges(base.search, changes);
    if (search === writeQuery(new URLSearchParams(base.search))) {
      // Nothing to navigate: the batch's values are the base's already. Whatever still stood in
      // for them goes (the rendered location may not show the base yet, so subscribers re-read).
      this.notify();
      return;
    }
    // A replace stands in for the same history entry, so it keeps that entry's state; a push starts a new one.
    const state = push ? undefined : base.state;
    const to: Path = { pathname: base.pathname, search, hash: base.hash };
    // The store's earlier navigation that has not rendered stays shown only if this one builds on it.
    const carried = this.navigated !== undefined && samePath(base, this.navigated.to) ? this.navigated.changes : [];
    this.navigated = { from: now.at, to: { ...to, state }, changes: [...carried, ...changes] };
    this.followRouter();
    // Only the query changes, so on top of the rendered location the page stays where it was
    // scrolled (<ScrollRestoration> would scroll to the top otherwise). On top of a location that
    // has not rendered yet, the navigations since the last render render as one and
    // <ScrollRestoration> sees only the last one's flag, so this one carries over the router's
    // choice for the navigation that brought it there: a navigation from outside keeps its scroll
    // to the top (a new page still opens at the top), the store's own already passed `true`. That
    // holds on top of the store's own navigation still loading too: the router has not moved
    // since it was made, so its location and flag are still the ones that navigation built on.
    const preventScrollReset = now.rendered || now.preventScrollReset;
    void this.navigate(to, { replace: !push, state, preventScrollReset });
  }
}

const RouterArgStoreContext = createContext<RouterArgStore | undefined>(undefined);

/**
 * Provides an ArgStore over the router's location: argument values live in the query
 * (`location.search`; with a hash router, the query inside the hash). Place it inside the
 * router, around the routes that store arguments. Outside a router it throws.
 */
export function ReactRouterArgStore({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathHref = useHref({ pathname: location.pathname });
  // The router's current location: a data router's state, or the history a <MemoryRouter>,
  // <BrowserRouter> or <HashRouter> navigates through; and a data router's navigation in flight.
  // Read only when a batch is applied.
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const { navigator, basename } = useContext(UNSAFE_NavigationContext);
  const [store] = useState(() => new RouterArgStore());

  store.location = location;
  store.navigate = navigate;
  store.pathHref = pathHref;
  store.follow = dataRouter === null || dataRouter === undefined ? undefined : (listener) => dataRouter.router.subscribe(() => listener());
  store.now = () => {
    const at = dataRouter?.router.state.location ?? (navigator as { location?: Location }).location;
    const pathname = at === undefined ? undefined : stripBasename(at.pathname, basename);
    const preventScrollReset = dataRouter?.router.state.preventScrollReset ?? true;
    const now: RouterNow = at !== undefined && pathname !== undefined
      ? { at, path: { pathname, search: at.search, hash: at.hash, state: at.state }, rendered: at.key === location.key, preventScrollReset }
      : { at: location, path: location, rendered: true, preventScrollReset };
    const router = dataRouter?.router;
    const navigation = router?.state.navigation;
    if (router !== undefined && navigation !== undefined && navigation.state !== 'idle') {
      const target = navigation.location;
      const targetPathname = stripBasename(target.pathname, basename);
      now.loading = {
        to: targetPathname === undefined ? undefined : { pathname: targetPathname, search: target.search, hash: target.hash },
        settled(then) {
          const unsubscribe = router.subscribe((state) => {
            if (state.navigation.state !== 'idle') return;
            unsubscribe();
            then();
          });
        },
      };
    }
    return now;
  };

  useLayoutEffect(() => store.rendered(), [store, location]);
  useLayoutEffect(() => () => store.dispose(), [store]);

  return (
    <RouterArgStoreContext.Provider value={store}>
      <ArgStoreProvider store={store}>{children}</ArgStoreProvider>
    </RouterArgStoreContext.Provider>
  );
}

/** The store the nearest `<ReactRouterArgStore>` provides, for code that wants it directly (an `ArgStoreProvider` in between does not hide it). */
export function useRouterArgStore(): ArgStore {
  const store = useContext(RouterArgStoreContext);
  if (store === undefined) throw new Error('No ReactRouterArgStore is above this component');
  return store;
}
