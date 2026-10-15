# vultus-react-router

A vultus `ArgStore` over react-router 7's location: argument values (`useArg`,
`useStoredField`, `<Field stored>`) live in the URL's query, so a filtered
view can be bookmarked, shared and walked through with Back and Forward. Like
vultus-core it is antd-free: no Ant Design import appears in this package.

## Install

```sh
npm install vultus-react-router
```

## Peer dependencies

- `react` >=18
- `react-router` >=7 <9 (`createBrowserRouter`, `createHashRouter`, `<BrowserRouter>`,
  ... — any router whose hooks come from `react-router`; react-router-dom 7
  re-exports them). The store reads the router's current location through
  react-router's `UNSAFE_` contexts, checked against 7.0, 7.18 and 8.4; a new
  major is admitted once they are checked again.

vultus-core comes as a dependency and brings its own peer, `react-i18next`.

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
transition): a navigation from outside in the same tick is kept, and while
the store's own previous navigation is still loading, the next batch builds
on it. A write that changes nothing does not navigate.

**Writes next to a navigation.** A batch lands wherever the router is when
it is applied. So a write made in the same tick as a navigation to another
path — a handler that sets an argument and then navigates, in either order —
lands in the new path's query (`/other?rounds=final`), not on the page it was
made on.

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
