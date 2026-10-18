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

`values` are the filters' values by id, as the page shows them (already
parsed and sanitized: vultus-core's `valueTypeOf` and `sanitizeStored`).

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

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.
