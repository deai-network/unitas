# vultus-react-router

A vultus `ArgStore` over react-router's location (7 and 8): argument values (`useArg`,
`useStoredField`, `<Field stored>`) live in the URL's query, so a filtered
view can be bookmarked, shared and walked through with Back and Forward. Like
vultus-core it is antd-free: no Ant Design import appears in this package.

## Install

```sh
npm install vultus-react-router vultus-core react-router
```

vultus-core and react-router are peer dependencies, installed by the app
itself (see below). With react-router-dom, add `react-router` at the same
version as react-router-dom, so that both resolve to one copy of it: with
two, the store's `useLocation` finds no router and throws.

## Peer dependencies

- `react` >=18
- `react-router` >=7 <9 (`createBrowserRouter`, `createHashRouter`, `<BrowserRouter>`,
  ... — any router whose hooks come from `react-router`; react-router-dom 7
  re-exports them). The store reads the router's current location through
  react-router's `UNSAFE_` contexts, checked against 7.0, 7.18 and 8.4; a new
  major is admitted once they are checked again.
- `vultus-core` (`^` the version this package was released with; for 0.x
  that is the same minor) — a peer, not a dependency: the store's
  `ArgStoreProvider` has to come from the app's one copy of vultus-core, the
  one whose hooks read the store (with a second copy, the hooks would find
  no store). vultus-core brings its own peer, `react-i18next`.

## Entry points

- `.` — `ReactRouterArgStore` and `useRouterArgStore`.

## Placement

`<ReactRouterArgStore>` goes inside the router, around the routes that store
arguments. It provides its store through vultus-core's `ArgStoreProvider`, so
every argument hook below it reads and writes the URL. Outside a router it
throws (react-router's own error).

```tsx
import { createHashRouter, Outlet, RouterProvider } from 'react-router';
import { ReactRouterArgStore } from 'vultus-react-router';

const router = createHashRouter([
  {
    path: '/',
    element: <ReactRouterArgStore><Outlet /></ReactRouterArgStore>,
    children: [{ path: 'modules/:id', element: <ModulePage /> }],
  },
]);

export const App = () => <RouterProvider router={router} />;
```

With a declarative router, put it around the routes:
`<BrowserRouter><ReactRouterArgStore><Routes>…</Routes></ReactRouterArgStore></BrowserRouter>`.
A nested `ArgStoreProvider` (localStorage around a dialog, say) takes over for
its subtree as usual; `useRouterArgStore()` still gives the URL store there,
for code that wants it directly.

## Reading and writing

A key is read from the query of the location being rendered — `location.search`
with a browser or memory router, the query inside the hash (`#/modules/7?rounds=final`)
with a hash router. A location change from outside (Back, Forward, a link)
reaches every argument, also those whose components did not re-render.

**Reading your own writes.** A write notifies at once, and the store reads
it back at once: the writes not yet applied (see Batching), then the
store's own navigation until its location renders (react-router renders it
in a transition, a data router after its loaders), laid over the rendered
location. So a stored text field keeps its caret and every keystroke, and a
stored slider does not jump back after a move. Once the router will not
get there — a blocker blocks the store's navigation, a navigation from
outside cancels or overtakes it, a loader redirects it — the location
shows again: a navigation from outside wins. `hrefFor` builds on the same
values.

A write navigates to the same path with the changed query, keeping the hash
and every other parameter in its place; a key whose value is removed goes
away, and the last one going takes the `?` with it. An empty value stays as
`?key=` (an empty list, for example — not the same as the default). A
replace keeps the history entry's `state`; a push starts a new entry without
one.

**Batching.** Writes made in the same tick — several `set` calls in one
handler, a `useArgWriter` batch, both — are collected and applied in a
microtask as one navigation: a push if any of them asked for one, else a
replace. Without this, several writes in one tick would each navigate from
the same rendered location and all but the last would be lost. A batch is
applied on top of the router's latest location, not the rendered one, which
lags while the router's update renders (react-router renders it in a
transition), and while the store's own previous navigation is still
loading, the next batch builds on that navigation's target. A write that
changes nothing does not navigate.

**Writes next to a navigation.** A batch lands on top of a navigation from
outside instead of cutting it short. A classic router
(`<BrowserRouter>`, `<HashRouter>`, ...) navigates at once, so the batch
simply builds on the new location. A data router (`createBrowserRouter`,
...) stays where it was while the target's loaders run, and a navigation
of the store's would cancel the one in flight; so while a navigation that
is not the store's own is loading or submitting, the batch waits until the
router is idle again (writes made meanwhile join it) and is then applied
on the location the router settled on — that navigation's target, wherever
a redirect took it, or where the router stayed if it was cancelled. So a
write made in the same tick as a navigation to another path — a handler
that sets an argument and then navigates, in either order — lands in the
new path's query (`/other?rounds=final`) once that path has loaded, not on
the page it was made on. One exception: a data router created with
`getContext` (middleware) may publish its navigation only after awaiting
`getContext`, so a write in the same tick can still cancel the navigation
there.

**Scrolling.** A write changes only the query, so its navigation (push or
replace) passes `preventScrollReset`: under `<ScrollRestoration>` the page
stays where it was scrolled instead of jumping to the top. When the batch
lands on top of a navigation from outside that has not rendered yet (the
same tick, or after waiting for it), the two render as one, so the store's
navigation passes the router's choice for that navigation instead: a new
page still opens at the top. A location with a `#hash` still scrolls to
that element on every write, as react-router scrolls to the hash's element
before it looks at `preventScrollReset`.

**A readable query.** Keys and values are percent-encoded, except `,`, `.`
and `/`, so lists and ranges read as they are: `?rounds=final,regional&years=2010..2025`.
A space is written `%20`; reading decodes as `URLSearchParams` does (so a `+`
someone typed reads as a space). A key repeated in the URL reads as its first
value; repeated keys the store does not write are kept as they are.

## Links

`hrefFor(changes)` — and through it `useArg(...).hrefFor(value)` — gives the
link a write would navigate to: the current path through react-router's
`useHref` (so with the router's basename, and as `#/…` under a hash router)
plus the changed query and the hash. Use it as an `<a href>`, for a link that
opens the changed view in a new tab or is copied.

```tsx
const { hrefFor } = useArg(roundsArg);
<a href={hrefFor(['final'])}>Finals only</a>; // '#/modules/7?rounds=final' under a hash router
```

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.
