import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
// The UNSAFE_ contexts (read only for the router's current location and a data router's
// navigation in flight, see `now` below, and for the route the store sits in) carry no semver
// promise; their shape was checked against react-router 7.0, 7.18 and 8.4, hence the peer range
// `>=7 <9`.
import {
  UNSAFE_DataRouterContext, UNSAFE_NavigationContext, UNSAFE_RouteContext, useHref, useLocation, useNavigate,
  type Location, type NavigateFunction, type Path,
} from 'react-router';
import { ArgStoreProvider, useFieldContext, type ArgStore, type RawChange, type UpdateMethod } from 'vultus-core';
import {
  buildPath, decodeSegment, encodeSegment, goingElsewhere, joinPath, keyOf, readPath, resolveTokens, splitPath, withChanges,
  type PathDefinition, type PathRefusal, type PathToken, type ResolvedPathToken,
} from './pathTokens.js';
import { applyChanges, readQuery, writeQuery } from './query.js';

/** A location in `useLocation`'s terms (the basename stripped), with its history state. */
type Place = Path & { state: unknown };

/** A change as the store keeps it. `implied`: no write named it, it is a removal that follows from going somewhere else. */
type OwnChange = RawChange & { implied?: true };

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
 * `depth` is how many of `path`'s segments the route the store sits in holds (the tokens' are those
 * below them): a data router's own match of that route, as it can have moved since the store
 * rendered, and `undefined` when it has left the route. Other routers cannot say, so there it is
 * the depth the store rendered with (see `cutAtRoute`).
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
  depth: number | undefined;
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

/** A location's hash as the fragment's raw value; `undefined` without one. */
function fragmentOf(hash: string): string | undefined {
  return hash.length > 1 ? decodeSegment(hash.slice(1)) : undefined;
}

/**
 * `pathname` cut where the store's route ends: the route's part as the location has it, and the
 * decoded segments below it; `undefined` if it is too short to hold the route. It goes by counting
 * `depth` segments, not by the route's `pathnameBase` as a prefix: a browser router encodes that
 * and a memory router does not, while the location may be either.
 */
function cutAtRoute(pathname: string, depth: number): { stem: string; below: string[] } | undefined {
  const parts = pathname.split('/').filter((part) => part !== '');
  if (parts.length < depth) return undefined;
  return { stem: `/${parts.slice(0, depth).join('/')}`, below: parts.slice(depth).map(decodeSegment) };
}

function warnRefused({ key, reason }: PathRefusal): void {
  console.warn(`Argument '${key}': ${reason}`);
}

/** The store `useRouterArgStore` gives: an ArgStore that also says what the rendered location holds. */
export interface RouterArgStore extends ArgStore {
  /**
   * The key's raw value in the location of the latest render, a path, query or fragment key alike,
   * without the store's own writes that it does not show yet: `read` is this with those laid over
   * it. So a page can tell that the store is ahead of what the router has rendered.
   */
  readRendered(key: string): string | undefined;
}

/**
 * The ArgStore behind `<ReactRouterArgStore>`, one per component instance. The component hands it
 * what each render sees; `read` and `hrefFor` answer from the location of the latest render, with
 * the store's own writes that it does not show yet laid over it (see `read`).
 */
class RouterArgStoreImpl implements RouterArgStore {
  location!: Location;
  navigate!: NavigateFunction;
  /** `useHref` of the current path: the start of `hrefFor`'s links (`#/…` under a hash router, with the basename). */
  pathHref!: string;
  /** The same for another path, which a hook cannot be asked for in a store's method. */
  pathHrefOf!: (pathname: string) => string;
  /** The `path` prop's tokens, their allowed values resolved in this render; none without the prop. */
  tokens: readonly ResolvedPathToken[] = [];
  /** The key the `fragment` prop keeps in the hash. */
  fragmentKey: string | undefined;
  /** How many segments of the rendered location the store's route holds (see `RouterNow`). */
  depth = 0;
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
  private navigated: { from: object; to: Place; changes: OwnChange[] } | undefined;
  private batch: { changes: OwnChange[]; push: boolean } | undefined;
  private readonly listeners = new Set<() => void>();
  private parsed = { search: '', query: new Map<string, string>() };
  private parsedPath: { pathname: string; tokens: readonly ResolvedPathToken[]; values: Map<string, string> } | undefined;
  /** What the hooks told of the keys: whether each is permanent. */
  private readonly permanence = new Map<string, boolean>();
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
    return own !== undefined ? own.raw : this.readRendered(key);
  }

  readRendered(key: string): string | undefined {
    if (key === this.fragmentKey) return fragmentOf(this.location.hash);
    if (this.isToken(key)) return this.renderedTokens().get(key);
    const { search } = this.location;
    if (search !== this.parsed.search) this.parsed = { search, query: readQuery(search) };
    return this.parsed.query.get(key);
  }

  /**
   * Collects the changes of the current tick, with the removals they imply (see `expanded`), and
   * notifies the subscribers at once (they read the changes back, see `read`); a microtask applies
   * them as one navigation, a push if any write asked for one. While the batch waits for a
   * navigation from outside (see `flush`), later writes join it. A write the path cannot represent
   * is refused whole: no change is kept, nobody is notified, the console says why.
   */
  write(changes: RawChange[], method: UpdateMethod): void {
    const accepted = this.expanded(changes);
    if (accepted === undefined) return;
    if (this.batch === undefined) {
      this.batch = { changes: [], push: false };
      queueMicrotask(() => this.flush());
    }
    this.batch.changes.push(...accepted);
    if (method === 'push') this.batch.push = true;
    this.notify();
  }

  /** Idempotent, notifies nobody: only a change of a path token asks (see `expanded`). */
  declare(key: string, { permanent }: { permanent: boolean }): void {
    this.permanence.set(key, permanent);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * The rendered location with the store's own writes it does not show yet (as `read` has them),
   * then `changes` with what they imply, as a write has them. Changes the path cannot represent
   * leave them out, with the warning a write gives: the current href, not a broken link.
   */
  hrefFor(changes: RawChange[]): string {
    const own = [...(this.navigated?.changes ?? []), ...(this.batch?.changes ?? [])];
    const { to } = this.applied(this.location, [...own, ...(this.expanded(changes) ?? [])], this.depth);
    const start = to.pathname === this.location.pathname ? this.pathHref : this.pathHrefOf(to.pathname);
    return start + to.search + to.hash;
  }

  /**
   * A new location has rendered, or the same one reads differently (the field context changed a
   * token's allowed values); subscribers that did not re-render with it re-read. If it is
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

  private isToken(key: string): boolean {
    return this.tokens.some((t) => t.key === key);
  }

  /** The tokens' values in the rendered location; parsed anew with a new location or a new render's tokens. */
  private renderedTokens(): Map<string, string> {
    const { pathname } = this.location;
    if (this.parsedPath?.pathname !== pathname || this.parsedPath.tokens !== this.tokens) {
      const values = readPath(this.tokens, cutAtRoute(pathname, this.depth)?.below ?? []);
      this.parsedPath = { pathname, tokens: this.tokens, values };
    }
    return this.parsedPath.values;
  }

  /**
   * `changes` as the store keeps them, decided here so that `read`, `hrefFor` and the batch all see
   * the same; `undefined` when the path cannot represent them (the console says why). An empty
   * value has no place in a path or a fragment, so there it is removal.
   *
   * Only a change of a token's value looks at the path at all: other writes keep it whatever it
   * holds, a typed address that no write could make too. A change of a token that is not
   * `independent` is going somewhere else, which also removes the tokens after it, and the query
   * keys and the fragment declared non-permanent (a key never declared stays: its hook may just
   * not be mounted), except what `changes` name. What is removed is what the store reads now, so a
   * pending change of its own goes too.
   */
  private expanded(changes: readonly RawChange[]): OwnChange[] | undefined {
    const normalized = changes.map((change) => (
      change.raw === '' && (this.isToken(change.key) || change.key === this.fragmentKey) ? { key: change.key, raw: undefined } : change
    ));
    const { tokens } = this;
    const current = new Map(tokens.map((t) => [t.key, this.read(t.key)]));
    const next = withChanges(current, normalized);
    if (tokens.every((t) => current.get(t.key) === next.get(t.key))) return normalized;
    const { elsewhere, removals } = goingElsewhere(tokens, current, normalized);
    const built = buildPath(tokens, withChanges(current, [...normalized, ...removals]));
    if ('refused' in built) {
      warnRefused(built.refused);
      return undefined;
    }
    if (!elsewhere) return normalized;
    const named = new Set(normalized.map((change) => change.key));
    const dropped = [...this.permanence]
      .filter(([key, permanent]) => !permanent && !named.has(key) && !this.isToken(key) && this.read(key) !== undefined)
      .map(([key]) => ({ key, raw: undefined, implied: true as const }));
    return [...normalized, ...removals, ...dropped];
  }

  /**
   * `pathname` with the tokens' values in `changes` applied, `route` being where it is cut at the
   * store's route, if it holds that. It stays as it is, with any stray segment and however it was
   * typed, if no token's value changes in it. What cannot be built there is refused: the write was
   * checked against what the store read, but `pathname` may be where a navigation from outside
   * went since.
   */
  private rebuilt(
    pathname: string,
    route: ReturnType<typeof cutAtRoute>,
    changes: readonly RawChange[],
  ): { pathname: string } | { refused: PathRefusal } {
    const here = route === undefined ? new Map<string, string>() : readPath(this.tokens, route.below);
    const next = withChanges(here, changes);
    const changed = this.tokens.find((t) => here.get(t.key) !== next.get(t.key));
    if (changed === undefined) return { pathname };
    if (route === undefined) return { refused: { key: changed.key, reason: 'cannot be written: the router has left the route of the store' } };
    const built = buildPath(this.tokens, next);
    return 'refused' in built ? built : { pathname: joinPath(route.stem, built.segments) };
  }

  /**
   * `base` with `changes` applied: a token's to the pathname, the fragment's to the hash, every
   * other key's to the query; `kept` is the changes that did apply. If the tokens' no longer fit
   * `base` (they are dropped with a warning), or `base` lies outside the store's route, the store
   * has not gone somewhere else: the removals that implied go with them, and what the writes named
   * still applies.
   */
  private applied(base: Path, changes: readonly OwnChange[], depth: number | undefined): { to: Path; kept: readonly OwnChange[] } {
    const route = depth === undefined ? undefined : cutAtRoute(base.pathname, depth);
    const built = this.rebuilt(base.pathname, route, changes);
    if ('refused' in built) warnRefused(built.refused);
    const stayed = route === undefined || 'refused' in built;
    const kept = stayed ? changes.filter(({ key, implied }) => !this.isToken(key) && implied !== true) : changes;
    const pathname = 'refused' in built ? base.pathname : built.pathname;
    const query = kept.filter(({ key }) => !this.isToken(key) && key !== this.fragmentKey);
    const fragment = this.fragmentKey === undefined ? undefined : lastChangeOf(kept, this.fragmentKey);
    let { hash } = base;
    if (fragment !== undefined && fragment.raw !== fragmentOf(hash)) hash = fragment.raw === undefined ? '' : `#${encodeSegment(fragment.raw)}`;
    return { to: { pathname, search: applyChanges(base.search, query), hash }, kept };
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
   * navigation still loading). What the batch does not change is kept, and a replace keeps the
   * entry's history state.
   *
   * While a navigation that is not this store's own is loading, applying the batch would cancel
   * it (a navigation interrupts the one in flight), and the router's location does not show it
   * yet. So the batch waits, collecting the writes made meanwhile, until the router is idle, and
   * is then applied where the router settled: that navigation's target, wherever a redirect took
   * it, or where the router stayed if it was cancelled. The flush after it goes in a microtask,
   * not inside the router's notification, which is still completing the navigation. Path changes
   * that no longer fit where it settled are dropped there, with the removals they implied (see
   * `applied`).
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
    const { to, kept } = this.applied(base, changes, now.depth);
    if (to.pathname === base.pathname && to.search === writeQuery(new URLSearchParams(base.search)) && to.hash === base.hash) {
      // Nothing to navigate: the batch's values are the base's already. Whatever still stood in
      // for them goes (the rendered location may not show the base yet, so subscribers re-read).
      this.notify();
      return;
    }
    // A replace stands in for the same history entry, so it keeps that entry's state; a push starts a new one.
    const state = push ? undefined : base.state;
    // The store's earlier navigation that has not rendered stays shown only if this one builds on it.
    const carried = this.navigated !== undefined && samePath(base, this.navigated.to) ? this.navigated.changes : [];
    this.navigated = { from: now.at, to: { ...to, state }, changes: [...carried, ...kept] };
    this.followRouter();
    // The app owns scrolling, so on top of the rendered location the page stays where it was
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

const RouterArgStoreContext = createContext<RouterArgStoreImpl | undefined>(undefined);

/**
 * Provides an ArgStore over the router's location: argument values live in the query
 * (`location.search`; with a hash router, the query inside the hash). Place it inside the
 * router, around the routes that store arguments. Outside a router it throws.
 *
 * `path` keeps arguments in the path too: the tokens (`token`, `vanishing`, `rest`) below the route
 * the store sits in, whose pattern must end in `*`; otherwise, or outside any route, it throws.
 * `fragment` is the definition of the one argument kept in `#…`. One `write` is one navigation
 * across all three, and changing a token that is not `independent` is going somewhere else (see
 * `expanded`). With neither prop, every key is in the query and nothing is ever dropped.
 */
export function ReactRouterArgStore({ path, fragment, children }: { path?: readonly PathToken[]; fragment?: PathDefinition; children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const pathHref = useHref({ pathname: location.pathname });
  // The router's current location: a data router's state, or the history a <MemoryRouter>,
  // <BrowserRouter> or <HashRouter> navigates through; and a data router's navigation in flight.
  // Read only when a batch is applied.
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const { navigator, basename } = useContext(UNSAFE_NavigationContext);
  // The route the store sits in, as rendered: the part of the path below it is the tokens'.
  const { matches, isDataRoute } = useContext(UNSAFE_RouteContext);
  const fieldContext = useFieldContext();
  const [store] = useState(() => new RouterArgStoreImpl());

  const route = matches[matches.length - 1];
  if (path !== undefined) {
    if (route === undefined) throw new Error("ReactRouterArgStore: with `path`, the store must sit in a route whose pattern ends in '*'; it sits in none");
    const pattern = route.route.path;
    if (!pattern?.endsWith('*')) {
      throw new Error(`ReactRouterArgStore: with \`path\`, the pattern of the store's route (${pattern === undefined ? 'none' : `'${pattern}'`}) must end in '*'`);
    }
  }
  const tokens = resolveTokens(path ?? [], fieldContext);
  const fragmentKey = fragment === undefined ? undefined : keyOf(fragment);
  if (tokens.some((t) => t.key === fragmentKey)) throw new Error(`ReactRouterArgStore: '${fragmentKey}' is both a path token and the fragment`);
  // What reads differently with the location unchanged, when the context changes a token's allowed values.
  const layout = JSON.stringify([fragmentKey, tokens.map((t) => [t.key, t.kind, ...(t.kind === 'vanishing' ? t.allowed : [])])]);

  store.location = location;
  store.navigate = navigate;
  store.pathHref = pathHref;
  // As useHref does: the basename joined in front, the history's own href (`#…` for a hash history).
  store.pathHrefOf = (pathname) => navigator.createHref({
    pathname: basename === '/' ? pathname : pathname === '/' ? basename : `${basename}/${pathname}`.replace(/\/{2,}/g, '/'),
  });
  store.tokens = tokens;
  store.fragmentKey = fragmentKey;
  store.depth = route === undefined ? 0 : splitPath(route.pathnameBase).length;
  store.follow = dataRouter === null || dataRouter === undefined ? undefined : (listener) => dataRouter.router.subscribe(() => listener());
  store.now = () => {
    const at = dataRouter?.router.state.location ?? (navigator as { location?: Location }).location;
    const pathname = at === undefined ? undefined : stripBasename(at.pathname, basename);
    const preventScrollReset = dataRouter?.router.state.preventScrollReset ?? true;
    const router = dataRouter?.router;
    const routeNow = isDataRoute ? router?.state.matches.find((match) => match.route.id === route?.route.id) : route;
    const depth = routeNow === undefined ? undefined : splitPath(routeNow.pathnameBase).length;
    const now: RouterNow = at !== undefined && pathname !== undefined
      ? { at, path: { pathname, search: at.search, hash: at.hash, state: at.state }, rendered: at.key === location.key, preventScrollReset, depth }
      : { at: location, path: location, rendered: true, preventScrollReset, depth };
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

  useLayoutEffect(() => store.rendered(), [store, location, layout]);
  useLayoutEffect(() => () => store.dispose(), [store]);

  return (
    <RouterArgStoreContext.Provider value={store}>
      <ArgStoreProvider store={store}>{children}</ArgStoreProvider>
    </RouterArgStoreContext.Provider>
  );
}

/** The store the nearest `<ReactRouterArgStore>` provides, for code that wants it directly (an `ArgStoreProvider` in between does not hide it). */
export function useRouterArgStore(): RouterArgStore {
  const store = useContext(RouterArgStoreContext);
  if (store === undefined) throw new Error('No ReactRouterArgStore is above this component');
  return store;
}
