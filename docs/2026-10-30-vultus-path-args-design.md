# vultus: arguments in the URL path and fragment

Date: 2026-10-30. Status: designed with the owner, being built; to main after he clears it.

## Need

Praeceptor is redesigning its URLs (decided with the owner, 2026-10-30): the UI language as a path
prefix, clean paths instead of hash routing, the open task in the path:
`/hu/pongracz-egyhaztortenelem/s19~modern?toc=s19&variant=modern#12.4`. Its module page relies on
single writes that change the task and several filters at once, as one history entry. Today
`<ReactRouterArgStore>` keeps every key in `location.search`.

Prior work: vultus's argument layer is a port of stellar-router's url-arg, with pluggable storage
because vultus does not assume the app's router. The rest of stellar-router (path tokens, URL
schemas) was listed as a later port. Stellar-router could integrate everything because it was the
router. A throwaway spike (branch `spike/path-args`, report
`~/chat/vultus/2026-10-30-path-args-spike-report.md`) showed this works **without replacing
react-router**: one write across path, query and fragment, `hrefFor` across all three, the page
kept mounted, and the store's in-flight guarantees unchanged.

## Principles

- **SSOT** (a core principle of unitas and vultus): a fact about an argument lives in its
  definition and is not restated. Which arguments live where in the URL is the one fact of the URL
  layout's own, since the same definition can live in another store.
- **`ArgStore` stays a store of raw strings by key.** Path, query and fragment arguments are all
  plain keys above the store; Praeceptor's wrapper stores (`stepStore`, `readerStore`, `placeStore`)
  keep working.
- **Going somewhere else** (stellar-router's model, kept): changing a path token means going
  somewhere else. Later tokens are obsolete and the query goes with the old place, except arguments
  declared permanent.

## The store's API

```tsx
// Inside the route :lang/:module/*, which the store owns the part below:
<ReactRouterArgStore path={[vanishing(VARIANT), rest(TASK)]} fragment={AT}>
```

- **`path`**: the tokens below the route the store sits in, in order, made of the definitions
  (an `ArgDefinition` or a `FieldDefinition`), so the key and the allowed values have one source:
  - `token(def)`: one segment, required by the tokens after it.
  - `vanishing(def)`: one segment, or none: absent from the path while the argument is at its
    default. A segment belongs to it only if it is among its allowed values; otherwise the token has
    vanished and the same segment goes to the next token (stellar-router's vanishing token). The
    allowed values come from a one-of field definition's `choices` (a function of the context is
    resolved with the store's field context; `ctx.values` is not available there). For a bare
    `ArgDefinition`, which holds no choices: `vanishing(def, { allowedValues })`. There is no default
    in the token: an absent key already reads as the argument's default, and writing the default
    already removes the key (`useArg`, `rawFor`). `vanishing(X)` needs a precise one-of type
    (`OneOfDefinition` or `satisfies FieldDefinition`), not a `FieldDefinition` annotation, which
    forgets the kind. It throws when `allowedValues` is given for a one-of field: the choices already
    say them.
  - `rest(def)`: all the remaining segments, slashes included; only as the last token. Stellar-router
    has no such token.
  - Each takes `{ independent: true }`: changing this token is **not** going somewhere else. Later
    tokens and the query stay. Stellar-router hard-wires the cut (TokenManagerImpl.ts:369, 379).
- **`fragment`**: the definition of the one argument kept in `#...`.
- Every other key lives in the query, as today. **With neither prop the store behaves exactly as
  today**: no path tokens, no path writes, nothing dropped.

The route stays the app's: `:lang/:module/*` is a plain react-router route, and the language and the
module are its params. The language does not vanish (owner), so it needs no token; a language switch
is the app's own navigation.

## Permanence

- `permanent?: boolean` on `ArgDefinition` and on `FieldDefinition`, default false. It is the only
  place this is said: `<Field permanent>` is a type error and throws, with or without `stored`, as a
  restatement at a render site would otherwise be silently ignored.
- The store learns it from the hooks: a hook that uses a definition already knows the definition
  and its store, and tells the store as it renders: a new optional `ArgStore` method,
  `declare?(key, { permanent })`. `useArg` (so `useStoredField`), `useStoredFields` and
  `useFieldGroup` with `{ stored: true }` call it, for every definition, hidden ones too. It is
  idempotent and notifies nobody. A wrapper store forwards it with one line.
- Rule on going somewhere else: a key **declared non-permanent** is dropped; **declared permanent**
  is kept; **never declared** is kept. Stellar-router drops the undeclared, but it registers every
  argument when it is defined. Here a permanent argument whose hook is not mounted is unknown, and a
  stale key nothing reads is a better failure than a user's filter silently lost. A wrapper that does
  not forward `declare` gets today's behaviour: nothing is dropped.

## Reading

The location's path below the route's base is split on `/` and decoded per segment by the store (not
through react-router's params, so a literal `%2F` round-trips), then walked over the tokens: a
`token` takes the next segment if any; a `vanishing` token takes it if allowed, else reads as absent
and leaves it; a `rest` takes the remaining segments. An absent key reads `undefined`, so the
argument's default applies. Empty segments in a typed address are dropped on reading (`/a//b/` reads
`a`, `b`). Segments beyond the tokens are ignored by reads and gone after a real path write (see
Writing). A malformed escape in a typed address reads raw, with no error.

Read-your-writes stays: a key's own unapplied change wins, as today.

`readRendered(key)`, on the store `useRouterArgStore()` returns, is the key's raw value in the
location of the latest render, for every kind of key; `read` is that with the store's own writes
laid over it. So an app comparing the two knows whether its URL has caught up, without restating the
tokens.

## Writing

One `write(changes, method)` is one navigation across path, query and fragment, and `hrefFor` builds
the same URL, as today. Changes in the same tick batch, a push if any asked for one.

- **Going somewhere else** happens when a change gives a non-`independent` path token a different
  value. Then the tokens after the first such token, the declared non-permanent query keys and the
  non-permanent fragment are removed, **except keys named in the same write, which are never cut**.
  So "open this task with these filters" is one write, in any order (stellar-router's fold is
  order-dependent there), and a write that changes nothing cuts nothing.
- These removals are decided at write time and join the write's changes, so read-your-writes shows
  them at once and `hrefFor` includes them.
- Writing the default over a default spelled out in a hand-typed address counts as going somewhere
  else: the write removes the key, which differs from the value the segment holds. The store would
  not write such an address itself.
- The path is rebuilt from the tokens' values: an absent `vanishing` or `rest` token leaves no
  segment; no task gives `/hu/pongracz`. An empty value is removal.
- Query and fragment changes keep the path, as query changes do today.
- A same-value path write does not navigate. A stray typed segment goes at the next real path write,
  one that changes a token's value.

### Writes that cannot be represented

Refused, whole, with a console warning naming the key and the reason; the value stays as it was, and
nothing reaches the router (`..` under a browser router would otherwise navigate to a 404):

- `.`, `..` or an empty segment in a token's value (for `rest`: in any segment, so also a leading,
  trailing or doubled `/`);
- removing a `token` while a later token keeps a value (the path would shift);
- a `vanishing` value outside its allowed values;
- a value whose first segment an earlier vanished token would claim (a task named like a variant).

A batch that waits for a navigation from outside re-checks when it applies; path changes that no
longer fit are dropped with the same warning, the rest of the batch still landing. A batch's implied
removals go with a path change dropped there, as the store has not gone somewhere else; named changes
land.

### On top of a navigation from outside

As today: the batch applies on top of wherever the router settled. If the route was left, the batch's
path changes are dropped as above and its named changes land there (`/start?toc=1&q=y`). If the same
route settled with another module, a task lands there; an app already handles unknown task ids from
hand-edited URLs.

Under a non-data router, a write and a navigation away in one tick can land wrong: without
`matchRoutes` the store cannot tell that a route as deep as its own is another route, so `/about/us`
plus a task write gives `/about/us/s20`. The same goes for a store inside descendant `<Routes>`,
where a batch waiting for the navigation is enough. A store directly in a data route knows it left.
Accepted, and pinned by tests.

## Encoding

The store's own per-segment encoder, not `generatePath` (which encodes `@` and leaves a splat raw):
`encodeURIComponent` with `@ : ,` left readable (`~ . _` already are); a `/` in a `token`'s value is
`%2F`, and a `rest`'s slashes are separators. The fragment uses the same encoder. The query's encoding
is unchanged.

## Placement

The store takes the route it sits in from react-router's route context, so it needs no data router
and no `matchRoutes`. With `path`, that route's pattern must end in `*`; otherwise it throws, as it
does outside a router. Without `path`, it can sit anywhere, as today.

To document:

- One store per page: two stores on a page batch separately, so two navigations.
- Descendant `<Routes>` below the store are invisible to it.
- Other pages keep a query-only store of their own.

## Scroll

The app owns scrolling, as a stated rule. The store passes `preventScrollReset` on every write, as
today, so a task change keeps the scroll; an app that wants the top scrolls itself. An app with
`<ScrollRestoration>` must not give elements an id equal to the fragment value: its hash branch runs
before `preventScrollReset`, so every store write would scroll back to that element (measured: a
reader at 500 jumped to 1035). Under a hash router, plain `<a href="#12.4">` links replace the route.

## Testing

- Pure units for the tokens: reading, building, encoding, refusals.
- The store under a memory router **and a browser router** (the memory router hides what `new URL`
  does to `.` and `..`), and under a plain `<BrowserRouter>` + `<Routes>`.
- The store's in-flight guarantees with the pathname changing (the spike's cases).
- The page stays mounted across a token write.
- Permanence: declared, undeclared, a wrapper not forwarding `declare`.

## Out of scope

- Praeceptor's migration (its spec names this store).
- Stellar-router's location manager, interceptors and argument-driven state spaces; react-router's
  routes and blockers keep those jobs.
- A way for a write to ask for the top of the page.
