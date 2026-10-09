# vultus: field model design notes (2026-10-05, in discussion with the owner)

Starting point: excavator `docs/vultus-library-seed.md` (2026-05-12, section 7 lists the open
design questions), moxb (`github.com/moxb/moxb`, Bind/Value/Bool/Action, mobx, inheritance) and
the sidedao InputFields (`oasisprotocol/dapp-sidedao`, `frontend/src/components/InputFields`,
plain React hooks; actions as degenerate fields). Local copies: superego `~/antd6/prior-work/`.
Trigger: the Sources & Connections page needs a three-state autopilot switch whose value is
derived from data and whose change is an immediate server mutation.

## Decisions

1. No inheritance (seed 7.10). moxb's Bind hierarchy existed because mobx observables lived on
   the objects; with hooks as the state holder, vultus follows the sidedao pattern: field hooks
   built on a shared core, composing smaller hooks where they fit.
2. External storage is required: a field's value can live outside the field (application data,
   derived values), as in moxb's getValue/setValue, not only in the hook's own state as in
   sidedao.

## Open (in order of discussion)
3. Where the value lives: inside the field (the hook's own state, sidedao) or outside it
   (controlled: the caller passes the value each render and a setter, as moxb's
   getValue/setValue pair; derived values are just computed values).
4. What setting does: either a local change (form editing, committed later by a submit) or an
   immediate commit. An immediately committing field gets its setter through the action core: the
   setter is an action whose argument is the new value, so the field carries the action's
   pending state, errors, reason and confirmation ("action as degenerate field", from the other
   side).
5. While a commit is in flight the field shows its current value and pending; it waits until the
   setter action returns, then shows whatever the value is then. Messages the action produced are
   shown with the field.
6. Order of work: first a normal binary field (one data model, two widgets: checkbox and switch),
   verified; then the three-state version for aggregates, which may turn out to be a oneOf / enum
   rather than a boolean (decided when we get there).
7. Actions report messages, not only errors: vultus's action core takes sidedao's
   `ExecutionContext` now, minimally: `fire(args, ctx)` with `ctx.info / warn / error`, the
   messages landing on the descriptor with their severity (no locations yet). A setter action
   that succeeds can still report a warning (e.g. "3 pairs skipped").
8. Messages are shown as toasts for now; how they attach to widgets is refined later. The
   priority is the data flow and the architecture.
9. Names: `useBoolField` (hook), `BoolCheckbox` and `BoolSwitch` (vultus-antd widgets).
   `ActionSwitch` is dropped.
10. Build order (owner, 2026-10-05): the binary field is built and tested in vultus only (no
    release, excavator untouched); when satisfied, the three-state version; then release and
    integrate into excavator.

## Three-state fields (owner, 2026-10-05)

11. An aggregate on/off (some items on, some off) is a boolean field whose *shown* value may also
    be `'mixed'`, not a oneOf: what can be requested stays `true | false`. Precedents: moxb's
    `Bool` with `value` undefined rendered indeterminate (toggle from undefined -> true); ARIA's
    `aria-checked="mixed"`; antd's indeterminate Checkbox. `'mixed'` rather than `undefined`, so
    "not known yet" stays distinct.
12. The field core separates the shown value type from the requestable one
    (`useFieldCore<TValue, TRequest>`); `setValue('mixed')` is a type error.
13. `useBoolField` stays as it is; a sibling hook on the same core carries the mixed value
    (`value: boolean | 'mixed'`, `setValue(boolean)`, toggle from mixed -> true). The same widgets
    (BoolSwitch: knob in the middle; BoolCheckbox: indeterminate) render fields of both hooks.
14. `aggregateBool(values)` in vultus-core derives true / false / 'mixed'; no items at all is not a
    value but a disabled field with a reason.
15. `valueDescriptions`: plain texts keyed by value (`true` / `false` / `mixed`, later the choices
    of a oneOf), next to the static `description` (sidedao's description, moxb's help). No values
    interpolated into them. The controls expose the current one as `valueDescription`.
16. Tooltip: an enabled field shows the description, then its current state: the value
    description led by "Current state:" (owner, 2026-10-05: the value description first, then the
    description, read as if the description were true now, e.g. "Off for all of them. Keeps this
    connection's datasets synchronized automatically."). A disabled field shows the reason first,
    then the description, and leaves the current state out (it usually says what a click does).
    The description and the current state are also the control's accessible description (a
    switch has no ARIA "mixed", so it says what the state is). "Current state:" is one of the
    texts vultus-antd writes itself; apps translate it through VultusProvider's `texts`.
17. Owner (2026-10-05): from the mixed state a single click requests on and a double click
    requests off (instead of leaving unchangeable items out of the aggregate). The widgets wait
    about 300 ms after a click from mixed to tell the two apart; from on or off a click acts at
    once. Confirmations open under program control after the gesture is resolved, for the value
    actually requested. The mixed value description should mention the double click.

## One-of fields (owner, 2026-10-09)

Built for optio-conversation-ui's session controls (model, mode, Claude Code's permission
mode), starting from moxb's OneOf (`BindOneOfChoice`: value, label, help, disabled, reason).

18. `useOneOfField` on the field core; choices `{ value, label?, description?, icon?,
    enabled?/disabled?, variant? }`, static or derived (`ValueOrFn`). Requesting a disabled or
    unknown choice is ignored with a warning.
19. Texts: each choice has a `description` (what choosing it does), shown when hovering it and
    used as the field's current state while it is chosen; `valueDescriptions` stays optional, to
    word a state differently.
20. Widgets: `OneOfSelect` (antd Select) and `OneOfSegmented` (antd Segmented), on the same
    field; Segmented is for short always-visible choices (excavator's header preferences).
21. A choice's `variant` (`default` / `primary` / `danger`) is styled as CombinedActionButton
    styles its rows, only while the choice is enabled; the closed select mirrors the current
    choice; a danger choice's confirmation has a danger OK. Dangerous choices get a simple
    confirmation (popconfirm) where the caller asks for one.
22. Choices may carry an `icon` (before the label); `OneOfSegmented iconOnly` shows icons only
    (as ActionButton's iconOnly), the label becoming the accessible name and leading the tooltip.
23. Descriptions and reasons are markdown, everywhere a field tooltip shows them.
24. Tooltip paragraphs are marked: a reason is led by a gray no-entry sign, a description by an
    info sign, also when only one of them is present. Not the danger colour for the no-entry
    sign: a disabled option is no danger.
25. While a widget's confirmation is open (popconfirm, cascade modal, typing confirmation), the
    widget holds back its own tooltips, which would cover the popconfirm: every confirming
    widget (owner, 2026-10-09). `useConfirm` reports it as `asking`.
26. A third widget, `OneOfSlider` (antd Slider), for ordered choices (owner, 2026-10-09; first
    consumer: the effort control in optio-conversation-ui's compact controls bar). Each choice
    is a mark; a mark's tooltip is its choice's, the handle's is the field's. One request per
    move, when it ends (release, mark click, arrow key's keyup); ending on a disabled choice
    requests nothing and the handle returns. While the requested choice is asked and committed
    the handle stays on it (owner: no jump back to the old choice meanwhile), then shows the
    stored value. `markStyle` for dense toolbars.
27. A choice may name a `group` (owner, 2026-10-09, for Claude Code's model list: older
    versions of a family after the current models). OneOfSelect lists the choices without a
    group first, then each group under its heading (antd option groups, in the order the groups
    first appear); the other one-of widgets ignore it.
28. `OneOfSelect inlineDescriptions` (owner, 2026-10-09, for model lists): in the open list each
    choice shows its label as a bold heading and its description (markdown) under it, smaller
    and wrapping; only a disabled choice's reason stays in a tooltip. The closed select shows
    the label only; the list is at least 320px wide.
