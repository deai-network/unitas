# vultus-antd

Ant Design action-button and markdown components for vultus. Depends on and
re-exports `vultus-core`, adding the Ant Design bindings for its injection
seams (`antd.message` for `MessageSinkContext`, Ant Design's `Form` for the
`FormLike` interface, and so on).

## Install

```sh
npm install vultus-antd
```

## Peer dependencies

- `antd` >=6
- `react` >=18
- `react-dom` >=18
- `react-i18next` >=15

## Entry points

- `.` — re-exports all of `vultus-core`, plus `VultusProvider`,
  `ActionButton`, `CombinedActionButton`, `FormSubmitButton`, `FormPanel`,
  `BoolSwitch`, `BoolCheckbox`, `useConfirm` and `ConfirmTypingModal`.
- `./markdown` — `Markdown` and the `MarkdownProps` type, standalone.

## Spinner slot

`<VultusProvider components={{ Spinner }}>` lends the app's own loading spinner to
vultus (and, through vultus-antd, to optio) in place of antd's `<Spin>`:

```tsx
<VultusProvider components={{ Spinner: DaeoSpinner }}>
  <App />
</VultusProvider>
```

`DaeoSpinner` (or any app spinner) implements `SpinnerProps` from `vultus-core`
(`spinnerKey`, `size?`, `label?`); neither side imports the other. `components` merges
over whatever an outer `VultusProvider` (or a bare `VultusComponentsContext.Provider`,
for apps without vultus-antd) already provided, so a nested `VultusProvider` can
override one slot without losing the others, and omitting `components` leaves the outer
value (or vultus-core's `{}` default, meaning "render antd's own spinners") untouched.
A nested `components={{ Spinner: undefined }}` explicitly clears an inherited `Spinner`,
so that one subtree can opt back into antd's own spinner under a provider that set one.

Where vultus-antd shows it (all `size="small"`):

| component | local key | where |
|---|---|---|
| `ActionButton`, `CombinedActionButton`, `FormSubmitButton` | `vultus:action:<id>` | the button's loading icon |
| `BoolCheckbox` | `vultus:field:<id>` | after the checkbox and its label, while a commit is pending |
| `BoolSwitch` | `vultus:field:<id>` | after the switch (antd's Switch has no icon slot, so it shows no loading state of its own) |
| `OneOfSelect` | `vultus:field:<id>` | the select's suffix icon, while a commit is pending |

Wrap a subtree in `<SpinnerScope name="...">` (from vultus-core) to prefix every spinner
key inside with that name, so several instances of the same view on one page get distinct,
stable keys — e.g. an app wrapping each open process's view in
`<SpinnerScope name={"process:" + id}>` turns the library-local key `vultus:action:send`
into `process:123/vultus:action:send`. Scopes nest (outer/inner).

## Boolean fields

`<BoolSwitch field={f} />` and `<BoolCheckbox field={f} />` render a `useBoolField` or
`useMixedBoolField` field (vultus-core) as antd's Switch or Checkbox: the same field, two
looks. Both show the value (mixed: the switch's knob in the middle of a half-tinted track,
the checkbox indeterminate), show progress while a commit is pending, and obtain the
field's confirmation for the requested value before changing it. The tooltip shows, when
enabled, the current value's description and then the description; when disabled, the
reason and then the description. The switch uses the label as its accessible name; the
checkbox shows it; both use the value's description as their accessible description.
`BoolSwitch` also takes antd's `checkedChildren` / `unCheckedChildren` for a short text
inside the switch (the unchecked one shows while mixed).
In the mixed state a click requests on and a double click off (a click from mixed waits
about 300 ms to tell them apart). `useConfirm` is the confirmation hook they share with
`ActionButton`: the control decides what it requests, then calls `confirm`.

## One-of fields

`<OneOfSelect field={f} />`, `<OneOfSegmented field={f} />` and `<OneOfSlider field={f} />`
render a `useOneOfField` field (vultus-core) as antd's Select, Segmented or Slider: the same
field, three looks. Each choice shows its
icon before its label; `OneOfSegmented iconOnly` shows the icons only, the label becoming
the segment's accessible name and the first line of its tooltip. Primary
and danger choices are styled as `CombinedActionButton` styles its rows (primary bold in the
primary colour, danger in the danger colour), only while enabled; the closed select mirrors
the current choice. Hovering a choice shows its description, a disabled one its reason first;
the closed select shows the field's tooltip (held back while the list is open). An enabled
`OneOfSegmented` has no tooltip of its own, so each segment's tooltip shows the field's
description first (after the label, for an icon-only choice); a segment with nothing of its
own still shows it. On a segment and on a slider's mark, every choice being on show, the
choice's description is led by "Current state:" on the current one and by "Switch to:" on
another enabled one (what a click does); a disabled one's has no lead, as it cannot be
switched to. A slider's mark, like a segment, shows the field's description first. A choice's confirmation comes first; a danger choice's confirmation has a danger OK. antd's native label titles are
switched off so they do not compete with the tooltips. In `OneOfSelect`, choices with a `group`
are listed after the others, under their group's heading (e.g. older versions of a model).
`OneOfSelect inlineDescriptions` shows each choice's description in the open list, under its
label (a bold heading), smaller and wrapping, instead of in a tooltip; a disabled choice's
tooltip keeps its reason, and the closed select shows the label only.

`OneOfSlider` is for ordered choices (an effort level): each choice a mark on the track, the
handle on the current one. Hovering the track or the handle shows only what the field is (its
description), nothing about its values; hovering a mark shows the field's description, then the
choice's ("Current state:" / "Switch to:", a disabled one's reason first). A choice is requested once per move, when the move ends (release, a mark click, an
arrow key's keyup), not at each step of a drag; a move that ends on a disabled choice requests
nothing and the handle returns. While the requested choice is asked and committed the handle
stays on it, then shows the stored value (the old one after a Cancel or a failure).
`markStyle` styles the choices' labels (a smaller font in a dense toolbar).

## Tooltips

Field and choice tooltips render their texts as markdown (the accessible description gets
the plain text). A reason paragraph is led by a gray no-entry sign, a description paragraph
by an info sign, so the two never read as one text; "Current state:" has no sign of its own.
`VultusProvider texts` translates "Current state:" (`currentState`) and "Switch to:"
(`switchTo`). The no-entry
sign is gray, not the danger colour: a disabled thing is no danger. While a widget's
confirmation is open, the widget holds back its own tooltips, which would cover it.

## Typing confirmation

A `{ kind: 'typing', title, entityName, description, prompt? }` confirmation
opens `ConfirmTypingModal`: the description, an instruction line, and an input
in which the user types the phrase (`entityName`). The OK button carries the
action's label and enables once the phrase is
typed exactly; Enter in the input then confirms too. `prompt` is the
instruction line, with `{phrase}` where the highlighted phrase goes, so a
translation can place it anywhere (`'Zum Bestätigen {phrase} eingeben:'`); a
prompt without `{phrase}` gets the phrase after it. Without `prompt` the line
reads "Type ‹phrase› to confirm:".

## CombinedActionButton selection

By default a menu pick becomes the main action and stays there. Pass
`keepOriginalDefault` (to `CombinedActionButton`, or to `ActionButton` with an
array) to return the main half to the first enabled action once the picked
action fires or its confirmation is dismissed.

## Icon placement

`ActionButton` and `CombinedActionButton` accept an optional
`iconPlacement?: 'start' | 'end'` (default `'start'`, today's behaviour),
forwarded to antd's `Button` for the rendered button — `ActionButton`'s
button, and `CombinedActionButton`'s main (action) half. antd puts the
loading spinner in that same slot, so the pending state keeps the icon's
position. On `CombinedActionButton`, `'end'` also moves each open-list row's
icon to after its label — antd's `Menu` always renders an item's `icon` slot
before its label, so that case builds the icon into the row's own label node
instead. `'start'` and unset keep antd's normal (left) menu-item icon
placement via that slot, unless `align` is also set (see below).

## Content alignment

`ActionButton` and `CombinedActionButton` accept an optional
`align?: 'start' | 'center' | 'end'`. It sets where the button's content
(label plus icon or spinner) sits within the button's width — via
`justify-content` on antd's `Button` (a flex container) — on `ActionButton`'s
button, `CombinedActionButton`'s main (action) half, and (matching) each
open-list row's content. It only matters when the button is wider than its
content. Unset keeps antd's default (centered) exactly. On
`CombinedActionButton`, when `align` is set, each row's icon is also folded
out of antd's `icon` slot — a sibling of the aligned content, so it could not
move with it — and into the aligned wrapper alongside the label, so the row's
icon and label align and move together as one unit: before the label for
`iconPlacement` `'start'`/unset, after it for `'end'`.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.

## License

Apache-2.0
