# vultus: a pending field keeps keyboard focus

Date: 2026-10-29. Status: decided by the owner, being built.

## Problem

While a field is pending (its commit runs, or its `pending` option says the app is busy with
it), every vultus-antd field widget renders its antd control `disabled`. The browser moves focus
off a disabled element, so a keyboard or screen-reader user who flips a field with the keyboard
lands on the page body and has to tab back in after every change. Pending ends, focus does not
come back.

Seen first by praeceptor-25 on doc-kit's spelling switch (OneOfSegmented, pending for the second
the other version takes to load), confirmed in a browser on the gallery: Definitions/Field group,
"Pending while the page settles", and on a plain commit, Fields/One of, "Primary and danger
choices". The commit case has been there since vultus-antd 0.6.1, the open item "committed fields
lose keyboard focus because widgets are disabled while pending".

## Decision (owner, 2026-10-29)

Of three options (stay focusable; keep disabling and put focus back afterwards; leave it), the
owner chose **stay focusable**: while pending, a widget locks without the `disabled` attribute,
for every field widget that locks while pending, the commit case included.

## The rule

A field widget whose field is **enabled and pending** is *locked*:

1. **Focusable.** No `disabled` on the control or any of its focusable parts, so focus stays
   where it is and the keyboard keeps working on it. A field that is not enabled is disabled
   exactly as today (`!field.enabled` still disables).
2. **Said to be unavailable.** `aria-disabled="true"` on the control's focusable element or its
   role element (radiogroup, switch, combobox, slider handle, tree, textbox), so a screen reader
   says it is unavailable.
3. **Looks disabled.** The control keeps the look `disabled` gave it: antd's disabled text colour
   (`token.colorTextDisabled`), disabled background where the control has one
   (`token.colorBgContainerDisabled`), and the not-allowed cursor, applied through the
   component's `styles`/`style` props and theme tokens (no stylesheet, no hard-coded colours).
   The spinner shows as today.
4. **Changes nothing.** A click, key or drag requests nothing and leaves no trace: the request
   hooks already return early while pending, without a warning (useFieldRequest, useBoolRequest,
   useSliderMove); what a component keeps on its own is held too: a select's or tree picker's
   popup stays closed (`open={false}`), a text or number input is `readOnly` (focus stays, its
   draft is kept, typing does nothing), a slider's handle stays on the field's value, a tree's
   checks and selection stay the field's.
5. **Back to normal when pending ends,** focus still where the user left it.

One shared helper names the state, so every widget reads it the same way:
`isLocked(field) = field.enabled && field.pending`.

## Per widget

| Widget | antd control | Lock |
|---|---|---|
| OneOfSegmented | Segmented | not disabled; `aria-disabled` on the radiogroup; items in the disabled colour and cursor (`styles.item`). Prototyped and checked in the browser: focus stays across an arrow-key flip, the app's pending and a commit alike. |
| BoolSwitch, ManyOfSwitches | Switch | not disabled, **no `loading`** (antd's Switch counts `loading` as disabled); the spinner after the switch: the lent Spinner as today, else antd's Spin, as BoolCheckbox shows it. Without a lent Spinner the knob no longer spins: the one visible change. |
| BoolCheckbox, ManyOfCheckboxes | Checkbox, Checkbox.Group | not disabled; `aria-disabled`; disabled look on box and label. |
| OneOfSelect, ManyOfSelect | Select | not disabled; `open={false}`; `loading` and the suffix spinner stay (Select's `loading` does not disable). |
| OneOfTreePicker, ManyOfTreePicker | TreeSelect | as the selects; the search is not cleared (it was, only because disabling closed the tree). |
| OneOfTreeList, ManyOfTreeChecklist | Tree | not disabled; selection and checks stay the field's; a node's link (`hrefFor`) keeps its element, so a focused link is not swapped for text, but does not navigate while locked. |
| OneOfSlider, NumericSlider, RangeSlider | Slider | not disabled; `aria-disabled` on the handles; the handle stays on the field's value (useSliderMove). |
| TextInput, SearchInput, NumericInput | Input, Input.Search, InputNumber | `readOnly` instead of disabled; the draft is kept. |

Actions (ActionButton, CombinedActionButton, FormSubmitButton, the action menus) disable while
their action runs too, and lose focus the same way. They are not fields and not part of this
decision; the owner is asked separately.

## Docs

- vultus-core `field.ts`: the `pending` option's and `FieldControls.pending`'s docs drop the
  caveat that a text input loses focus and its draft when pending starts; they say the widgets
  lock (focusable, unavailable, changes ignored).
- vultus-core and vultus-antd READMEs: the same; the spinner table's BoolSwitch row says the
  spinner follows the switch whether or not one is lent.
- Each widget's JSDoc: "a pending commit disables" becomes "while pending it is locked".

## Tests

- Unit (vitest, jsdom), per widget: while pending, the control is not disabled, carries
  `aria-disabled="true"`, and a user change (click, key, typing, drag) requests nothing; popups
  stay closed; a field that is not enabled is still disabled; after pending, normal.
  jsdom does not move focus off disabled elements, so focus itself is checked in the browser.
- Browser (headless /usr/bin/chromium against the gallery): for one widget of each kind, focus
  it, flip it with the keyboard into a slow commit, and check focus stays on it while pending and
  after.

## Release

None now: Praeceptor links the unitas clone. Merged to main after the owner tries it in the
gallery and clears it.
