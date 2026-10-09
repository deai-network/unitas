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

## Boolean fields

`<BoolSwitch field={f} />` and `<BoolCheckbox field={f} />` render a `useBoolField` or
`useMixedBoolField` field (vultus-core) as antd's Switch or Checkbox: the same field, two
looks. Both show the value (mixed: the switch's knob in the middle of a half-tinted track,
the checkbox indeterminate), show progress while a commit is pending, and obtain the
field's confirmation for the requested value before changing it. The tooltip shows, when
enabled, the current value's description and then the description; when disabled, the
reason and then the description. The switch uses the label as its accessible name; the
checkbox shows it; both use the value's description as their accessible description.
In the mixed state a click requests on and a double click off (a click from mixed waits
about 300 ms to tell them apart). `useConfirm` is the confirmation hook they share with
`ActionButton`: the control decides what it requests, then calls `confirm`.

## One-of fields

`<OneOfSelect field={f} />`, `<OneOfSegmented field={f} />` and `<OneOfSlider field={f} />`
render a `useOneOfField` field (vultus-core) as antd's Select, Segmented or Slider: the same
field, three looks. Each choice shows its
icon before its label; `OneOfSegmented iconOnly` shows the icons only, the label becoming
the segment's accessible name and the first line of its tooltip. Primary and danger choices
are styled as `CombinedActionButton` styles its rows (primary bold in the primary colour,
danger in the danger colour), only while enabled; the closed select mirrors the current
choice. Hovering a choice shows its description, a disabled one its reason first; the closed
select shows the field's tooltip (held back while the list is open). A choice's confirmation
comes first; a danger choice's confirmation has a danger OK. antd's native label titles are
switched off so they do not compete with the tooltips. In `OneOfSelect`, choices with a `group`
are listed after the others, under their group's heading (e.g. older versions of a model).
`OneOfSelect inlineDescriptions` shows each choice's description in the open list, under its
label (a bold heading), smaller and wrapping, instead of in a tooltip; a disabled choice's
tooltip keeps its reason, and the closed select shows the label only.

`OneOfSlider` is for ordered choices (an effort level): each choice a mark on the track, the
handle on the current one. Hovering any part of the slider shows the field's tooltip, except a
mark with a tooltip of its own (its choice's description or reason), which shows that one. A choice is requested once per move, when the move ends (release, a mark click, an
arrow key's keyup), not at each step of a drag; a move that ends on a disabled choice requests
nothing and the handle returns. While the requested choice is asked and committed the handle
stays on it, then shows the stored value (the old one after a Cancel or a failure).
`markStyle` styles the choices' labels (a smaller font in a dense toolbar).

## Tooltips

Field and choice tooltips render their texts as markdown (the accessible description gets
the plain text). A reason paragraph is led by a gray no-entry sign, a description paragraph
by an info sign, so the two never read as one text; "Current state:" has no sign. The no-entry
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
