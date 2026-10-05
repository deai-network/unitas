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
16. Tooltip: an enabled field shows the value description, then the description; a disabled field
    shows the reason first, then the description, and leaves the value description out (it
    usually says what a click does). The value description is also the control's accessible
    description (a switch has no ARIA "mixed", so it says what the state is).
17. Owner (2026-10-05): from the mixed state a single click requests on and a double click
    requests off (instead of leaving unchangeable items out of the aggregate). The widgets wait
    about 300 ms after a click from mixed to tell the two apart; from on or off a click acts at
    once. Confirmations open under program control after the gesture is resolved, for the value
    actually requested. The mixed value description should mention the double click.
