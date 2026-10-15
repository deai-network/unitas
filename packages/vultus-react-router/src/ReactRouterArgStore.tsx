import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  UNSAFE_DataRouterContext, UNSAFE_NavigationContext, useHref, useLocation, useNavigate,
  type Location, type NavigateFunction, type Path,
} from 'react-router';
import { ArgStoreProvider, type ArgStore, type RawChange, type UpdateMethod } from 'vultus-core';
import { applyChanges, readQuery, writeQuery } from './query.js';

/** Where the router is now: its own location object (the same object while it has not moved) and that location in `useLocation`'s terms. */
interface RouterNow {
  at: object;
  path: Path;
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

/**
 * The ArgStore behind `<ReactRouterArgStore>`, one per component instance. The component hands it
 * what each render sees; `read` and `hrefFor` answer from the location of the latest render.
 */
class RouterArgStore implements ArgStore {
  location!: Location;
  navigate!: NavigateFunction;
  /** `useHref` of the current path: the start of `hrefFor`'s links (`#/…` under a hash router, with the basename). */
  pathHref!: string;
  now!: () => RouterNow;

  /** This store's last navigation, and where the router was when it was made. */
  private navigated: { from: object; to: Path } | undefined;
  private batch: { changes: RawChange[]; push: boolean } | undefined;
  private readonly listeners = new Set<() => void>();
  private parsed = { search: '', query: new Map<string, string>() };

  read(key: string): string | undefined {
    const { search } = this.location;
    if (search !== this.parsed.search) this.parsed = { search, query: readQuery(search) };
    return this.parsed.query.get(key);
  }

  /** Collects the changes of the current tick; a microtask applies them as one navigation, a push if any write asked for one. */
  write(changes: RawChange[], method: UpdateMethod): void {
    if (this.batch === undefined) {
      this.batch = { changes: [], push: false };
      queueMicrotask(() => this.flush());
    }
    this.batch.changes.push(...changes);
    if (method === 'push') this.batch.push = true;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hrefFor(changes: RawChange[]): string {
    return this.pathHref + applyChanges(this.location.search, changes) + this.location.hash;
  }

  /** A new location has rendered (and with it this store's own navigation); subscribers that did not re-render with it re-read. */
  rendered(): void {
    this.navigated = undefined;
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Applies the batch on top of the latest location — not the rendered one, which lags behind
   * the router while its update renders (react-router renders in a transition): the router's
   * own location, or this store's last navigation while the router has not moved since (a
   * navigation still loading). The path, the hash and every other parameter are kept.
   */
  private flush(): void {
    const { changes, push } = this.batch!;
    this.batch = undefined;
    const now = this.now();
    const base = this.navigated !== undefined && this.navigated.from === now.at ? this.navigated.to : now.path;
    const search = applyChanges(base.search, changes);
    if (search === writeQuery(new URLSearchParams(base.search))) return;
    const to: Path = { pathname: base.pathname, search, hash: base.hash };
    this.navigated = { from: now.at, to };
    void this.navigate(to, { replace: !push });
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
  // <BrowserRouter> or <HashRouter> navigates through. Read only when a batch is applied.
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const { navigator, basename } = useContext(UNSAFE_NavigationContext);
  const [store] = useState(() => new RouterArgStore());

  store.location = location;
  store.navigate = navigate;
  store.pathHref = pathHref;
  store.now = () => {
    const at = dataRouter?.router.state.location ?? (navigator as { location?: Location }).location;
    const pathname = at === undefined ? undefined : stripBasename(at.pathname, basename);
    return at !== undefined && pathname !== undefined
      ? { at, path: { pathname, search: at.search, hash: at.hash } }
      : { at: location, path: location };
  };

  useLayoutEffect(() => store.rendered(), [store, location]);

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
