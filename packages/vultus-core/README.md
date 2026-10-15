# vultus-core

Framework-neutral action model, hooks, and error-routing for the vultus UI
family. It is antd-free by design: no Ant Design import appears anywhere in
this package. Consumed by `vultus-antd` and, transitively, by excavator and
optio-conversation-ui.

## Install

```sh
npm install vultus-core
```

## Peer dependencies

- `react` >=18
- `react-i18next` >=15

## Entry points

- `.` — the action model, exporting: the core `types`, `decision`, `resolve`,
  `parseApiError`, `routeApiError`, `ActionErrorContext` / `useActionErrorCtx`,
  `useAction`, `useActionList`; the field context (`FieldContextProvider`,
  `createFieldContext`, `useFieldContext`, `NO_FIELD_CONTEXT`); every field
  kind's hook (`useBoolField`, `useMixedBoolField`, `useOneOfField`,
  `useManyOfField`, `useNumericField`, `useRangeField`, `useManyOfTreeField`,
  `useTextField`, `useFieldCore` and their types) and their shared helpers
  (`resolveChoice`, `normalizeText`, `clamp`, `resolveNumeric`, the tree
  helpers `normalizeTreeValue` / `coveredNodes` / `toggleTreeValue` /
  `expandedTreeKeys` / `filterTree`); definitions as data (`FieldDefinition`,
  `initialValueOf`, `valueTypeOf`, `sanitizeStored`); the argument layer
  (the value types, `memoryStore`, `localStorageStore`, `ArgStoreProvider` /
  `useArgStore`, `useArg`, `useArgWriter`, `setArg` / `resetArg`, `argOf`,
  `useStoredField` / `useStoredFields`); `InternalLinkContext` /
  `useInternalLink` / `InternalLinkComponent`, `MessageSinkContext` /
  `useMessageSink` / `MessageSink`, and `VultusComponentsContext` /
  `useVultusComponents` / `SpinnerScope` / `useSpinnerKey` /
  `VultusComponents` / `SpinnerProps` / `SpinnerComponent`.
- `./link` — `InternalLinkContext`, `useInternalLink`, and the
  `InternalLinkComponent` type on their own, for consumers that only need the
  link-injection seam.

## Actions report messages

An action's `fire(args, ctx)` receives an `ExecutionContext` next to its arguments:
`ctx.info(text)`, `ctx.warn(text)` and `ctx.error(text)` report messages while it runs.
They land on the action's status as `messages` (with their `severity`) and go to the
`MessageSink` (`(text, severity?)`). A thrown error still fails the action and ends the
run's messages; `errors` lists the error texts among them. What a thrown error shows
(`parseApiError`): an API error's body message (ts-rest's `{ status, body: { message, reason } }`);
without one, a thrown `Error`'s own message (`throw new Error('Printer offline')` shows "Printer
offline", a failed fetch its TypeError's); with neither, "Action failed" (a routed action
(`errorRoute`): the registry's entry for the body's `reason`, else the message, else
`t('common.error')`). A field's commit is an action, so the same holds for the field's messages.

## Fields

`useBoolField(options)` is the first field hook: the value half of vultus, next to
actions. Fields are built by composition on a shared core (`useFieldCore`): label,
description, `visible`/`hidden`, `enabled`/`disabled` (a `Decision`, so with a reason),
and where the value lives:

- inside the field: `initialValue` (default `false`), changed locally;
- outside, changed locally: `value` + `onChange` (the caller owns the value, e.g. a form);
- outside, committed immediately: `value` + `commit: { fire(next, ctx), confirmation?, errorRoute? }`.
  The commit runs as an action, so the field is `pending` while it runs and carries its
  `messages`; afterwards it shows whatever `value` the caller passes. `confirmation` may
  depend on the requested value.

The returned controls (`value`, `setValue`, `toggle`, `pending`, `enabled`, `whyDisabled`,
`description`, `valueDescription`, `messages`, `confirmationFor(next)`, ...) are what widgets
render: vultus-antd's `BoolSwitch` and `BoolCheckbox` take the same field.
`valueDescriptions` (texts keyed by value: `true`, `false`, `mixed`) say what the current value
means, next to `description` (what the field is).

`useMixedBoolField` is the same field over an aggregate: it shows `true`, `false` or `'mixed'`
and can be asked for `true` or `false` only (the field core separates the shown type from the
requestable one); a toggle from mixed requests `true`. `aggregateBool(values)` derives the
value; with no items at all, disable the field with a reason instead.

`useOneOfField` is a field whose value is one of a list of `choices` (static or derived):
each `{ value, label?, description?, icon?, enabled?/disabled?, variant? }`. A choice may
be disabled with a reason (a `Decision`, as a field's), and be `primary` or `danger` like an
action's variant; `description` (markdown) says what choosing it does and is also the field's
current state while it is chosen, unless `valueDescriptions` words that state differently.
Requesting a disabled or unknown choice is ignored with a warning. Storage is as for the
boolean field (inside: `initialValue`, default the first enabled choice); `confirmation` may
depend on the requested choice. vultus-antd's `OneOfSelect` and `OneOfSegmented` take the
same field.

## Field context

A field's options may depend on something only the app knows — a translation
function, the data a page is showing. `createFieldContext<Ctx>()` returns a
typed `Provider` (it's `FieldContextProvider` itself, just typed); the hooks
read the nearest one. Nested providers merge, the inner value winning, so an
app can provide `t` near the root and `items` further down the tree.

Every option that takes a `ValueOrFn<T, Ctx>` (`T | ((ctx: Ctx) => T)`) may be
a plain value or a function of the context. With a provider above, every
function receives the nearest provider's value, whatever parameters it
declares — `(ctx = {}) => ...` gets it too. With none, a function with no
declared parameter (`() => ...`) is called with nothing, so it runs without
needing a provider at all, while one that declares a parameter (`(ctx) =>
...`) is a loud failure: an error naming the field, the option, and that no
`FieldContextProvider` is above it. This goes by the function's declared
parameter count, so a default parameter (`(ctx = {}) => ...`) escapes that
check and, with no provider, runs with its default. A function that returns
`undefined` counts as an absent option too, and falls back to the option's
own default exactly as leaving it out would (useful for a lookup that
misses, e.g. `(ctx) => ctx.items[id]`). Numeric's `format(n, ctx)` follows
the same rule for its second parameter.

The provided value is wrapped so that reading a key no provider gave throws,
naming the key and the keys that are present, and, when an option's
function reads it, the field and the option in front (`Field 'sec': option
'label': Field context: 'items' was never provided (provided: t, lang)`) — a
forgotten value fails loudly instead of silently becoming `undefined`. A key
explicitly provided as `undefined` is fine. The wrapper lets test tooling and
printers probe the object without tripping the guard (`then`, `toJSON`,
`asymmetricMatch`, `$$typeof`, `nodeType`, `tagName`, `hasAttribute`,
`_isMockFunction`, any key starting with `@@`, and all symbol keys), so a
context value can be logged, pattern-matched or passed around during tests
without the guard misfiring.

Caution: the parameter-count rule above only decides what a function gets
with no provider. With a provider, a function whose declared parameter
count is zero — a default parameter (`(ctx = {}) => ...`), a rest parameter
(`(...args) => ...`), or a bound `t` — still receives the guarded context,
and reading a key it was not given still throws.

```tsx
const { Provider: ModuleContext } = createFieldContext<{ items: Item[] }>();

function Filters({ items }: { items: Item[] }) {
  return (
    <ModuleContext value={{ items }}>
      <Categories />
    </ModuleContext>
  );
}

function Categories() {
  const field = useManyOfField({ id: 'categories', choices: (ctx) => categoriesOf(ctx.items) });
  // ...
}
```

## More kinds

Next to `useBoolField` and `useOneOfField`, the other field kinds. Each is
built the same way (`useFieldCore`, the same inside / local / commit
storage), so everything the Fields section above says about storage,
visibility, enabling and commits applies to all of them too.

### many-of (`useManyOfField`)

The value is a list of choices (`OneOfChoice`, as one-of's), kept as a set:
order and duplicates don't matter to its meaning, and every request (through
`setValue` or `toggle`) is normalized to choice order without duplicates,
followed by the values the field already holds that are no longer among the
choices and that the request keeps, in their current order. `toggle` keeps
them, so a stored value naming a removed choice isn't silently dropped;
`setValue([])` clears them along with everything else. Controls add
`choices` (each with `selected`), `isSelected(value)` and `toggle(value)`. A request naming
an unknown choice, or flipping a disabled one, is refused with a
`console.warn` — the hook itself polices this, as `useOneOfField` already
does for its own `setValue`, not just the widget. Implicit initial value
(with no `initialValue` and no outside storage): the empty list.

```ts
const field = useManyOfField({
  id: 'tags',
  choices: [{ value: 'urgent' }, { value: 'archived', disabled: true }],
});
field.toggle('urgent'); // field.isSelected('urgent') === true
```

### numeric (`useNumericField`)

The value is a single number. `min`, `max`, `step`, `integer` (moxb's
`onlyInteger`) and `unit` may each be a context function; `format(n, ctx)`
overrides the default display (the number followed by the unit, if any).
The shown value is always clamped into the bounds, then rounded when
`integer` to a whole number inside them (a stored `2.5` shows `3`; with
`max: 9.5`, `9.7` shows `9`), since a value from outside — a
passed-in `value`, a stored one — may fall outside them or be fractional
even though every request the hook itself makes fits; a non-finite request
(a widget that parsed `''`) is refused with a warning. `valueText` carries
the formatted value. Implicit initial value: `min` (or `0` if there is
none), clamped into the bounds.

```ts
const field = useNumericField({ id: 'count', min: 0, max: 10, unit: 'pcs' });
field.valueText; // '0pcs'
```

### range (`useRangeField`)

The value is a `NumberRange`, `[from, to]` with `min <= from <= to <= max`;
it shares numeric's bounds and formatting, but `min` and `max` are required
here and `step` defaults to `1`. `valueText` joins the formatted ends with
an en dash ("2010/11–2025/26"), so a layout can put the whole range in the
field's label instead of next to it. A value from outside is clamped into
the bounds end by end, rounded when `integer`, then ordered. Implicit
initial value: `[min, max]`.

```ts
const field = useRangeField({ id: 'years', min: 2010, max: 2026 });
field.valueText; // '2010–2026'
```

### many-of tree (`useManyOfTreeField`)

The value is a list of node ids (`nodes`: `TreeNode`, a choice with
`children`), kept as a set. `selection` says which of the covered nodes the
value names: `'topmost'` (default; antd's `SHOW_PARENT`: a checked node
stands for its whole subtree), `'all'`, `'leaves'` (`SHOW_CHILD`), or
`'independent'` (`checkStrictly`, moxb's `strictSelect`: nodes are chosen on
their own, with no cascading). The hook normalizes the value under
`selection` on every render — with `'topmost'`, a node and all its checked
children collapse to the node alone — and exposes `expandedKeys` (which
nodes a widget opens at first, controlled by `expand`: `'top'` (default),
`'none'`, `'selected'`, `'all'`) and `toggle(value)` (refused, with a
warning, for an unknown or disabled node, as many-of's does).
`coveredNodes(nodes, value, selection)` expands a value to every node it
stands for — what a module matches an item's categories against.

Disabled nodes follow antd's check conduction, so the hook and the antd
widgets agree: a disabled node is never covered through a checked ancestor
(nor is its subtree, through it), and a parent counts as checked once all
its *enabled* children are; a parent whose children are all disabled, or a
disabled parent, is never checked through its children. With nodes
Geometria (Síkgeometria, Térgeometria — disabled), checking Síkgeometria
gives `['geometria']` under `'topmost'` and `['geometria', 'sikgeometria']`
under `'all'`, and `coveredNodes` does not include Térgeometria. A disabled
node in the value (`setValue` and a stored value do not police them) stays
there and covers itself only. Where a disabled node breaks the cascade, the
value names what the other named nodes would not cover: under `'topmost'`
a checked disabled node beside its checked parent (`['geometria',
'tergeometria']`), and checked children beside their checked disabled parent,
as antd TreeSelect's `SHOW_PARENT` does; under `'leaves'` a checked node with
children that is disabled or has only disabled children — where antd's
`SHOW_CHILD` would drop it (and with it what it covers), so vultus-antd's
`ManyOfTreePicker` requests the field's value with the clicked node toggled rather
than antd's list. So normalizing never changes what a value covers. The same rule sanitizes a stored value. The
cost: a parent in the value stands for its subtree as it is when read, so
under `'topmost'` (and `'all'`, which lists the parent too) a child that was
disabled when the value was stored and is enabled later is covered from
then on — a stored `['geometria']` then covers Térgeometria too; `'leaves'`
names only the leaves and does not widen.

Search over labels is accent- and case-insensitive (`normalizeText`); the matching
`filterTree(nodes, query)` follows antd TreeSelect's rule: a node whose own
label matches stays with its whole subtree, any other node stays if one of
its descendants matches (with only the children that stay), and the rest
is trimmed, leaving the nodes given unchanged. Implicit initial value: the
empty list.

A `TreeNode`'s `choosable` (default `true`; a folder when `false`) is for the one-of tree, below;
this hook ignores it, so one node list can feed both kinds. Its helpers: `canChooseNode(node,
choose)` (choosable, enabled, and, under `choose: 'leaves'`, no children), `choosableValues(nodes,
choose)` (the values it accepts, in pre-order) and `treePath(nodes, value)` (the values from the
root down to `value`, inclusive; `[]` when no node has it).

```ts
const field = useManyOfTreeField({
  id: 'categories',
  nodes: [{ value: 'a', children: [{ value: 'a1' }, { value: 'a2' }] }],
});
field.toggle('a'); // field.value === ['a'] — 'topmost' collapses the subtree to the parent
```

### one-of tree (`useOneOfTreeField`)

The value is a single node id (`nodes`, the many-of tree's `TreeNode`), or `''` meaning nothing
chosen (Praeceptor's category picker, a table of contents). A node is choosable when its own
`choosable` is not `false` (a folder — a part heading with no page, a category group — is
`choosable: false`; the many-of tree ignores it, so one node list can feed both kinds), it is
enabled, and, under `choose: 'leaves'` (default `'any'`), has no children (`canChooseNode`,
`choosableValues`, `treePath` — see many-of tree, above). `setValue` refuses, with a warning (as
`useOneOfField` refuses a disabled choice): a value naming no node, a node that cannot be
chosen, and `''` unless `optional` (default `false`, as `oneOf`'s value is never empty); `clear()`
requests `''`. Controls add `nodes` (each with `choosable`, `current` — it is the value — and
`onPath` — an ancestor of it) and `byValue`, as the many-of tree's; `current` (the chosen node, or
undefined when the value is empty or names no node), `path` (the nodes from the root down to
`current`, inclusive; empty when there is none), `previous` / `next` (the choosable nodes just
before and after `current`'s own position in tree pre-order — so a `current` that cannot itself
be chosen, e.g. a value naming a folder or a node a context change disabled, still gets its true
neighbours; undefined at the ends, and with no `current`, `previous` undefined and `next` the
first choosable node), `optional`, `choose` and `expandedKeys`
(from `expand`, default `'selected'` — the value's ancestors, so a table of contents opens where
the reader is; `'top'`, `'none'` and `'all'` as the many-of tree's). The field's current state is
the chosen node's description, unless `valueDescriptions` words it differently (as `oneOf`).
Implicit initial value: `initialValue`, else `''` when `optional`, else the first node that can be
chosen in tree pre-order, else `''` (no node can be chosen; as `oneOf`'s undefined choice).

```ts
const field = useOneOfTreeField({
  id: 'category',
  nodes: [{ value: 'geo', choosable: false, children: [{ value: 'sik' }, { value: 'ter' }] }],
});
field.value; // 'sik' — the first node that can be chosen ('geo' is a folder)
field.next?.value; // 'ter'
```

### text (`useTextField`)

The value is a string. `control: 'input' | 'textarea'` (default `'input'`)
is a hint for the widget, nothing else. A field inside the field or changed
locally (`onChange`) requests on every keystroke, as moxb's, sidedao's and
Taskmaster's text fields do; a field that `commits` holds requests back
until the widget decides (blur or Enter) — any commit-mode field does this,
not something specific to text. Highlighting the search words in a result
list is the app's job (e.g. quaesitor's `WithSearch`), not this hook's.
Implicit initial value: the empty string.

```ts
const field = useTextField({ id: 'search', control: 'input' });
```

## Definitions as data

A `FieldDefinition` is a field's options in their "inside" form (no `value`
plus `onChange` or `commit`), tagged with a required `kind` — one of
`'boolean'`, `'mixed-boolean'`, `'oneOf'`, `'manyOf'`, `'numeric'`,
`'range'`, `'manyOfTree'`, `'oneOfTree'`, `'text'` (the same strings `FieldControls.type` already
carries). `kind` stays optional on each hook's own options — a hook knows
its own kind, and throws if a definition names a different one — but is
required once a field becomes plain data: a module declares its filters as a
list of `FieldDefinition`s, independent of which hook or widget ends up
running each one.

A definer who doesn't care where the value lives gives only `initialValue`
(or nothing, for the kind's implicit default); whoever runs the field — a
hook directly, or `useStoredField` (see Arguments, below) — chooses the
storage. `initialValueOf(definition, ctx)` is every kind's default in one
place, and the entry point for it: what a definition with no `initialValue`
starts at, what a reset restores, and what "is it changed?" compares
against — `false`; the first enabled choice; the empty list; `min` (or `0`)
clamped into the bounds; `[min, max]`; the empty string for text; for a
tree, the value normalized under its `selection`. (The per-kind helpers it
is built on — `boolInitialValue`, `oneOfInitialValue`, `rangeInitialValue`
and the like — are exported too.) A hook computes its kind's default once,
when the field mounts, not on every render.

The `widget` hint (`WidgetHint = string | { name: string; [option]: unknown
}`) names which widget renders the field — `'segmented'`, or `{ name:
'segmented', iconOnly: true }` with its display options — without
vultus-core knowing what a "segmented control" is; it's vultus-antd that
turns the name into a component, applying render-site overrides on top.
Each kind has a default widget when none is given; an unknown widget name
throws, in vultus-antd.

```ts
const definitions: FieldDefinition[] = [
  { kind: 'boolean', id: 'showArchived' },
  { kind: 'numeric', id: 'count', min: 0, max: 10, widget: 'slider' },
];
initialValueOf(definitions[0], {}); // false
```

## Arguments

Storage outside a field hook — a URL, localStorage — lives in vultus-core as
its own layer (ported from moxb's `url-arg`, without mobx), independent of
the field hooks: an argument is `{ key, valueType, default }`, kept in
whatever `ArgStore` is nearest.

**Value types** (`ValueType<T>`: `parse(raw)`, `format(value)`, `isEqual(a,
b)`) say how a value is kept as a string and compared; equality is the
type's own meaning (a list as a set, a range by both ends), used everywhere
two values of that type are compared — including whether a value is the
default, so it's left out of the store. `valueTypeOf(kind)` gives each field
kind's: `booleanType` (`'1'` / `'0'`), `stringType` (one-of, one-of tree, text),
`stringSetType` (many-of, many-of tree — a sorted comma list; a *present but empty*
value reads as the empty list, which differs from the key being absent
altogether), `numberType`, `rangeType` (`from..to`). A mixed-boolean field
shows an aggregate of other data and has no value type:
`valueTypeOf('mixed-boolean')` throws, and so does storing one. A choice
value containing `,`, or an empty one, cannot be written to a list and
throws — that's the definer's mistake, not outside input. A stored string
that doesn't parse, or names a choice or node that no longer exists, *is*
outside input (an edited or stale URL): it never throws, it falls back to
the default (or is dropped from a list), with a `console.warn`.

**Stores.** `ArgStore` is `read(key)`, `write(changes, method)` (`method`:
`'push'` or `'replace'`; a store without history ignores it),
`subscribe(listener)`, and optionally `hrefFor(changes)`. vultus-core ships
`memoryStore()` (tests, demos) and `localStorageStore(prefix)` (keys
namespaced as `${prefix}.${key}`, guarded for SSR so creating one outside a
browser is a safe no-op; where the browser blocks storage or refuses a
write, a failing read reads as absent and a failing write is skipped, with
one `console.warn` per store); a URL store comes from a router package —
vultus-react-router for react-router.
Create a store once — outside render, or in `useMemo` — not on every
render: each store is a new subscription target, so a fresh one per render
makes every hook below resubscribe.
`<ArgStoreProvider store={...}>` gives a subtree its store — nest providers
to put the URL around a page and localStorage around a dialog inside it. A
hook with no `ArgStoreProvider` above it throws, rather than silently
reading nothing.

**`useArg(definition)`** reads and writes one argument: `value`,
`isDefault`, `set(value, method?)`, `reset(method?)` and `hrefFor(value)`
(where the store supports it). An absent key reads as the default; writing a
value that equals the default removes the key instead of storing it.

**Batches.** `useArgWriter()` returns `apply(changes, method)` where each
change is `setArg(definition, value)` or `resetArg(definition)` — several
arguments change in one store write, one history entry (a "clear all"
button, a filter chip that also closes a detail view).

**Fields over arguments.** `argOf(definition, ctx)` is the argument a
definition's value is stored as — key = the definition's `id`, value type
from its kind, default = its resolved initial value — for a caller that
wants `useArg` directly instead of a field. `useStoredField(definition)`
runs a `FieldDefinition` as a stored field the same way: the argument's key
is the definition's `id`, its value type comes from the kind, its default
is `initialValueOf`. It returns `{ options, isDefault, reset }` — `options`
is the definition in its outside form (`value` plus `onChange`, ready for
the kind's hook), with the stored raw value made to fit the definition as
it is now (`sanitizeStored`: unknown choices or nodes dropped; a one-of
tree value naming no node, a folder or a node it cannot choose, or `''`
when the field is not optional, replaced by the initial value; numbers and
ranges clamped, and rounded when `integer`). A value that needed fixing up
warns once per field and per raw value — not again on every render, and not
at all when the key is simply absent (then the default applies, and an
absent key is not outside input).
`useStoredFields(definitions)` answers for several definitions over one
store subscription: `isDefault(id)` (throws for an id not among the
definitions), `changedCount`, and `resetAll(method)` (one write for every
field). Being a summary, it never warns — only `useStoredField` on the
field itself does.

**Links.** Every field's controls carry `hrefFor(value)`: the link that requesting `value`
amounts to, or `undefined` where nothing gives one. With `value` + `onChange` or `value` +
`commit`, the caller passes it; inside the field it is always `undefined`. `useStoredField`
wires its own from the store (`useArg`'s `hrefFor`, itself from the store's), so a field stored
over a URL store (vultus-react-router's) links each value it could be set to, e.g.
`field.hrefFor(field.choices[0].value)` next to the field's own widget. A link built from
`hrefFor` is as fresh as the render that built it: a URL that changes without re-rendering its
component (another key of the query, the path) leaves it stale. Render an app's own links (a
previous / next pair) in a component that re-renders on location changes (with react-router,
one that calls `useLocation`), or compute them at interaction time (vultus-antd's
`OneOfTreeList` asks again as the pointer enters a link, on its focus, a button press, its
context menu, a modified click).

```tsx
const store = memoryStore();

function Filters() {
  return (
    <ArgStoreProvider store={store}>
      <Category />
    </ArgStoreProvider>
  );
}

function Category() {
  const { options, reset } = useStoredField({ kind: 'manyOf', id: 'tags', choices: [{ value: 'urgent' }] });
  const field = useManyOfField(options);
  // ...
}
```

## Components

`VultusComponentsContext` (default `{}`) / `useVultusComponents()` is how an app lends its own
UI to vultus/optio in place of their native indicators — today just `Spinner` (`SpinnerProps`:
`spinnerKey`, `size?`, `label?`; `VultusComponents.Spinner?: SpinnerComponent`). vultus-antd's
`VultusProvider` merges a `components` prop into the outer context value; without one, the
outer value (or this default) applies, as `linkComponent` does today.

Every call site that may render a lent `Spinner` asks for its key through `useSpinnerKey(localKey)`
rather than hardcoding it, so an app can scope a whole subtree's keys to one instance:
`<SpinnerScope name="optio:process:p1">` makes every `useSpinnerKey` call inside it return
`'optio:process:p1/' + localKey`; scopes nest by joining names with `/`, outermost first.
Library-local keys are namespaced (`vultus:...`, `optio:...`) so they never collide with an
app's own keys.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.

## License

Apache-2.0
