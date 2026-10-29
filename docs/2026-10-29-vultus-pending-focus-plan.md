# vultus: a pending field keeps keyboard focus — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** while a field or an action is pending, every vultus-antd field widget, action button and action menu row locks without `disabled`, so keyboard focus stays on it.

**Architecture:** one helper, `isLocked(field)`, names the state; each widget passes `disabled={!field.enabled}` to its antd control and, while locked, adds `aria-disabled`, the disabled look through `styles`/`style` and theme tokens, and holds whatever the antd control keeps on its own (popup, draft, drag). The request hooks already refuse changes while pending.

**Tech Stack:** React 19, antd 6.6.5, vitest + @testing-library/react (jsdom), pnpm 11.1.1 via corepack.

**Spec:** `docs/2026-10-29-vultus-pending-focus-design.md` (read it first; its per-widget table is binding).

## Global Constraints

- Branch `csillag/pending-focus` in `/home/csillag/chat/vultus/unitas`; one commit per task; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push.
- pnpm only as `corepack pnpm@11.1.1 --dir /home/csillag/chat/vultus/unitas ...` (the system pnpm is 12 and refuses).
- Run only the affected test files, one at a time: `corepack pnpm@11.1.1 --dir /home/csillag/chat/vultus/unitas --filter vultus-antd exec vitest run src/__tests__/<File>.test.tsx`; and `--filter vultus-antd typecheck` (and vultus-core's when core changes).
- A field that is not enabled stays `disabled` exactly as today. Locked = `field.enabled && field.pending`.
- No stylesheet and no hard-coded colours: theme tokens (`theme.useToken()`), antd `styles`/`style`/`classNames` props only.
- Reuse what exists (request hooks, useSliderMove, useTextDraft, the spinner pattern); never copy a component.
- Tests that assert a pending widget is `disabled` assert the old behaviour: change them to the new one (not disabled, `aria-disabled="true"`, change ignored), never delete them.

## Review Focus

1. A keyboard change while locked (arrow, space, typing, Enter) must request nothing and leave the control showing the field's value.
2. A popup open when pending starts (select, tree picker) must close and stay closed until pending ends.
3. A text input's draft typed before pending starts must survive pending (readOnly, not cleared).
4. Disabled-and-pending (not enabled) must render exactly as before: disabled, with its reason tooltip.
5. The spinner must not shift layout differently than today where a lent Spinner is present.

---

### Task 1: helper, toggles and segmented

**Files:**
- Create: `packages/vultus-antd/src/pendingLock.ts` — `export function isLocked(field: { enabled: boolean; pending: boolean }): boolean`, with a JSDoc stating the rule (spec, "The rule").
- Modify: `OneOfSegmented.tsx` (prototype already there: switch it to `isLocked`), `BoolSwitch.tsx`, `ManyOfSwitches.tsx`, `BoolCheckbox.tsx`, `ManyOfCheckboxes.tsx` (all under `packages/vultus-antd/src/`).
- Test: `__tests__/BoolWidgets.test.tsx`, `ManyOfWidgets.test.tsx`, `MixedBoolWidgets.test.tsx`, `OneOfWidgets.test.tsx`, `spinnerSlot.test.tsx`.

- [ ] Step 1: per widget, a failing test: pending (commit with a never-resolving fire, or `pending: true`) → the input/button is not disabled, the control carries `aria-disabled="true"`, a click and a keyboard change request nothing; not enabled + pending → disabled as before.
- [ ] Step 2: BoolSwitch / ManyOfSwitches: no `loading` (it disables); the spinner after each switch while pending, the lent Spinner or antd's `<Spin size="small">`, as BoolCheckbox does it; spinnerSlot tests updated accordingly.
- [ ] Step 3: implement; the disabled look via tokens (`colorTextDisabled`, `colorBgContainerDisabled`, `cursor: 'not-allowed'`) on the parts `disabled` used to grey.
- [ ] Step 4: run the five test files and vultus-antd typecheck; all pass.
- [ ] Step 5: commit `feat(vultus-antd): toggles and segmented stay focusable while pending`.

### Task 2: selects, tree pickers, trees

**Files:** `OneOfSelect.tsx`, `ManyOfSelect.tsx`, `OneOfTreePicker.tsx`, `ManyOfTreePicker.tsx`, `OneOfTreeList.tsx`, `ManyOfTreeChecklist.tsx`; tests `OneOfWidgets`, `ManyOfSelect`, `OneOfTreePicker`, `ManyOfTreePicker`, `OneOfTreeList`, `ManyOfTreeChecklist` (+ `*Panel` tests if they assert disabled).

- [ ] Step 1: failing tests: pending → not disabled, `aria-disabled="true"` on the combobox / tree, the popup closed (`open={false}`) and opening it does nothing, a choice/check/selection requests nothing; a tree picker's search is not cleared by pending; tree links keep their element and do not navigate while locked.
- [ ] Step 2: implement (Select's `loading` and suffix spinner stay).
- [ ] Step 3: run the test files and typecheck.
- [ ] Step 4: commit `feat(vultus-antd): selects and trees stay focusable while pending`.

### Task 3: sliders and inputs, core docs

**Files:** `OneOfSlider.tsx`, `NumericSlider.tsx`, `RangeSlider.tsx`, `useSliderMove.ts` (only if needed), `TextInput.tsx`, `SearchInput.tsx`, `NumericInput.tsx`; vultus-core `src/field.ts` (docs only); tests `OneOfSlider`, `NumericWidgets`, `RangeSlider`, `TextWidgets`.

- [ ] Step 1: failing tests: sliders pending → handles not disabled, `aria-disabled="true"`, an arrow key on a handle requests nothing and the handle stays on the field's value; inputs pending → `readOnly`, not disabled, a draft typed before pending is still shown, typing changes nothing.
- [ ] Step 2: implement.
- [ ] Step 3: vultus-core `field.ts`: the `pending` option's JSDoc drops the "an input being typed into loses focus, and a draft not yet requested" caveat and says widgets lock (focusable, said unavailable, changes ignored); `FieldControls.pending` likewise.
- [ ] Step 4: run the test files, vultus-antd and vultus-core typecheck.
- [ ] Step 5: commit `feat(vultus-antd): sliders and inputs stay focusable while pending`.

### Task 4: actions

**Files:** `ActionButton.tsx`, `FormSubmitButton.tsx`, `CombinedActionButton.tsx`, `useActionMenu.tsx`, `ActionContextMenu.tsx` (all under `packages/vultus-antd/src/`); `pendingLock.ts` (add `isActionLocked(action: { disabled: boolean; pending: boolean })` beside `isLocked`); tests `ActionButton`, `FormSubmitButton`, `CombinedActionButton`, `ActionContextMenu`, `spinnerSlot`.

- [ ] Step 1: failing tests: pending (a fire that never resolves) → the button is not disabled, carries `aria-disabled="true"`, shows its loading state (lent Spinner or antd's), a second click or Enter fires nothing; a disabled action stays disabled; a pending menu row is not disabled, is `aria-disabled`, keeps its spinner icon, and picking it fires nothing.
- [ ] Step 2: implement (the action core's own refusal stays; no change in vultus-core).
- [ ] Step 3: run the test files and typecheck.
- [ ] Step 4: commit `feat(vultus-antd): action buttons and menus stay focusable while pending`.

### Task 5: docs and the browser check

- [ ] Step 1: READMEs (vultus-core: the `pending` paragraph; vultus-antd: the spinner table's BoolSwitch / ManyOfSwitches rows and the note after it) and each touched widget's JSDoc ("disables" → "locks").
- [ ] Step 2: gallery notes that say a pending widget is disabled.
- [ ] Step 3: headless browser check against the gallery (scratchpad harness): focus a segmented, a switch, a checkbox, a select, a slider, an input, a tree, an action button and a context-menu row; flip or fire each with the keyboard into a slow commit or action; focus stays on it while pending and after.
- [ ] Step 4: commit `docs(vultus): pending widgets stay focusable`.
