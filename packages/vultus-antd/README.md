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

- `.` — re-exports all of `vultus-core`, plus:
  - `VultusProvider`, and its texts: `defaultVultusTexts`, `useVultusTexts`,
    `VultusTextsContext` and the `VultusTexts` type;
  - actions: `ActionButton`, `CombinedActionButton`, `FormSubmitButton`, `FormPanel`,
    `useConfirm` (and the `Confirm` type), `ConfirmTypingModal`;
  - `Markdown` (and the `MarkdownProps` type);
  - field widgets: `BoolSwitch`, `BoolCheckbox`, `OneOfSelect`, `OneOfSegmented`,
    `OneOfSlider`, `ManyOfCheckboxes`, `ManyOfSwitches`, `ManyOfSelect`, `NumericInput`,
    `NumericSlider`, `RangeSlider`, `ManyOfTreeChecklist`, `ManyOfTreePicker`, `TextInput`, `SearchInput`,
    and the `ManyOfCheckboxesProps`, `ManyOfSwitchesProps`, `ManyOfSelectProps`,
    `NumericInputProps`, `NumericSliderProps`, `RangeSliderProps`, `ManyOfTreeChecklistProps`,
    `ManyOfTreePickerProps`, `TextInputProps` and `SearchInputProps` types;
  - for a widget of one's own: `ChoiceLabel`, `ChoiceNote`, and the request hooks
    `useFieldRequest` (with `sameMembers` and the `RequestableField` type),
    `useManyOfRequest`, `useNumericRequest`, `useManyOfTreeRequest`;
  - `FieldWidget`, `Field`, and the `FieldWidgetProps`, `WidgetNameOf`, `WidgetHintOf` and
    `FieldProps` types.
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

## Many-of fields

`<ManyOfCheckboxes field={f} />`, `<ManyOfSwitches field={f} />` and `<ManyOfSelect field={f} />`
render a `useManyOfField` field (vultus-core) as antd's Checkbox.Group, a small switch per choice
(the label clickable too), or antd's Select in `mode="multiple"`: three looks, as the one-of
widgets. Every choice shows its label (ChoiceLabel) and its note (ChoiceNote, in
`token.colorTextDescription`) after it; a `dimmed` choice's label is in that colour too, still
selectable. `ManyOfCheckboxes` and `ManyOfSwitches` take `vertical` for a column instead of the
default row; `ManyOfSwitches` also takes `size` (`'small'` | `'middle'`, the switch's own size). In
both, an enabled field shows each choice's own tooltip on hover (a disabled choice's reason first,
then its description — no "Current state:"/"Switch to:" lead, since every choice is already
shown, selected or not); a disabled field shows its reason for the whole control instead. A
disabled choice's checkbox or switch (and label, in `token.colorTextDisabled`) is disabled and
requests nothing.

`ManyOfSelect` shows each selected choice as a tag, collapsing to "+N ..." once they no longer fit
(`maxTagCount="responsive"`); `allowClear` clears every choice at once. In the open list each
choice shows its label and note right-aligned (ChoiceRow), with its own tooltip; a disabled choice
cannot be selected. The search box filters choices by label, accent- and case-insensitive
(`normalizeText`), as the tree widgets' search does. Choices with a `group` are listed after the
others, under their group's heading, as `OneOfSelect`'s. There is no `tags` mode: a free value
typed in is not a choice. Closed, it shows `field.placeholder` while empty and the field's
tooltip, held back while the list is open or a confirmation is asking.

Each change — toggling a checkbox or switch, picking or removing a tag, clearing — requests the
field's whole next list of values through `useManyOfRequest` (exported, for a custom many-of
widget over `useManyOfField`'s own controls): it normalizes the request to the field's choice
order, so where a toggled choice lands in it doesn't matter, and a request naming the same members
as the current value, in any order, is a no-op. A many-of selection names no single choice to
label the confirmation's OK with, so it is labelled with the field itself, as a boolean field's
is. The field's label is each widget's accessible name; a pending commit disables the control and
shows the lent Spinner (or antd's own loading state) next to it.

## Numeric and range fields

`<NumericInput field={f} />` and `<NumericSlider field={f} />` render a `useNumericField` field
(vultus-core) as antd's InputNumber or Slider; `<RangeSlider field={f} />` renders a
`useRangeField` field the same way, in antd's Slider `range` mode, one handle per end (Praeceptor's
school-years filter).

`NumericInput` keeps a draft while editing — each keystroke only changes the draft, not the field
— and requests when editing ends: on blur, on Enter, or on a stepper click (antd's `onStep`). An
empty or unparsable draft on blur (or Enter) returns to the field's value, requesting nothing.
`min`/`max`/`step` come from the field, `precision` is 0 when `integer`, and the unit shows as the
InputNumber's suffix, next to the lent Spinner (or antd's own) while a commit is pending.

`NumericSlider` and `RangeSlider` request once per move, when it ends (release, an arrow key's
keyup), not at each step of a drag, as `OneOfSlider` does; the shown value follows the drag while
it is in progress. Per the owner's slider rule (no jump back to the old value while a request is
in flight), the moved-to value — both ends `[from, to]` for `RangeSlider` — stays shown while its
confirmation is open or its commit is pending; once neither is true the field's own value shows
again: the new one on success, the old one after a Cancel or a failure. `NumericSlider` needs both
`min` and `max` on the field (there is no way to size a track otherwise); without them it throws,
naming the field. Each handle keeps antd's own tooltip (hover, focus, drag), formatting its value
with `field.format`; the rest of the slider (the track) carries the field's own tooltip instead,
with no "Current state:" lead (a handle's tooltip already shows it), held back while hovering a
handle (its own tooltip would double up) or while a confirmation is open. `showValue` puts the
field's formatted value (`field.valueText`) before the slider (moxb's `showNumber`). `RangeSlider`
names its two handles to assistive tech after the field's label, with `VultusProvider texts`'
`from` and `to`: "School years, from" / "School years, to".

`useNumericRequest` (exported, for a custom numeric widget) is `useFieldRequest` with `===`
equality: a request naming the field's current number is a no-op (e.g. a second Enter before the
first commit lands). No single choice names a number, so its confirmation's OK is labelled with
the field itself, as a many-of or tree request's is; the one-of widgets label theirs with the
chosen choice instead.

## Many-of tree fields

`<ManyOfTreePicker field={f} />` (antd TreeSelect) and `<ManyOfTreeChecklist field={f} />` (moxb's always-open
checkable tree) render a `useManyOfTreeField` field (vultus-core): the desktop filter and the always-open
list, both over the same checking rules.

Checking uses antd's own conduction: a checked node checks its whole subtree, and a node all of
whose children are checked shows checked; `selection: 'independent'` turns that off
(`treeCheckStrictly` / `checkStrictly`), checking every node on its own. antd's conduction does not
cascade into a disabled node: a checked parent does not show a disabled child as checked, and a
parent whose *enabled* children are all checked shows checked regardless of a disabled one. The
hook follows the same rule (vultus-core's `useManyOfTreeField`, `normalizeTreeValue` and `coveredNodes`;
see its README), so the widgets and the field's value agree: with Térgeometria disabled, checking
Síkgeometria checks Geometria, the value is `['geometria']` under `'topmost'`, and `coveredNodes`
leaves Térgeometria out.

Each node shows its label (ChoiceLabel: in `token.colorTextDescription` while `dimmed`) and its
note (ChoiceNote: right-aligned across the row in `ManyOfTreePicker`'s dropdown, in brackets after the
label in `ManyOfTreeChecklist` — "Kombinatorika (4)"), with its own tooltip (a disabled node's reason
first, then its description) while the field is enabled; a disabled field shows its reason over
the whole control instead. A disabled node cannot be checked. Each change — checking, removing a
tag, clearing — is requested normalized to the field's `selection` through the field's confirmation
(`useManyOfTreeRequest`, exported for a custom tree widget: set equality, as a many-of field's request).
`ManyOfTreePicker` requests, in the cascading selections, the field's value with the clicked node (or the
removed tag's) toggled (`toggleTreeValue`), not antd's own list, which its `SHOW_CHILD` strategy cuts
short of a checked disabled parent.

The search box — `ManyOfTreeChecklist`'s own, always there, and `ManyOfTreePicker`'s dropdown search, or the
one in its `panel="drawer"` drawer, which holds a `ManyOfTreeChecklist` — filters by label, accent- and
case-insensitive (`normalizeText`), keeping a match with its whole subtree and its ancestors, every
kept node open while searching (the user may still close one; a change to the query opens them all
again). The other nodes are only hidden, not removed, so checking while searching still conducts
over the whole tree, and the keyboard skips them. Clearing the search brings back the expansion
from before. The search box's placeholder is `VultusProvider texts`' `search`; no many-of widget
has a search box of its own today (`ManyOfSelect`'s is antd's own, unlabelled one).

`ManyOfTreePicker` closed shows the value as tags, by label, as many as fit, the rest collapsing to
"+N ..." (`maxTagCount="responsive"`), or `field.placeholder` while empty; `allowClear` clears
everything at once. `panel="drawer"` opens the tree in a panel from the bottom of the screen
instead, for a phone (Taskmaster's): the closed field keeps no dropdown or search of its own: a tap
on it (or Enter or Space while it has focus), except on its clear and remove icons, opens an antd
Drawer, 88% high, titled with the field's label, holding a `ManyOfTreeChecklist` of the same field (its
search box, notes in brackets) and a "Done" button (`VultusProvider texts`' `done`) that closes it.
The app decides when to switch to it (e.g. on a narrow screen); a disabled or pending field does
not open it. `summary="firstWords"` shows no tags but one line, each selected node's first words
("Osztók, legnagyobb…, Feltételes…"): about 16 characters of each selected label when more than one
is selected, else 40, cut at a word boundary, never ending on one of `VultusProvider texts`'
`joiningWords` (`['and', 'of', 'the']` by default, compared case-insensitively — "Gráfok és…"
becomes "Gráfok…") or on `,`, `;` or `:`.

## Text fields

`<TextInput field={f} />` and `<SearchInput field={f} />` render a `useTextField` field
(vultus-core) as antd's Input — or `Input.TextArea` when `field.control === 'textarea'`, for
`TextInput` only — or an Input with a search icon (`prefix`) and a clear button.

A field that does not commit (`!field.commits`) requests on every keystroke: there is no ambiguity
to wait out, as a numeric or tree value has, so a bound form's own state stays in step at once. A
committing field (`field.commits`) keeps a draft while typing instead and requests only when
editing ends: on blur, or on Enter for the single-line input (a textarea's Enter is a newline, so
only blur requests there). The input shows a draft in both modes, changed by the keystroke
itself, so a value that is stored later than the keystroke — an app's asynchronous `onChange`, a
store that renders later — neither moves the caret nor loses a character typed meanwhile. The
draft follows the field's value whenever it changes other than through the widget's own requests
(a change from outside, a committed value), not when the value is one of its own live requests
landing late. So in live mode the input keeps showing what was typed: if the app's own `onChange`
rejects or filters a change, the rejected text stays visible until the next accepted change (a
URL or memory store, which keep every change, are unaffected).

`SearchInput` clears on Escape in every mode — resets the draft and requests `''` at once, not
waiting for a blur or Enter — and, for a committing field, on its clear button too (antd's
`onClear`, fired once per click, separately from `onChange`; a non-committing field's clear button
already requests at once, through its own `onChange`). `onEnter` (a widget prop, not part of the
definition) fires after Enter's own request, with the typed text, so a caller can run a search once
the field holds (or is about to hold) it; for a committing field that is the value Enter just
requested, which `field.value` itself only shows once the commit lands. Enter and Escape are both
ignored mid-IME-composition (`e.nativeEvent.isComposing`), so a composing edit neither requests nor
fires either shortcut — `TextInput`'s own Enter is already ignored there by antd itself.

## Tooltips

Field and choice tooltips render their texts as markdown (the accessible description gets
the plain text). A reason paragraph is led by a gray no-entry sign, a description paragraph
by an info sign, so the two never read as one text; "Current state:" has no sign of its own.
`VultusProvider texts` translates "Current state:" (`currentState`) and "Switch to:"
(`switchTo`). The no-entry
sign is gray, not the danger colour: a disabled thing is no danger. While a widget's
confirmation is open, the widget holds back its own tooltips, which would cover it.

A field widget's own control (`TextInput`, `SearchInput`, `NumericInput`, `OneOfSelect`,
`ManyOfSelect`, `ManyOfTreePicker`, `BoolSwitch`, `BoolCheckbox` and the sliders) sits in a span
with the class `vultus-tooltip-anchor`, whether or not it has a tooltip right now: a tooltip that
comes and goes with the value (a value with a description and one without, or the description
moving to `<Field item>`'s label) would otherwise remount the control, and the keyboard focus would
drop; without a title the tooltip never opens. That span is the control's layout box: the widget's
`style` gives it its layout keys — `flex`, `flexGrow`, `flexShrink`, `flexBasis`, `alignSelf`,
`justifySelf`, `order`, the margins, the grid placement — which leave the control, so they reach the
parent and apply once, and its `width` (`'100%'` to fill a form column), the control filling the
span (so a percentage applies once) and the tooltip staying on the control; the rest of `style`
stays on the control. Without a width, `TextInput`, `SearchInput` and the three selects have a block
span: the inputs fill their container, as antd's Input does, and a select fills a form item, as
antd intends (`ant-select-in-form-item`), keeping its natural width elsewhere. A slider's width goes
to its body (with `showValue`, the value and the slider), in which the slider grows; a textarea's
likewise, beside its spinner. Other controls with a tooltip (choices, buttons, a disabled field's
checkboxes or tree) get their span only while they have one; a `block` `ActionButton` with a reason
has a block span.

`VultusTexts` (`VultusProvider texts`) also carries `done` (ManyOfTreePicker's drawer, closing it),
`search` (a tree widget's search box placeholder), `joiningWords` (ManyOfTreePicker's first-words
summary), and `from` / `to` (RangeSlider's handle names) — see Many-of tree fields and Numeric and range
fields, above.

## `<Field>`

`<Field definition={d} />` runs the kind's hook — picked by `d.kind` — and renders its widget.

**Storage.** Inside the field by default (from the definition's `initialValue`); `stored` keeps
the value in the nearest `ArgStore` instead (`useStoredField`, vultus-core: the URL, localStorage,
...); or the render site passes `value` together with `onChange` or `commit`, keeping it outside
the field entirely. `stored` does not go together with `value`, `onChange` or `commit` — giving
both throws (and with a literal `stored`, `<Field definition={d} stored value={…} />` is a type
error). An `initialValue` override only makes sense for a value kept inside the field: giving
one together with `stored`, `value`, `onChange` or `commit` throws too.

**Precedence**, for both the widget's display options (`iconOnly`, `vertical`, `showValue`,
`panel`, ...) and the definition's own values (`label`, `description`, `enabled` / `disabled`,
`visible` / `hidden`, `placeholder`, ...): render-site props win, then the definition's own value,
then the kind's default. A render site may override any of the definition's values but `kind` and
`id`; overriding either half of a pair (`enabled`/`disabled`, or `visible`/`hidden`) replaces
both, rather than leaving the other half's meaning from the definition in force.

**The widget** is picked the same way: the render-site `widget` prop, else the definition's
`widget` hint, else the kind's default (boolean and mixed-boolean `switch`, oneOf `select`, manyOf
`checkboxes`, numeric `input`, range `slider`, manyOfTree `picker`, text `input`) — each a name, or
`{ name, ...displayOptions }` (`widget: { name: 'segmented', iconOnly: true }`). Names are general
UI terms, so vultus-core stays free of antd. An unknown kind or widget name throws.

**With `stored`**, the values the store reads from the definition itself (`initialValue`,
`choices`, `nodes`, `selection`, `min`, `max`, `integer`) must come from the definition — a render
site cannot override them there (a context function in the definition covers data that changes
instead); overriding one throws, naming the field and the offending key. The props are typed to
catch this too, but only when `stored` is a literal `true` at the call site
(`<Field definition={d} stored choices={...} />` is a type error); the runtime check catches it
regardless of how `stored` was computed — `stored={flag}` — since the typing cannot see through a
variable.

**`registry`** is the kind's hook's error-routes registry (vultus-core), for a commit's
`errorRoute`.

**`item`** renders the control inside an antd form item (the label, unless the widget shows its
own, as `BoolCheckbox` does; the description as the label's info tooltip; the last commit's
messages under the control, each a live region — an error an `alert`, the others a `status`). The
messages show once: `<Field item>` silences the field's own `MessageSink` (which would otherwise
also toast them under `VultusProvider`). So does the description: while the label's info sign
shows it, the control's own tooltips leave it out and keep what the sign cannot say — the current
state ("Current state: …") and, when disabled, the reason; a choice's own description (a segment's,
a slider mark's) stays, and the control's accessible description keeps the field's. A widget that
shows the label itself (`BoolCheckbox`: the item has no label, so no info sign) keeps the
description in its tooltip.

`<Field>`'s props are typed by the definition's `kind`: a `oneOf` definition's `<Field>` only
accepts `oneOf`-shaped overrides and `OneOfSelect` / `OneOfSegmented` / `OneOfSlider` display
props, and so on, and only a boolean field's `value` is a plain boolean. That typing cannot resolve
for a component generic over `<D extends FieldDefinition>` (the kind-keyed props have nothing to
key on): render `<Field<FieldDefinition> definition={d} ... />` there, as a generic wrapper must.

## `<FieldWidget>`

`<FieldWidget field={controls} />` picks the widget for controls a caller made with a kind's hook
itself (sidedao's `InputField`): by the render-site `widget`, else the controls' own `widget` hint,
else the kind's default — the same names and precedence as `<Field>`'s widget selection, minus the
definition layer (there is none here). Both throw on an unknown kind or widget name.

`item` is as `<Field item>`'s: the control in the same labelled form item, its last commit's
messages shown once. Since `<FieldWidget>` has no definition of its own to silence the
`MessageSink` through, a caller of `<FieldWidget item>` must silence it itself, above its own hook
call: `<MessageSinkContext.Provider value={SILENT}>`, with a module-level no-op
(`const SILENT: MessageSink = () => {};`) — a new function on every render would re-create the
field's setter.

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
