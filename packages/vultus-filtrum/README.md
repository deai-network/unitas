# vultus-filtrum

vultus filter definitions (vultus-core's `FieldDefinition`s) and their values,
turned into a [filtrum](https://www.npmjs.com/package/filtrum-core) predicate:
the query that the filters a user set amount to, built where there is no
browser — a server that answers a list with the same filters its page shows.
A filtrum dialect (filtrum-mongo's, say) then compiles the predicate for the
backend. The package is React-free: it takes only types from vultus-core, so
loading it loads neither React nor react-i18next.

## Install

```sh
npm install vultus-filtrum filtrum-core vultus-core
```

## Dependencies

- `filtrum-core` ^0.1.1 — a dependency: the predicate builders.
- `vultus-core` (`^` the version this package was released with; for 0.x
  that is the same minor) — a peer, for its `FieldDefinition` type only
  (no vultus-core code runs here).

## Entry points

- `.` — `toPredicate`, `ToPredicateOptions` and `UnsupportedFieldKindError`.

## Usage

```ts
import { toPredicate } from 'vultus-filtrum';

const predicate = toPredicate(definitions, values, {
  ctx: { ...appCtx, values },   // what the definitions' functions receive in the browser
  fields: { search: 'text' },   // filter id -> record field, where they differ
});
// { AND: [{ category: { eq: 'algebra' } }, { text: { search: 'prime numbers' } }] }
```

## The caller's part: the values

`values` must be the values the page shows, by filter id, **defaults
included**. A store (the URL, localStorage) omits a value equal to its
default, so what it holds is not yet what the page shows: fill in each
missing filter's default before calling. A definition's default is its
`initialValue`, else its kind's own: the first enabled choice for a
`oneOf` (so a `oneOf` without a `''` choice always filters by one of
them); `''` for an `optional` `oneOfTree`, else the first node it can
choose (in pre-order); the empty list for `manyOf` and `manyOfTree`; `''`
for `text`. A filter whose value is missing here filters nothing, which
is not what the page shows when its default is a choice.

The values must also be parsed (a list as a list, not as the store's
`a,b` string) and sanitized against the definitions as they are now (a
value no longer among the choices or nodes replaced or dropped).
vultus-core's `valueTypeOf`, `sanitizeStored` and `initialValueOf` do all
of this in the browser, but vultus-core's entry loads React and
react-i18next: a server that calls them depends on both.

Each value that is not empty must have its kind's shape: a string for
`oneOf`, `oneOfTree` and `text`; an array or a `Set` of strings for
`manyOf` and `manyOfTree`. Anything else (`'a,b'` for a `manyOf`, a list
for a `oneOf`, a number, `null`, an object such as `{ $gt: '' }`) throws a
`TypeError` naming the filter and the shape it needs, whether the filter
is shown or not, so nothing but strings reaches the query.

## The rules

Each filter gives one leaf on its record field: the filter's id, unless
`fields` names another.

| kind         | leaf                                  |
| ------------ | ------------------------------------- |
| `oneOf`      | `eq(field, value)`                    |
| `manyOf`     | `isIn(field, [...value])`             |
| `oneOfTree`  | `eq(field, value)`                    |
| `manyOfTree` | `isIn(field, [...value])`             |
| `text`       | `leaf(field, 'search', value)`        |

- **Trees.** A record carries, under a tree filter's field, the ids of the
  nodes from the root down to its own node; `eq` and `in` then match an
  element of that array (MongoDB's semantics), so choosing a node matches the
  records under it. No path operator is needed.
- **Text.** The raw string goes to a `search` operator, which filtrum-core does
  not have: the backend's dialect supplies it and splits the text as its
  search does.
- **Empty values add nothing:** `undefined`, `''`, an empty list or set.
- **Hidden filters add nothing.** `visible` and `hidden` are resolved with
  `ctx` exactly as vultus-core resolves them (a value, or a function of the
  context; a function giving `undefined` counts as absent; the two
  contradicting each other throws), so a filter the page does not show for
  these values, though it keeps a value, does not narrow the list. Pass the
  context the browser gives the definitions, with `values` among its keys
  when their functions read `ctx.values` (as a field group gives it).
- Several leaves are ANDed; none give `{}`, which matches everything.
- **Other kinds throw** `UnsupportedFieldKindError` (`fieldId`, `kind`):
  `boolean`, `mixed-boolean`, `numeric`, `range`, or a kind vultus-core does
  not know. It is thrown for the definition, whatever its value and
  visibility, so a caller learns at once that these definitions need their
  own query.
- **Values of the wrong shape throw** a `TypeError` (see the caller's part
  above).

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.
