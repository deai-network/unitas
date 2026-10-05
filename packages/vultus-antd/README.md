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
  `BoolSwitch`, `BoolCheckbox`, `Confirmable` and `ConfirmTypingModal`.
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
`Confirmable` is the confirmation wrapper they share with `ActionButton`.

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
