# vultus-react-router

A vultus `ArgStore` over react-router's location (7 and 8): argument values (`useArg`,
`useStoredField`, `<Field stored>`) live in the URL, in its query and, where
the app says so, in its path and fragment, so a filtered view can be
bookmarked, shared and walked through with Back and Forward. Like vultus-core
it is antd-free: no Ant Design import appears in this package.

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

- `.` — `ReactRouterArgStore` and `useRouterArgStore` (with its `RouterArgStore`
  type); the path tokens `token`, `vanishing` and `rest` (with the types
  `PathToken`, `PathTokenOptions` and `OneOfDefinition`).

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

A store that keeps arguments in the path goes inside the route it owns the
part below: see [Placement of a store with `path`](#placement-of-a-store-with-path).

## Reading and writing

A key is read from the query of the location being rendered — `location.search`
with a browser or memory router, the query inside the hash (`#/modules/7?rounds=final`)
with a hash router. The keys the store's `path` and `fragment` props name are
read from there instead: see [Arguments in the path and the
fragment](#arguments-in-the-path-and-the-fragment). A location change from
outside (Back, Forward, a link) reaches every argument, also those whose
components did not re-render.

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

A write of query keys navigates to the same path with the changed query, keeping
the hash and every other parameter in its place; a key whose value is removed goes
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

**Scrolling.** The app owns scrolling, so a write's navigation (push or
replace) passes `preventScrollReset`: under `<ScrollRestoration>` the page
stays where it was scrolled instead of jumping to the top. When the batch
lands on top of a navigation from outside that has not rendered yet (the
same tick, or after waiting for it), the two render as one, so the store's
navigation passes the router's choice for that navigation instead: a new
page still opens at the top. A location with a `#hash` still scrolls to
that element on every write, as react-router scrolls to the hash's element
before it looks at `preventScrollReset`. An app that keeps an argument in
the fragment has a rule to follow: see [Scroll](#scroll).

**A readable query.** Keys and values are percent-encoded, except `,`, `.`
and `/`, so lists and ranges read as they are: `?rounds=final,regional&years=2010..2025`.
A space is written `%20`; reading decodes as `URLSearchParams` does (so a `+`
someone typed reads as a space). A key repeated in the URL reads as its first
value; repeated keys the store does not write are kept as they are.

## Links

`hrefFor(changes)` — and through it `useArg(...).hrefFor(value)` — gives the
link a write would navigate to: the current path through react-router's
`useHref` (so with the router's basename, and as `#/…` under a hash router)
plus the changed query and the hash. With `path` and `fragment` it is the same
URL a write makes across all three, what the write would remove left out. Use
it as an `<a href>`, for a link that opens the changed view in a new tab or is
copied.

```tsx
const { hrefFor } = useArg(roundsArg);
<a href={hrefFor(['final'])}>Finals only</a>; // '#/modules/7?rounds=final' under a hash router
```

A link computed at render is as fresh as that render: another key or the path
can change without re-rendering a component that reads only its own key. Put
such links in a component that re-renders on location changes, or compute the
href when the link is used (vultus-antd's OneOfTreeList does the latter). The
first render is the same: a hook mounted later has not declared its key yet (see
[Permanence](#permanence)), so a link computed above it still holds a query key
the write would drop. Such a link computes its href when used, or lives below the
filters.

## Arguments in the path and the fragment

Every key is in the query unless the store's `path` and `fragment` props say
otherwise. Above the store they all stay plain keys, so `useArg`,
`useStoredField` and `<Field stored>` work as ever, wrapper stores too. A
definition does not say where it lives, as the same definition can live in
another store; the props do, and they are made of the definitions, so the key
and the allowed values have one source.

```tsx
import { createBrowserRouter } from 'react-router';
import { stringType, type ArgDefinition, type FieldDefinition } from 'vultus-core';
import { ReactRouterArgStore, rest, vanishing } from 'vultus-react-router';

const VARIANT = {
  kind: 'oneOf',
  id: 'variant',
  choices: [{ value: 'first' }, { value: 'revised' }], // the first is the default
} satisfies FieldDefinition;
const TASK: ArgDefinition<string> = { key: 'task', valueType: stringType, default: '' };
const AT: ArgDefinition<string> = { key: 'at', valueType: stringType, default: '' };
const TOC: ArgDefinition<string> = { key: 'toc', valueType: stringType, default: '' };

const router = createBrowserRouter([
  {
    path: ':lang/:module/*', // the app's own route: the language and the module are its params
    element: (
      <ReactRouterArgStore path={[vanishing(VARIANT), rest(TASK)]} fragment={AT}>
        <ModulePage />
      </ReactRouterArgStore>
    ),
  },
]);
```

| Address | `variant` | `task` | `toc` | `at` |
| --- | --- | --- | --- | --- |
| `/hu/history/s19~modern?toc=s19#12.4` | absent: the default | `s19~modern` | `s19` | `12.4` |
| `/hu/history/revised/a/b` | `revised` | `a/b` | absent | absent |
| `/hu/history` | absent: the default | absent | absent | absent |

### The props

- **`path`**: the tokens below the route the store sits in, in order:
  - `token(def)`: one segment, required by the tokens after it. A `token` followed
    by other tokens should have no default but the empty one: while it reads a
    default of its own its segment is absent, so a write of a later token is
    refused, even one naming both (see [Writes that cannot be
    represented](#writes-that-cannot-be-represented)). With a default of its own,
    use `vanishing`.
  - `vanishing(def)`: one segment, or none: absent from the path while the
    argument is at its default. A segment belongs to it only if it is among
    its allowed values; otherwise the token has vanished and the same segment
    goes to the next token. There is no default in the token: an absent key
    already reads as the argument's default, and writing the default already
    removes the key.
  - `rest(def)`: all the remaining segments, slashes included; only as the
    last token.
  - Each takes `{ independent: true }`: changing this token is not going
    somewhere else, so the later tokens and the query stay.
- **`fragment`**: the definition of the one argument kept in `#…`.
- Every other key lives in the query. With neither prop the store behaves as
  it always has: no path tokens, no path writes, nothing dropped.

`token`, `rest` and `fragment` take an `ArgDefinition` or a `FieldDefinition`.
**A `vanishing` token's allowed values** come from a one-of field's `choices`,
disabled ones too. A bare `ArgDefinition` holds no choices, so it says them
itself: `vanishing(def, { allowedValues })`.

- The definition's type has to be precise: `const VARIANT: OneOfDefinition = …`
  or `… satisfies FieldDefinition`. A `const VARIANT: FieldDefinition = …`
  annotation is a type error, as it forgets that the field is a one-of.
- For an untyped caller, what the types refuse throws, naming the key:
  `allowedValues` for a one-of field (its choices say them), a bare argument
  without them, a field of another kind.
- `choices` may be a function of the field context. It is resolved in the
  store's render, once per render, with the context above the store: the
  `FieldContextProvider` has to sit above `<ReactRouterArgStore>` (one below it
  is not seen), and `ctx.values` is not available there.

### Reading

The store splits the path below its route on `/` and decodes each segment
itself (not through react-router's params, so a literal `%2F` round-trips), then
walks the tokens: a `token` takes the next segment if any; a `vanishing` token
takes it if allowed, else reads as absent and leaves it; a `rest` takes all that
remain. An absent key reads `undefined`, so the argument's default applies.

A typed address need not be one the store would write. Empty segments are
dropped (`/a//b/` reads `a`, `b`), segments beyond the tokens are ignored, a
malformed escape reads raw with no error, and a `%2F` inside a `rest`'s segment
reads as a separator. Such an address keeps its form through query and fragment
writes, and a write that gives a token the value it already has does not touch
the path (alone, it does not navigate at all). A stray segment goes at the next
real path write.

**`readRendered(key)`.** `useRouterArgStore()` returns a `RouterArgStore`: an
`ArgStore` that also has `readRendered(key)`, the key's raw value in the location
of the latest render, for every kind of key. `read` is that with the store's own
writes laid over it (see Reading your own writes). So an app comparing the two
knows whether its URL has caught up, without restating the tokens:

```ts
const store = useRouterArgStore();
const urlIsBehind = store.read('task') !== store.readRendered('task');
```

### Writing

One `write` is one navigation across path, query and fragment, and `hrefFor`
builds the same URL. Changes in the same tick batch, a push if any asked for one.
The path is rebuilt from the tokens' values: an absent `vanishing` or `rest` token
leaves no segment (no task gives `/hu/history`), and an empty value is removal,
in the fragment too. So in either place an emptied value reads as the default: a
field with a non-empty default that must be emptied (a text cleared, a many-of with
nothing checked) belongs in the query, which keeps it as `?key=`. Query and
fragment changes keep the path. A token write stays on the store's route, so the
page stays mounted.

The store encodes each segment with `encodeURIComponent`, leaving `@ : ,` readable
(`~ . _` already are): a `/` in a `token`'s value is `%2F`, and a `rest`'s slashes
are separators. The fragment uses the same encoder; the query's encoding is the
one above.

### Going somewhere else

Changing a path token means going somewhere else: what the old place held is
obsolete. It happens when a write gives a token that is not `independent` a
different value. Then these are removed:

- the tokens after the first such token (an `independent` one too, and whatever
  its definition says about `permanent`);
- the query keys declared non-permanent, and the fragment unless it is permanent
  (see Permanence);

**except keys named in the same write, which are never cut.** So "open this task
with these filters" is one write, in any order:

```ts
const write = useArgWriter();
write([setArg(TOC, 's20'), setArg(TASK, 's20~modern')], 'push');
```

The same write means one `write` call, as a `useArgWriter` batch is. Two `set`
calls in a handler are two writes: `toc.set('s20'); task.set('s20~modern')` drops
`toc`, as the second one goes somewhere else on top of the first, while
`task.set('s20~modern'); toc.set('s20')` keeps it.

The removals are decided at write time and join the write's changes, so reading
your own writes shows them at once and `hrefFor` includes them. A write that
changes no token's value cuts nothing, and neither does a query or fragment
change.

Writing the default over a default spelled out in a hand-typed address counts as
going somewhere else: on `/hu/history/first/s19`, writing `first` removes the key,
which is a different value from the one the segment holds, so the task goes. The
store would not write such an address itself.

A stored field's `onChange` replaces, so `<Field stored>` on a token goes somewhere
else by a replace: what the old place held is gone, and Back does not bring it
back. For a token whose old place should stay reachable, write with
`useArg(...).set(value, 'push')`, or through a wrapper store that decides the method.

### Permanence

`permanent: true` on the definition (an `ArgDefinition` or a `FieldDefinition`,
default false) keeps a query key or the fragment when the store goes somewhere
else. It is said nowhere else: `<Field permanent>` is a type error and throws,
with or without `stored`. The store holds the fragment's definition, in its prop,
and goes by that. A query key's it learns from the hooks that use the definition,
as they render (`ArgStore.declare`, see vultus-core's README):

| The query key is | When the store goes somewhere else |
| --- | --- |
| declared non-permanent | dropped |
| declared permanent | kept |
| never declared | kept |

A permanent argument whose hook is not mounted is unknown to the store, and a
stale key nothing reads is a better failure than a user's filter silently lost. A
key stays declared after its hook unmounts, for as long as the store lives. Only
query keys need a hook to declare them: a wrapper store that does not forward
`declare` declares nothing, so no query key is dropped, while the fragment goes or
stays by its definition all the same.

### Writes that cannot be represented

Refused, whole, with a console warning naming the key and the reason. The value
stays as it was, nobody is notified, and nothing reaches the router (`..` under a
browser router would otherwise navigate to a 404):

- `.`, `..` or an empty segment in a token's value (for `rest`: in any segment, so
  also a leading, trailing or doubled `/`), or a lone surrogate;
- removing a `token` while a later token keeps a value, as the path would shift:
  the token is `independent`, or the same write names the later one. `resetAll` is
  one write, so a group holding such a token refuses as a whole, its query keys
  too;
- a `vanishing` value outside its allowed values;
- a value whose first segment an earlier vanished token would claim (a task named
  like a variant, while the variant is at its default).

A text widget keeps its draft after a refusal, so a refused value stays visible in
the input with no error shown; an app with a free-text field in the path validates
it itself.

`hrefFor` of such a change gives the current href, with the same warning on each
call, so a link rendered with it warns once per render.

An address only a hand could make (`/hu/history/a%2F..%2Fb`) keeps working: query
and fragment writes land and keep it, and replacing its `rest` works. A write that
would rebuild it with that `rest` in it, such as an earlier independent token's,
is refused.

### On top of a navigation from outside

As for the query (see Writes next to a navigation), a batch applies on top of
wherever the router settled. If the same route settled with another module, a task
lands there; an app already handles unknown task ids from hand-edited URLs.

The batch is checked again where it lands. Path changes that no longer fit, or that
find the route left, are dropped with the same warning, the rest of the batch still
landing. The removals those changes implied go with them, as the store has not gone
somewhere else; what the writes named lands. So `write({ task: 's20', q: 'y' })` on
top of a navigation redirected to `/start?toc=1` gives `/start?toc=1&q=y`. Path
changes that fit and do change a token there take their removals along, as decided
at write time: a key that was absent then is not removed where the router settled.
Where they change no token, nothing is cut: `write({ task: 's20' })` on top of a
navigation to `/hu/history/s20?toc=b` leaves it as it is.

**A known limit.** Only a store directly in a data route knows when the router has
left its route. Under a non-data router, or inside descendant `<Routes>`, it cannot
tell that a route as deep as its own is another route (that would take
`matchRoutes`, which the store does without), only that a path is too short to hold
its route. So a write and a navigation away in one tick can land wrong: `/about/us`
plus a task write gives `/about/us/s20`, with no warning. Under a non-data router it
takes that same tick; inside descendant `<Routes>` of a data router, a batch waiting
for the navigation is enough.

### Placement of a store with `path`

The store takes the route it sits in from react-router's route context, so it needs
no data router and no `matchRoutes`, and `<BrowserRouter>` with `<Routes>` works too.
With `path`, that route's pattern must end in `*`; otherwise it throws, as it does
outside a router, and also in no route or a route without a pattern of its own.
Without `path` (with `fragment` alone too) it can sit anywhere, as ever. A fragment
whose key is also a token's, two tokens with one key, and a `rest` that is not last
all throw in the render.

- The route stays the app's: its params are react-router's. A language in the route
  is a plain param, and a language switch is the app's own navigation.
- One store per page: two stores on a page batch separately, so two navigations.
- Descendant `<Routes>` below the store are invisible to it.
- Other pages keep a query-only store of their own.

### Scroll

The app owns scrolling, as a stated rule. A store's write passes
`preventScrollReset` (see Scrolling), so a task change keeps the scroll; an app that
wants the top scrolls itself.

An app with `<ScrollRestoration>` must not give elements an id equal to the fragment
value: its hash branch runs before `preventScrollReset`, so every store write would
scroll back to that element. Under a hash router, plain `<a href="#12.4">` links
replace the route.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.
