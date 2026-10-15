# vultus: the one-of tree field kind

Date: 2026-10-15. Builds on `2026-10-15-vultus-field-kinds-design.md` (released as vultus-core
0.5.2, vultus-react-router 0.1.1, vultus-antd 0.7.0), whose conventions apply unless this says
otherwise.

## Why

A single choice from a tree. Three uses (owner, 2026-10-15):

- completing the kind set: oneOf / manyOf, oneOfTree / manyOfTree;
- Praeceptor: a task's category in an editor, a "browse one category" filter;
- navigating chapters through a table of contents: the value is where the reader is, kept in
  the URL, each entry a real link.

Neither moxb nor Taskmaster has a single-choice tree; the nodes, search and phone panel come from
the many-of tree.

## Decisions (owner, 2026-10-15)

1. **Which nodes can be chosen**: both a field-level `choose: 'any' | 'leaves'` and a per-node
   `choosable: false` (a folder: a part heading with no page, a category group).
2. **Empty value**: `optional: true` allows nothing chosen (`''`); without it the field is never
   empty, as oneOf.
3. **Widgets**: a dropdown picker and an inline list; previous / next as controls, not a widget.
4. **Hint**: the definition picks the widget with the existing `widget` hint, `'picker'` (default)
   or `'list'`.
5. **Links**: field options and controls get `hrefFor`; a stored field gets it from its store.
6. **Release**: vultus-core 0.5.3 and vultus-antd 0.7.1 (additive); vultus-react-router unchanged.

## The kind (vultus-core): `useOneOfTreeField`, kind `'oneOfTree'`

```ts
{ kind: 'oneOfTree', id, label, ...the usual field options,
  nodes: ValueOrFn<TreeNode<T>[], Ctx>,  // the many-of tree's nodes
  choose?: 'any' | 'leaves',             // default 'any'
  optional?: boolean,                    // default false
  expand?: TreeExpand,                   // default 'selected'
}
```

- **Nodes**: `TreeNode` (a choice with `children`: label, description, note, dimmed, enabled /
  disabled with a reason) gains `choosable?: boolean`, default true. The many-of tree ignores it,
  so one node list can feed both kinds.
- **Can be chosen**: a node that is choosable, enabled, and, under `choose: 'leaves'`, has no
  children.
- **Value**: `T | ''`, `''` meaning nothing chosen. Stored as a plain string (`stringType`).
- **Initial value**: `initialValue` (resolved through the field context), else `''` when
  `optional`, else the first node that can be chosen in tree pre-order, else `''` (no node can be
  chosen; as oneOf's undefined).
- **Requests** go through `setValue`, as in every kind. It refuses, with a warning (as oneOf
  refuses a disabled choice): a value naming no node, a node that cannot be chosen, and `''`
  unless `optional`. `clear()` requests `''` (refused unless `optional`).
- **Current state**: the current node's description, unless `valueDescriptions` words it
  differently (as oneOf).
- **expand**: the many-of tree's `TreeExpand`; default `'selected'` (the value's ancestors), so a
  table of contents opens where the reader is.
- **Stored values** (sanitizing in the store layer): a stored value naming no node or a node that
  cannot be chosen, or `''` for a field that is not optional, falls back to the initial value with
  a warning, as oneOf.

**Controls** (`OneOfTreeFieldControls<T> extends FieldControls<T | '', T | ''>`):

| control | what |
|---|---|
| `nodes: OneOfTreeNodeControls<T>[]` | each node resolved as a choice, its children likewise, and `choosable` (the rule above), `current` (it is the value), `onPath` (an ancestor of the value) |
| `byValue: Map<T, OneOfTreeNodeControls<T>>` | every node |
| `current` | the chosen node, or undefined (empty, or a value naming no node) |
| `path` | the nodes from the root down to `current` (empty when there is none) |
| `previous`, `next` | the nodes that can be chosen just before and after `current` in tree pre-order (reading order); undefined at the ends, and when there is no `current` (`next` is then the first) |
| `optional`, `choose` | as defined |
| `expandedKeys: T[]` | the nodes a widget opens at first (from `expand`) |
| `clear()` | requests `''` |

`OneOfTreeNodeControls` is its own type (not the many-of tree's `TreeNodeControls`, whose
`checked` means something else). Exported: the hook, its option, own-option and controls types,
`OneOfTreeNodeControls`, `oneOfTreeInitialValue`.

**Kind plumbing** (`kinds.ts`): `FieldKind` and the `FieldDefinition` union gain `'oneOfTree'`;
`initialValueOf`, `valueTypeOf` (`stringType`), `sanitizeStored` and `argOf` handle it.

## Links (vultus-core): `hrefFor`

- Field options: in both "outside" storage branches (`value` + `onChange`, `value` + `commit`),
  an optional `hrefFor(value: TRequest): string | undefined`, the link that requesting `value`
  amounts to.
- Field controls: `hrefFor?(value)` in every kind (optional in the type, so controls built by hand
  for 0.5.2 still fit; the hooks always provide it), answering `undefined` when the options gave
  none. An inside field ignores a passed `hrefFor` (nothing reads its value from a URL).
- `useStoredField` passes its store's `hrefFor` (`useArg`'s, which answers `undefined` when the
  store has none: the memory and localStorage stores) into the options it returns, so a `stored`
  field over `ReactRouterArgStore` links each value (`#/…?toc=2.3` under a hash router).
- `<Field>`: `hrefFor` belongs with `value` / `onChange` / `commit` (not a definition value); with
  `stored` the render site cannot pass it, and without `value` / `onChange` / `commit` it throws.
- Today only `OneOfTreeList` uses it; an app's previous / next buttons can use
  `field.hrefFor?.(field.next.value)`.
- Freshness: an href computed at render is as fresh as that render, and another query key or the
  path can change without re-rendering the field. OneOfTreeList asks `hrefFor` again when a link
  is used (hover, focus, press, context menu, a modified click); an app's own links should live in
  a component that re-renders on location changes, or be computed when used.

## Widgets (vultus-antd)

| kind | widgets |
|---|---|
| oneOfTree | `OneOfTreePicker` (`picker`, default), `OneOfTreeList` (`list`) |

Both: the request path of OneOfSelect (`useFieldRequest`: the field's confirmation first, commit,
pending), the stable `vultus-tooltip-anchor` span on the field's control, disabled nodes greyed
with their reason as tooltip, notes and dimmed nodes as in the many-of tree, `data-field-id` on the
control and `data-value` per row in the list and on the picker's root.

**OneOfTreePicker** (antd TreeSelect, single):
- Choosing a node that can be chosen requests it and closes the dropdown; a node that cannot be
  chosen (a folder, or a node with children under `'leaves'`) is not selectable: clicking it opens
  or closes it.
- Search as the many-of tree's: accent- and case-insensitive, a match keeps its subtree, the
  keyboard never lands on a hidden node.
- The closed field shows the chosen node's label; `summary="path"` shows its path instead
  ("Geometria › Síkgeometria", the separator from texts).
- `panel="drawer"` (a phone): a tap opens a drawer from the bottom with the field's label, a
  search box and an OneOfTreeList of the field; choosing closes it (no Done).
- `optional`: the definition's `placeholder` while empty, and a clear button.
- `listHeight`, `popupMatchSelectWidth`, `size`, `style` as ManyOfTreePicker's.

**OneOfTreeList** (antd Tree, no checkboxes; a sidebar, a table of contents):
- The current node shows selected; its ancestors (`onPath`) are marked (strong text).
- Clicking a node that can be chosen requests it, and opens it if it has children; clicking a
  folder opens or closes it.
- Follows the value: when the value changes (previous / next, the URL), its ancestors open (the
  user's own expansions kept) and the node scrolls into view.
- Links: where `field.hrefFor` gives an href, each node that can be chosen is an `<a href>`, while
  the field is enabled and no commit is pending (otherwise plain text, as a disabled node is). A
  plain click requests the node through the request path (default prevented); a click with
  Ctrl, Cmd, Shift or Alt, or the middle button, is left to the browser (a new tab, which reads
  the value from its URL).
- `search` (prop, default off): a search box above the tree, as the many-of tree's.
- `optional`: a first row with the definition's `placeholder` (else `texts.none`) that requests
  `''`, shown selected while the value is empty.
- Keyboard: antd Tree's (arrows; Enter chooses, or opens and closes a folder).

**Registration**: `<FieldWidget>` and `<Field>` map `oneOfTree` to `{ picker, list }`, default
`picker`; the hint names gain `'list'`. Under `stored`, the keys the store layer reads (`nodes`,
`choose`, `optional`, `initialValue`) cannot be overridden at the render site, as for the other
kinds.

**Texts** (`VultusProvider texts`): `pathSeparator` (`' › '`), `none` (`'None'`).

## Gallery

`Fields/One of tree`: picker (plain, disabled nodes with reasons, notes and dimmed, folders,
`choose: 'leaves'`, optional with a placeholder, `summary="path"`, `panel="drawer"`), list
(optional with "All categories", search), a table of contents (list + previous / next buttons)
stored in the URL under a router, its entries real links. The `<Field>` definitions story gets a
one-of tree with the `list` hint.

## Docs

vultus-core README: the kind, `choosable`, `hrefFor`. vultus-antd README: the two widgets, the
`list` hint, the texts. The main spec's widget table gains the row.

## Testing

- vultus-core: the choosable rule (flag, disabled, leaves), the initial value in each case, the
  refusals, `clear`, `current` / `path` / `previous` / `next` (skipping folders and disabled nodes,
  at the ends, with no current), the value description, `expandedKeys`, sanitizing a stored value
  (unknown, a folder, `''` optional or not), `hrefFor` from the options to the controls and from a
  store with links through `useStoredField`.
- vultus-react-router: a stored field over `ReactRouterArgStore` gets working hrefs.
- vultus-antd: each widget's choosing, folders, search, path summary, drawer, clear and the
  optional row, following the value, links (plain click requests, modified click does not),
  confirmation and commit, disabled nodes, the registration and hints, the tooltip anchor and
  focus kept across value changes.

## Review focus

- A stored value naming a folder, or a node that a context change made unchoosable.
- The nodes changing (a function of the context) so the current value names no node: `current`
  undefined, `next` the first node; the picker shows no label for it (never the raw value) and
  the list selects nothing.
- A search that hides the current node; the keyboard in a filtered list.
- `hrefFor` with a store that has none (plain rows, no `<a>`); a disabled field or a pending
  commit (no links, no requests).
- An optional field with an `initialValue`: clearing stores `''` explicitly.

## Not in this design

- A column drill-down (antd Cascader): the drawer covers phones.
- A previous / next widget.
- `optional` for oneOf.
