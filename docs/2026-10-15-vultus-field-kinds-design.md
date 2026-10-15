# vultus: field kinds, definitions as data, and URL arguments

Design, agreed with the owner on 2026-10-15. Builds on
`2026-10-05-vultus-field-model-design.md`. First consumer: Praeceptor
(`harmacolindor/praeceptor`), whose brief `docs/superpowers/specs/2026-10-15-praeceptor-vultus-needs.md`
was re-assessed point by point to arrive here; the brief is not authoritative, this document is.

## Why

Praeceptor's knowledge modules declare their filters and print options as data. The framework
renders every field with vultus widgets, keeps the filter values in the URL (hash routing with
react-router 7) and the print options in localStorage. vultus has boolean and one-of fields, as
hooks. It lacks the other kinds Praeceptor uses (many-of, range, many-of tree, text; numeric comes along),
a way to hand a list of definitions to one renderer, and storage outside the hook.

## Prior work, and what is taken from it

The excavator seed (`excavator/docs/vultus-library-seed.md`) names moxb and sidedao as the
precursors vultus unifies. Copying their ideas is the plan; only mobx stays behind.
Local copies: superego `~/antd6/prior-work/`.

| prior work | taken |
|---|---|
| moxb `many-of` (`ManyOf`, `ManyOfImpl`, `ManyOfAnt`) | choices of one-of's type, `isSelected`, `toggle`, set equality; widgets select, checkboxes, switches (with `vertical`) |
| moxb `numeric` (`Numeric`, `NumericAnt`, `SliderAnt`) | `min`, `max`, `step`, `unit`, `onlyInteger`; `formatter`, `showNumber`; InputNumber and Slider widgets |
| moxb `date` (`DateRange`) | the shape of a range value; its preset `ranges` are left out |
| moxb `tree` (`Tree`, `TreeAnt`) | nodes with children, `expandValues`, `strictSelect`, the always-open checkable tree |
| moxb `text` (`Text`, `TextAnt`, `TextSearchAnt`) | `control: 'input' \| 'textarea'`; search box with Esc to clear |
| moxb `value` (`Value`, `ValueImpl`) | `initialValue` as a function, equality per type (`valueCompareFunction`), `placeholder` |
| moxb `stellar-router-core/src/url-arg` | argument definitions (key, value type, default), value types with `parse` / `format` / `isEqual` (ordered vs unordered lists), defaults left out of the URL, pluggable backends (`UrlArgBackend`), batched `setArg` / `resetArg` changes, `_getModifiedUrl` |
| moxb `stellar-router-core` (location manager, URL schemas, interceptors, links, NavRefs) | not now: a later port (README TODO) |
| moxb antd `parseProps`, `...FormAnt` | render-site props override the definition's; a labelled form-item variant of each widget |
| sidedao `InputFields` (`InputField`, `useTextField`, `InputFieldGroup`) | a dispatcher on the controls' `type`; `onEnter`; presentation hints in the definition; equality per type (`isEqual`) |
| Taskmaster (`TaskFilters`, `CategoryTreeSelect`, `PrintDialog`, `urlState.ts`) | the tree widget's behaviour (topmost selection, counts, accent-insensitive search, phone panel, first-words summary); "present but empty list" in the URL |

## Decisions (owner, 2026-10-15)

1. **A field definition is today's option object in its inside form**, plus `kind`. A definer
   who does not care where the value lives gives only `initialValue`; whoever runs the field
   chooses the storage. `initialValue` still does not go together with `value` + `onChange` or
   `commit`: when the value lives outside, the storage holds the default (decision 6).
2. **`kind` takes the values `FieldControls.type` already has** (`'boolean'`, `'mixed-boolean'`,
   `'oneOf'`) and new ones (`'manyOf'`, `'numeric'`, `'range'`, `'manyOfTree'`, `'text'`).
3. **`initialValue` is the default**: what storage falls back to, what "reset" restores, and
   what "is it set?" compares against. Each kind has an implicit one, exported as
   `initialValueOf(definition, ctx)`.
4. **Functions in a definition receive a context** the runner provides:
   `ValueOrFn<T, Ctx> = T | ((ctx: Ctx) => T)`. Functions without parameters keep working.
5. **The context comes from a React context** (convenience over an explicit argument), and a
   missing one fails loudly, never by passing `undefined` along.
6. **Storage outside the hook is an argument layer in vultus-core**, ported from moxb's url-arg
   without mobx: value types per kind, defaults, equality, batched changes, and stores (URL,
   localStorage, memory).
7. **Routers get adapter packages**, as UI libraries get vultus-antd. vultus-react-router is
   built now (Praeceptor and excavator both use react-router 7); vultus-window-history and the
   stellar-router port are README TODOs.
8. **Widgets are chosen by a hint in the definition**, overridable at the render site together
   with any other value of the definition (moxb's `parseProps`); without either, each kind has a
   default widget. `<Field>` renders a definition; `<FieldWidget>` renders controls a caller made
   itself. An unknown kind or widget throws.
9. **`item`**: a labelled form-item variant of `<Field>` (label, description, messages), for
   vertical forms such as Praeceptor's print dialog. Layout as data and labels or actions in field
   lists wait for the form layer.
10. **Every new widget gets its gallery stories as soon as it is done.**
11. **Releases**: vultus-core as soon as its part is merged (Praeceptor's module-api is written
    against its types); vultus-react-router and vultus-antd together, after theirs.

## Definitions and the context (vultus-core)

```ts
type ValueOrFn<T, Ctx = unknown> = T | ((ctx: Ctx) => T)

type FieldDefinition<Ctx = unknown> =
  | { kind: 'boolean' } & BoolFieldOptions<Ctx>              // all in their inside form
  | { kind: 'mixed-boolean' } & MixedBoolFieldOptions<Ctx>
  | { kind: 'oneOf' } & OneOfFieldOptions<string, Ctx>
  | { kind: 'manyOf' } & ManyOfFieldOptions<string, Ctx>
  | { kind: 'numeric' } & NumericFieldOptions<Ctx>
  | { kind: 'range' } & RangeFieldOptions<Ctx>
  | { kind: 'manyOfTree' } & ManyOfTreeFieldOptions<Ctx>
  | { kind: 'text' } & TextFieldOptions<Ctx>
```

- `kind` is optional in the hooks' own options (a hook knows its kind), so today's callers are
  unaffected; it is required in `FieldDefinition`.
- Every option that took a `ValueOrFn` takes one with the context; `initialValue` may now be a
  function too (Taskmaster's "all rounds" follows the data).
- **New common options**: `placeholder` (as moxb's `Value`), and `widget`, the widget hint
  (below). **New common controls**: `placeholder`, and `commits` (the field stores through
  `commit`), so a widget can hold back requests while typing.
- **New on the shared choice type** (one-of, many-of, tree nodes): `note`, a short text shown after
  the label in secondary colour ("12", "12 · 8%"), and `dimmed` (e.g. no matching tasks). Choices
  and nodes may be a context function, so counts are recomputed on every render.

**Context.** `createFieldContext<Ctx>()` returns a typed `Provider`; the hooks read the nearest
`FieldContextProvider`. Nested providers merge (Praeceptor can provide `t` and `lang` at the
module page and `values` and `items` lower down). Loud failures:

- a definition's function that declares a parameter, resolved with no provider above it, throws
  an error naming the field, the option, and the missing `FieldContextProvider`. (The rule goes by
  the function's declared parameter count, so `(ctx = {}) => ...` escapes it; the README says so.)
- the provided value is wrapped so that reading a key that was never provided throws, naming the
  key and listing the keys present. A key provided with the value `undefined` is fine.

## The new kinds (vultus-core hooks)

### many-of (`useManyOfField`, kind `'manyOf'`)

- Value: a list of choice values, a set. Choices are one-of's `OneOfChoice`, static or a context
  function.
- Controls: `value`, `setValue(list)`, `toggle(choice)`, `isSelected(choice)`, `choices` (each
  with `selected`).
- A disabled choice can be toggled in neither direction; the hook refuses it with a warning, as
  one-of's `setValue` does (in moxb only the widget prevented it).
- Implicit initial value: `[]`. "All of them" is written out, e.g. as a context function.

### numeric (`useNumericField`, kind `'numeric'`)

- Value: a number. Options (each may be a context function): `min`, `max` (optional), `step`,
  `integer` (moxb's `onlyInteger`), `unit`, `format(n, ctx)` (default: the number and the unit).
- Implicit initial value: `min`, else `0`, clamped into the bounds.

### range (`useRangeField`, kind `'range'`)

- Value: `[from, to]` with `min <= from <= to <= max`. Options as numeric's, but `min` and `max`
  required and `step` defaulting to 1.
- Controls carry the formatted value as `valueText` ("2010/11–2025/26") for a layout that puts it
  in its label; numeric's controls have it too.
- Implicit initial value: `[min, max]`. A stored value outside the current bounds (bounds follow
  the data, an old URL may not) is shown clamped.

### many-of tree (`useManyOfTreeField`, kind `'manyOfTree'`)

- Value: a list of node ids, a set. Nodes are choices with `children`.
- `selection`: what the value lists:
  - `'topmost'` (default; antd `SHOW_PARENT`, Praeceptor's case): a checked node stands for its
    subtree;
  - `'all'` (moxb's behaviour);
  - `'leaves'` (antd `SHOW_CHILD`);
  - `'independent'` (moxb's `strictSelect`, antd `checkStrictly`).

  The hook normalizes the value (with `'topmost'`, a node and its descendant collapse to the
  node). `coveredNodes(nodes, value, selection?)` expands a value to every node it covers, which is
  what a module matches against (the resolved nodes, since a definition's `nodes` may need the
  field context).
- `expand`: `'top'` (default), `'none'`, `'selected'` (moxb's `expandValues`), `'all'`.
- Search over the labels ignores accents and case: vultus-core gets `normalizeText` (decompose,
  strip combining marks, lower case); no quaesitor dependency. Matches keep their ancestors, and
  the tree opens fully while a search is active.
- Implicit initial value: `[]`.

### text (`useTextField`, kind `'text'`)

- Value: a string. `control: 'input' | 'textarea'` (moxb). Implicit initial value: `''`.
- Requests on every change (live, as moxb, sidedao and Taskmaster do); when the field `commits`,
  the widget requests on blur or Enter instead.
- Highlighting search words is the app's: Praeceptor wraps its list in quaesitor's
  `WithSearch query={value}`.

## Value types

Each kind has a value type (moxb's `UrlArgTypeDef`): `parse`, `format`, `isEqual`. Equality is the
kind's meaning, so it is used everywhere a value is compared (moxb's `isDefault` compared with
`===` and was wrong for arrays).

| kind | in a store | equality |
|---|---|---|
| boolean | `1` / `0` | `===` |
| oneOf, text | the string | `===` |
| manyOf, manyOfTree | sorted comma list; an empty string is the empty list | as sets |
| numeric | the number | `===` |
| range | `from..to` | both ends |
| mixed-boolean | not storable (an aggregate of other data); storing one throws | |

A choice value containing `,` cannot be stored in a list and throws. A stored value that does not
parse, or names a choice that does not exist, came from outside (an edited or old URL): it falls
back to the default, or is dropped from a list, with a console warning, not an error.

## The argument layer (vultus-core)

- **`ArgStore`** (moxb's `UrlArgBackend`, made to take batches): `read(key)`,
  `write(changes, method)` (`method`: push or replace; stores without history ignore it),
  `subscribe(listener)`, and optionally `hrefFor(changes)`.
- **Stores in vultus-core**: `memoryStore()` (tests, demos) and `localStorageStore(prefix)`
  (Praeceptor's print options). The URL store comes from a router package.
- **`ArgStoreProvider store={...}`** gives a subtree its store (Praeceptor: the URL around the
  module page, localStorage around the print dialog). A hook with no store above it throws.
- **`ArgDefinition<T>`**: `key`, value type, default (a context function allowed).
  **`useArg(definition)`**: `value`, `isDefault`, `set(value, method?)`, `reset(method?)`,
  `hrefFor(value)` where the store supports it. An absent key reads as the default; writing the
  default removes the key; a present but empty list is the empty list.
- **Batches**: `useArgWriter()` returns `apply(changes, method)`, where changes are
  `setArg(definition, value)` and `resetArg(definition)` (moxb's `ArgChange`): one write, one
  history entry ("clear all"; a category chip that also closes the task).
- **Fields over arguments**: `useStoredField(definition)` derives the argument (key = the
  definition's `id`, value type from `kind`, default = `initialValueOf`) and returns
  `{ options, isDefault, reset }`, `options` being the definition in its outside form
  (`value` + `onChange`). `useStoredFields(definitions)` gives `isDefault(id)`, `changedCount`
  ("more filters (3)") and `resetAll(method)`.
- **Arguments without a field** use the same hooks, e.g. Praeceptor's `task` (pushed).
- **Reactivity** without mobx: `useSyncExternalStore` over the store.

## vultus-react-router (new package)

- **`<ReactRouterArgStore>`**, placed inside the router, provides an `ArgStore` over the router's
  location: the query inside the hash with a hash router, `location.search` with a browser router.
  Writes navigate to the same path with the changed query (`replace` or push), keeping other
  parameters.
- **Batching**: changes written in the same tick are collected and applied as one navigation (a
  push if any of them asked for one). Without this, several `setSearchParams` calls in one tick
  lose all but the last.
- The query stays readable: `,` and `..` are not percent-encoded.
- `hrefFor` uses the router's `createHref`.
- Peers: `react-router` >= 7, `react`. No antd (as vultus-core).

## vultus-antd

**Widgets** (vultus names; the hint name in brackets):

| kind | widgets |
|---|---|
| boolean, mixed-boolean | `BoolSwitch` (`switch`, default), `BoolCheckbox` (`checkbox`) |
| oneOf | `OneOfSelect` (`select`, default), `OneOfSegmented` (`segmented`), `OneOfSlider` (`slider`) |
| manyOf | `ManyOfCheckboxes` (`checkboxes`, default), `ManyOfSelect` (`select`), `ManyOfSwitches` (`switches`) |
| numeric | `NumericInput` (`input`, default), `NumericSlider` (`slider`) |
| range | `RangeSlider` (`slider`, default) |
| tree | `ManyOfTreePicker` (`picker`, default), `ManyOfTreeChecklist` (`checklist`) |
| text | `TextInput` (`input`, default), `SearchInput` (`search`) |

- **Common behaviour**: the conventions of today's field widgets (tooltips in markdown, a
  disabled thing's reason first, then the description; held-back tooltips while a confirmation
  is open; the Spinner slot while a commit is pending). Choices show their `note` and `dimmed`
  state in the widgets that list them (checkboxes, switches, selects, tree).
- **ManyOfCheckboxes** (antd `Checkbox.Group`) and **ManyOfSwitches** (a small switch per choice,
  the label clickable) take `vertical`. **ManyOfSelect** is antd's Select in multiple mode: search,
  groups as in `OneOfSelect`, as many tags as fit. No `tags` mode (free values are not a choice).
- **NumericInput** (antd InputNumber, unit shown and parsed) requests when editing ends (blur,
  Enter, a stepper click). **NumericSlider** and **RangeSlider** (antd Slider) request once per
  move, when it ends, as `OneOfSlider` does; the shown value follows the drag. Handle tooltips show
  the formatted value; the track shows the field's description. `showValue` puts the formatted
  value next to the slider (moxb's `showNumber`).
- **ManyOfTreePicker** (antd TreeSelect): search, as many tags as fit, clear all, notes right-aligned,
  a node's description as its tooltip. `panel="drawer"` opens the tree in a panel from the bottom
  instead (search, checkboxes, notes in brackets, Done), the closed field opening the panel on any
  tap but its clear and remove icons. `summary="firstWords"` shows one line of the selections'
  first words ("Osztók, legnagyobb…, Feltételes…") instead of tags. The app decides when (on a
  phone); the joining words trimmed from the end of a first-words cut, "Done" and the drawer's
  search placeholder are `VultusProvider texts`. **ManyOfTreeChecklist** is moxb's always-open checkable
  tree, with the same search.
- **SearchInput**: a search icon, clear button, Esc clears, `onEnter` (a widget prop, not part of
  the definition). **TextInput** renders an Input or a TextArea by `control`.

**`<Field>`.** `<Field definition={d} />` runs the kind's hook and renders its widget.

- Storage: inside by default; `stored` keeps the value in the nearest `ArgStore`
  (`useStoredField`); or the runner passes `value` + `onChange` or `commit` itself.
- Precedence, for the widget and its display options (`iconOnly`, `vertical`, `showValue`,
  `panel`, ...) and for the definition's own values (`label`, `description`, `enabled` /
  `disabled`, `visible` / `hidden`, `placeholder`): render-site props, then the definition, then the
  kind's default.
- The definition's hint is a name or `{ name, ...displayOptions }`:
  `widget: { name: 'segmented', iconOnly: true }`. Names are general UI terms, so vultus-core stays
  free of antd.
- `item` renders the control inside an antd form item: the label, the description as the
  label's info tooltip, and the messages of the last commit under the control.

**`<FieldWidget field={controls} />`** picks the widget by the controls' `type`, for callers that
ran a hook themselves (sidedao's `InputField`). Both throw on an unknown kind or widget name.

## Gallery

Each new widget gets its stories in `vultus-gallery` as soon as it is done, in the style of the
existing `Fields/...` stories (titled examples, light and dark): disabled choices with reasons,
notes and dimmed choices, commit with pending and confirmation, the tree's phone panel and
first-words summary. Two more: `<Field>` over a list of definitions (hints, overrides, `item`),
and stored fields over a memory router with the URL shown as it changes.

## Packages and compatibility

| package | version | contents |
|---|---|---|
| vultus-core | 0.4.0 -> 0.5.0 | definitions and context, the new kinds' hooks, value types, the argument layer, memory and localStorage stores |
| vultus-react-router | new, 0.1.0 | the URL store over react-router 7 |
| vultus-antd | 0.6.1 -> 0.7.0 | the new widgets, `<Field>`, `<FieldWidget>`, `item` |

The changes are additive for today's callers (optio, excavator): `kind` optional in hook options,
functions without parameters still accepted, new options and controls optional. optio's `^0.4.0`
and excavator's `^0.6.1` ranges do not pick up the new minors until someone bumps them.

README TODOs (a few sentences each): vultus-window-history; the stellar-router port (location
manager with path tokens and URL schemas, `permanent` arguments, interceptors with `try...`,
links and `BoundLink`, NavRefs, redirects); the form layer (validation, layout as data, labels and
actions in field lists).

## Order of work and releases

- **A. vultus-core**
  1. `ValueOrFn` with the context, `FieldContextProvider`, the loud errors.
  2. `kind`, `FieldDefinition`, `initialValueOf`, `placeholder`, `widget` hint, `note` / `dimmed`,
     `commits`, `normalizeText`.
  3. The hooks: many-of, numeric, range, many-of tree, text.
  4. Value types; the argument layer; memory and localStorage stores; `useStoredField(s)`.

  Merge, then release vultus-core 0.5.0.
- **B. vultus-react-router.**
- **C. vultus-antd**: the widgets kind by kind, each with its gallery stories; then `<Field>`,
  `<FieldWidget>`, `item`, and the two gallery stories over definitions.

  Merge, then release vultus-react-router 0.1.0 and vultus-antd 0.7.0.

## Testing

- vultus-core (vitest, testing-library, as today): each hook's value, requests, disabled choices,
  implicit initial values; the context errors (no provider, missing key); each value type's round
  trip and equality, and the outside-input fallbacks; `useArg`, batches and `useStoredField(s)` over
  the memory store; the localStorage store under jsdom. `no-antd.test.ts` keeps guarding the core.
- vultus-react-router: over `createMemoryRouter`: reading from the hash query, push vs replace,
  several changes in one tick making one navigation, other parameters and the path kept; a test
  that it imports no antd.
- vultus-antd: each widget as today's widget tests do (rendering, tooltips, requests, confirmation,
  the Spinner slot); `<Field>` precedence and dispatch, unknown names throwing; `ManyOfTreePicker`'s panel
  and summary.

## Not in this design

Validation and the form layer; vultus-window-history; the stellar-router port; numeric kinds
beyond numeric and range (dates); moxb's interval colouring and preset ranges; Select's `tags`
mode.

## The seed's open questions this settles

From `excavator/docs/vultus-library-seed.md`, section 7: field architecture (7.1): a hook per kind,
with definitions as data next to them; state backend (7.4): the hook's own state inside, stores
through `useSyncExternalStore` outside, no mobx; reactive thunks (7.11): context functions,
re-evaluated on every render.
