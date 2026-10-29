# vultus: a render slot for a tree node's label

Date: 2026-10-29. Status: requested by praeceptor-25, approved by the owner ("go ahead as
proposed", relayed by praeceptor-25); built on a branch, to main after the owner clears it.

## Need

Praeceptor lights up what changed in a text when doc-kit flips a book's spelling variant, with
harma-style's `<ChangingText changeKey>{string}</ChangingText>` (the same key with a new string
animates the difference). Doc-kit's table-of-contents filter is a oneOfTree field shown with the
`list` widget; its `nodes` read `ctx.values.variant`, so on a flip the nodes keep their values
and get new labels. Praeceptor wants each changed title to light up. The field definitions are
React-free (they also run on the server), so the React content comes in where the widget is
rendered: `<FieldWidget field={field} ... />`.

vultus has no way to do this today: ChoiceLabel draws the node's string label, and the
VultusProvider lends components app-wide only.

## Design

- A display prop on the four tree widgets (OneOfTreeList, OneOfTreePicker, ManyOfTreeChecklist,
  ManyOfTreePicker): `renderLabel?: (node) => ReactNode`, `node` the node's controls (its
  `value`, `label` and the rest). FieldWidget passes it through as it does the other display
  props.
- What it returns is drawn where the label text is drawn now, inside ChoiceLabel, so the label's
  look is kept: dimmed or the variant colour, the icon first, the row's link, the tooltip wrapper,
  and the strong where a chosen path is shown. Without the prop, nothing changes.
- The label string stays the string everywhere else: the search (filterTree, labelMatches), the
  accessible names, TreeSelect's tags and closed text, the tooltips.
- A new `renderLabel` function rebuilds the tree data, as `hrefFor` does; callers keep it stable.

## Identity (the light-up depends on it)

1. When a node's label changes and its value does not, its row keeps its React identity (rc-tree
   keys rows by value; the title's element structure is the same), so a stateful component inside
   the rendered label keeps its state.
2. Nothing else in the tree widgets remounts the rows when the nodes change: not the list motion,
   not the shown-nodes rebuild, not the search box.

Both are tests: a stateful component rendered through `renderLabel` keeps its state (a mount
counter that does not move) when the node's label changes, and when the nodes are rebuilt with the
same values. A row that is mounted anew (a folder reopened) starts fresh, which is wanted.

## Out of scope

The flat one-of and many-of widgets (choices, not nodes); no request for them.
