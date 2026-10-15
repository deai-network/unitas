# vultus field kinds, parts B and C (vultus-react-router, vultus-antd) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vultus-react-router 0.1.0 (the URL store over react-router 7) and vultus-antd 0.7.0 (the widgets of the new kinds, `<Field>`, `<FieldWidget>`, `item`), each widget in the gallery; vultus-core 0.5.1 with the part-A follow-ups.

**Architecture:** vultus-core 0.5.0 (released) holds the field hooks, definitions, value types and the argument layer (`ArgStore`). Part B adds a package whose one component provides an `ArgStore` over the router's location (query inside the hash with a hash router). Part C adds antd widgets following the existing ones' conventions (`fieldTooltip`, `choiceTooltip`, `withTooltip`, `useConfirm`, the Spinner slot, `data-field-id`/`data-value`), a `<FieldWidget>` that picks the widget for a field's controls, and `<Field>` that runs a definition's hook (optionally stored) and renders it.

**Tech Stack:** TypeScript 5.7 (strict, ESM, `.js` import suffixes), React 19, antd 6.6, react-router 7, vitest 3 + @testing-library/react (jsdom), Storybook 10 (vultus-gallery), pnpm 11.

**Spec:** `docs/2026-10-15-vultus-field-kinds-design.md` (sections "vultus-react-router", "vultus-antd", "Gallery", "Packages and compatibility").

## Global Constraints

- Repository: the local clone `~/chat/vultus/unitas`, branch `csillag/vultus-field-kinds`. Never push; never touch `~/deai/*` or other hosts.
- Tests per file: `cd packages/<pkg> && ./node_modules/.bin/vitest run <file>`; type checks `./node_modules/.bin/tsc -p tsconfig.json` in vultus-core / vultus-antd / vultus-react-router, `./node_modules/.bin/tsc --noEmit` in vultus-gallery. No whole-suite runs except Task 14. `pnpm install` only in Task 1 (new package) at the repo root.
- vultus-core and vultus-react-router never import antd; vultus-core never imports a router.
- Widget conventions (as today's vultus-antd field widgets): render nothing when `!field.visible`; disabled while `!field.enabled || field.pending`; the field's tooltip via `fieldTooltip`/`withTooltip`, held back while a confirmation is open (`asking`); every request goes through the field's confirmation for the requested value (`useConfirm`); `data-field-id={field.id}` and `data-value` (a string; lists comma-joined) on the root; `aria-label={field.label}` where the control has no visible label; pending shows the lent Spinner (`useSpinnerKey(\`vultus:field:${field.id}\`)`, size small) or antd's own loading state; no `@ant-design/icons` dependency (inline SVGs as fieldTooltip.tsx does).
- Choice `note` is shown after the label in `token.colorTextDescription`; a `dimmed` choice's label is in `token.colorTextDescription` too (still selectable).
- Texts the widgets write themselves go through `VultusTexts` (English defaults, translatable via `VultusProvider texts`).
- Every widget task adds its gallery story file in `packages/vultus-gallery/src/fields/` in the style of `OneOfField.stories.tsx` (`Showcase`/`Example`, a `title: 'Fields/…'` meta, examples for: plain, disabled with reason, disabled choices, notes and dimmed where the kind has choices, commit with pending and confirmation), and runs the gallery typecheck.
- Commits: conventional subjects as given, explicit files only, `Co-Authored-By:` trailer naming the model that wrote the commit.

## Review Focus

1. A request while a confirmation is open, or while pending, must not fire twice (double click on a checkbox, Enter twice in NumericInput). Test in Tasks 3, 6.
2. Controlled values that change from outside (Back button changing the URL) must move the widget: NumericInput's draft and TextInput's committing draft reset when `field.value` changes from outside. Test in Tasks 6, 11.
3. The router store under several writes in one tick and a push among replaces: one navigation, push wins, other query parameters and the path kept. Test in Task 2.
4. `<Field stored>` passes the definition object itself to `useStoredField` (not a per-render merge with overrides), so stored-value warnings are not repeated per render. Test in Task 12.
5. Long labels and many selections in TreePicker / ManyOfSelect: tags collapse (`maxTagCount="responsive"`), the first-words summary never ends on a joining word. Test in Tasks 5, 10.

---

## Part B

### Task 1: vultus-core follow-ups from part A

**Files:** Modify `packages/vultus-core/src/kinds.ts`, `src/types.ts`, `README.md`; Test `src/__tests__/kinds.test.tsx`.

- `sanitizeStored` rounds an `integer` numeric or range value (after clamping), warning as clamping does when rounding changed it — so a stored `2.5` for an integer field reads `3` and counts as default when the default is `3`.
- README (Field context section): a function whose declared parameter count is zero (default or rest parameters, a bound `t`) also receives the guarded context under a provider; reading a key it was not given throws.
- `Fits<A, B>` is defined once (types.ts) and imported where used.

- [ ] Step 1: failing tests: `sanitizeStored` of an integer numeric `2.5` gives `3` with one warning; an integer range `[2.5, 9.6]` gives `[3, 10]` with one warning; a non-integer field unchanged.
- [ ] Step 2: run, see them fail. Step 3: implement. Step 4: run `kinds.test.tsx`, `useStoredField.test.tsx`, tsc.
- [ ] Step 5: commit `fix(vultus-core): stored integer values are rounded; README caution`.

### Task 2: vultus-react-router: the URL store

**Files:**
- Create: `packages/vultus-react-router/package.json` (name `vultus-react-router`, version `0.0.0`, as vultus-core's: `type: module`, `exports` to `src` with `publishConfig` to `dist`, scripts `build`/`prepack`/`test`; `dependencies: { "vultus-core": "workspace:^" }`; `peerDependencies: { "react": ">=18", "react-router": ">=7" }`; devDependencies as vultus-core's plus `"react-router": "^7.18.2"`), `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vitest.setup.ts` (copies of vultus-core's), `README.md`, `src/index.ts`, `src/ReactRouterArgStore.tsx`, `src/query.ts`
- Test: `src/__tests__/ReactRouterArgStore.test.tsx`, `src/__tests__/query.test.ts`, `src/no-antd.test.ts` (copy of vultus-core's)
- Run `pnpm install` at the repo root once (adds the workspace package; lockfile changes are committed).

**Interfaces:**
- Consumes: `ArgStore`, `RawChange`, `UpdateMethod`, `ArgStoreProvider` from vultus-core.
- Produces:
  ```ts
  export function ReactRouterArgStore(props: { children?: ReactNode }): JSX.Element;   // must be inside a router
  export function useRouterArgStore(): ArgStore;   // the store the component provides, for code that wants it directly
  // query.ts (internal, tested)
  export function readQuery(search: string): Map<string, string>;
  export function writeQuery(query: Map<string, string>): string;   // '' or '?k=v&...'; keeps ',' and '..' and '/' unescaped
  ```

**Rules:**
- `read(key)`: the value of `key` in the current location's `search` (with a hash router, the query inside the hash — react-router's `location.search` already is that), or `undefined`.
- The store object is created once per component instance (stable identity); `read` reads the location of the current render (a ref updated during render), and subscribers are notified in a layout effect when the location changes.
- `write(changes, method)`: changes written in the same tick are collected and applied in a microtask as one `navigate({ pathname, search, hash }, { replace })` keeping the path, the other parameters and the order of untouched keys; `replace` is false if any change in the batch asked for `'push'`. `raw: undefined` removes the key; `''` keeps it with an empty value (`?k=`).
- `hrefFor(changes)`: `useHref` of the current path (computed during render) plus `writeQuery` of the changed query — a link target valid for hash and browser routers.
- Outside a router the component throws (react-router's own error is fine; do not catch it).

- [ ] Step 1: failing tests over `createMemoryRouter` + `RouterProvider` (and one over `createHashRouter` with jsdom's `window.location.hash`): reads `?rounds=final,regional&q=x`; `useArg` over it gives the parsed value; a `set` navigates with `replace` (history length unchanged); `useArgWriter` with two changes, one `'push'`, makes one navigation and a history entry (Review Focus 3); two `set` calls in one `act` both land in one navigation; other parameters and the path are kept; `''` gives `?rounds=`; removing the last key gives no `?`; commas stay literal in `location.search`; `hrefFor` gives `#/m?x=1` under the hash router; `query.test.ts` round-trips keys and values with `&`, `=`, `%`, spaces and non-ASCII.
- [ ] Step 2: run, see them fail. Step 3: implement. Step 4: run both test files, `no-antd.test.ts`, tsc.
- [ ] Step 5: README: what it is, install, peer deps, `<ReactRouterArgStore>` placement (inside the router, around the routes that store arguments), batching, readable query, `hrefFor`; and in the repo root README's TODO, vultus-window-history stays (react-router entry not needed).
- [ ] Step 6: commit `feat(vultus-react-router): the URL argument store over react-router 7`.

## Part C

### Task 3: Shared pieces: notes, dimmed, texts, the many-of request

**Files:** Create `packages/vultus-antd/src/ChoiceNote.tsx`, `src/useManyOfRequest.ts`; Modify `src/texts.ts`, `src/VultusProvider.tsx`, `src/ChoiceLabel.tsx`, `src/OneOfSelect.tsx`; Test `src/__tests__/choiceNotes.test.tsx`, `src/__tests__/VultusProvider.test.tsx` (extend).

**Interfaces:**
```ts
export function ChoiceNote(props: { note: string | undefined }): JSX.Element | null;   // secondary colour, after the label
// ChoiceLabel: a `dimmed` choice's label in colorTextDescription (variant colours only when enabled and not dimmed)
// VultusTexts gains: done: string ('Done'); search: string ('Search'); joiningWords: string[] (['and', 'of', 'the'])
export function useManyOfRequest<T extends string>(field: ManyOfFieldControls<T>): {
  request: (next: T[]) => void; wrap: (control: ReactElement) => ReactElement; asking: boolean };
```
- `VultusProvider`'s texts merge covers every `VultusTexts` key (not a hard-coded pair), keeping value-based memoization (an array compares by its joined content).
- `useManyOfRequest` mirrors `useOneOfRequest`: nothing while disabled or pending; the confirmation for the requested list first (OK labelled with the field's label); a request equal (as a set) to the current value does nothing; one request in flight at a time (Review Focus 1).
- `OneOfSelect`'s list shows each choice's note (right-aligned) and dimmed state.

- [ ] Steps: failing tests (note rendering; dimmed colour; texts merge of `done`/`joiningWords`; `useManyOfRequest` refuses while pending and asks the confirmation first; a double request while asking fires once); implement; run the new and touched test files (`OneOfWidgets.test.tsx`, `VultusProvider.test.tsx`), tsc; commit `feat(vultus-antd): choice notes and dimmed choices; texts; many-of requests`.

### Task 4: ManyOfCheckboxes and ManyOfSwitches

**Files:** Create `src/ManyOfCheckboxes.tsx`, `src/ManyOfSwitches.tsx`; Modify `src/index.ts`; Test `src/__tests__/ManyOfWidgets.test.tsx`; Gallery `packages/vultus-gallery/src/fields/ManyOfField.stories.tsx`.

- Props: `{ field: ManyOfFieldControls<T>; vertical?: boolean; size?: 'small' | 'middle' }` (switches: the Switch size).
- ManyOfCheckboxes: antd `Checkbox.Group` (row, or column when `vertical`), one checkbox per choice: `ChoiceLabel` + `ChoiceNote`, disabled when the choice is; clicking requests the toggled list through `useManyOfRequest`.
- ManyOfSwitches: a small Switch per choice and its label (clickable, toggles too), row or column.
- Tooltips: an enabled field: each choice's `choiceTooltip` (reason first when disabled, then description; no "Current state:"/"Switch to:" leads); a disabled field: `fieldTooltip` over the whole control. The field's label is the group's `aria-label`.
- Pending: disabled, the Spinner (or antd Spin) after the group.

- [ ] Steps: failing tests (renders choices with notes; click requests the toggled list; disabled choice not clickable; confirmation first; pending disables; vertical layout; switches' label click toggles; data-value comma-joined); implement; run the test file, tsc, gallery typecheck; story; commit `feat(vultus-antd): ManyOfCheckboxes and ManyOfSwitches`.

### Task 5: ManyOfSelect

**Files:** Create `src/ManyOfSelect.tsx`; Modify `src/index.ts`; Test `src/__tests__/ManyOfSelect.test.tsx`; Gallery: add to `ManyOfField.stories.tsx`.

- antd `Select mode="multiple"`, `maxTagCount="responsive"`, `allowClear` (clearing requests `[]`), groups as `OneOfSelect`, options rendered with `ChoiceLabel` + `ChoiceNote` and `choiceTooltip`, search over labels with `normalizeText` (`filterOption`), placeholder from the field. Closed: `fieldTooltip` (held back while open or asking). Each change requests the new list through `useManyOfRequest`.

- [ ] Steps: failing tests (options with groups; selecting requests the list in choice order; clear requests []; search is accent-insensitive; disabled choice not selectable; tags collapse — Review Focus 5); implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): ManyOfSelect`.

### Task 6: NumericInput and NumericSlider

**Files:** Create `src/NumericInput.tsx`, `src/NumericSlider.tsx`; Modify `src/index.ts`; Test `src/__tests__/NumericWidgets.test.tsx`; Gallery `src/fields/NumericField.stories.tsx`.

- NumericInput: antd `InputNumber` with `min`/`max`/`step` from the controls, `precision={0}` when `integer`, the unit as `suffix`; it keeps a draft while editing and requests when editing ends (blur, Enter, a stepper click) — not on each keystroke; an empty or unparsable draft on blur returns to the field's value; the draft follows `field.value` when it changes from outside (Review Focus 2); Enter twice requests once (Review Focus 1). Tooltip `fieldTooltip`.
- NumericSlider: antd `Slider` (requires `min` and `max`; without them it throws `Field '<id>': NumericSlider needs min and max`), requests once per move when it ends (`onChangeComplete`, as `OneOfSlider`), the handle's tooltip shows `field.format(value)`, the track `fieldTooltip`; `showValue` puts `field.valueText` before the slider.

- [ ] Steps: failing tests for each rule above; implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): NumericInput and NumericSlider`.

### Task 7: RangeSlider

**Files:** Create `src/RangeSlider.tsx`; Modify `src/index.ts`; Test `src/__tests__/RangeSlider.test.tsx`; Gallery `src/fields/RangeField.stories.tsx` (school years 2010–2025 shown as `2010/11`).

- antd `Slider range` over `field.min..field.max`, `step` from the field, one request per move when it ends; the handles' tooltips show `field.format(n)`; the track `fieldTooltip`; `showValue` shows `field.valueText` before the slider; keyboard moves request on keyup as `OneOfSlider`.

- [ ] Steps: failing tests (value shown; a completed move requests `[from, to]`; drag steps do not request; tooltip formatter; showValue text); implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): RangeSlider`.

### Task 8: TreeChecklist

**Files:** Create `src/TreeChecklist.tsx`, `src/treeData.tsx` (shared by TreeChecklist and TreePicker); Modify `src/index.ts`; Test `src/__tests__/TreeChecklist.test.tsx`; Gallery `src/fields/TreeField.stories.tsx`.

- `treeData.tsx`: maps `TreeNodeControls` to antd tree nodes: `key`/`value` = node value, title = `ChoiceLabel` + `ChoiceNote` (`noteStyle: 'aside' | 'brackets'`: right-aligned for the dropdown, `(12)` after the label for the checklist/drawer), dimmed style, `disabled` from the node, the node's `choiceTooltip` on the title.
- TreeChecklist: antd `Tree checkable` always open, with a search box above (placeholder `texts.search`, accent-insensitive via `filterTree` over `field.nodes`; while searching every kept node is expanded), `expandedKeys` starting from `field.expandedKeys` (controlled; the user can expand/collapse), `checkStrictly` only for `selection: 'independent'`. Checking uses antd's own conduction: `checkedKeys={field.value}`; `onCheck` requests the reported checked keys (`setValue` normalizes them to the field's selection mode) through the field's confirmation (a one-shot request hook like `useManyOfRequest`, typed for the tree's controls).
- Ruling recorded in part A: disabled nodes — antd does not conduct into them, the hook's matching covers them; documented in the README.

- [ ] Steps: failing tests (renders the tree with notes in brackets; checking a parent requests its id under topmost; unchecking a child of a checked parent requests the siblings; search keeps ancestors and a match's subtree, accent-insensitive; independent mode does not conduct; dimmed node style); implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): TreeChecklist`.

### Task 9: TreePicker (dropdown)

**Files:** Create `src/TreePicker.tsx`; Modify `src/index.ts`; Test `src/__tests__/TreePicker.test.tsx`; Gallery: add to `TreeField.stories.tsx`.

- antd `TreeSelect treeCheckable`, `showCheckedStrategy` by selection (`topmost` → SHOW_PARENT, `all` → SHOW_ALL, `leaves` → SHOW_CHILD; `independent` → `treeCheckStrictly`), `value={field.value}`, changes request the new list (normalized by the hook) through the confirmation; `showSearch` with an accent-insensitive `filterTreeNode` over labels; `maxTagCount="responsive"`; `allowClear` (requests `[]`); `treeDefaultExpandedKeys={field.expandedKeys}`; `treeData` from `treeData.tsx` with `noteStyle: 'aside'`; placeholder from the field; `fieldTooltip` closed, held back while open or asking; `listHeight` and `popupMatchSelectWidth` props passed through (defaults 520 and 480, as Taskmaster).

- [ ] Steps: failing tests (value shown as tags; selecting a node requests under SHOW_PARENT semantics; clear requests []; search accent-insensitive; notes aside); implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): TreePicker`.

### Task 10: TreePicker on a phone: panel and summary

**Files:** Modify `src/TreePicker.tsx`; Create `src/firstWords.ts`; Test `src/__tests__/TreePickerPanel.test.tsx`, `src/__tests__/firstWords.test.ts`; Gallery: add to `TreeField.stories.tsx`.

- `panel="drawer"`: the closed field shows the choice only; any tap on it except its clear and remove icons opens an antd `Drawer` from the bottom (`size="88%"`) titled with the field's label, `extra` a primary Done button (`texts.done`) that closes it; inside, `TreeChecklist` of the same field with notes in brackets. Choices apply at once.
- `summary="firstWords"`: `maxTagCount={0}` and a placeholder of each selected label's first words joined with `, ` — about 16 characters each when more than one is selected, else 40 — cut at a word boundary with `…`, never ending on a word of `texts.joiningWords` (compared case-insensitively) or on `,;:` (Taskmaster's `firstWords`).
- `firstWords(name: string, max: number, joiningWords: string[]): string` in `firstWords.ts`.

- [ ] Steps: failing tests (`firstWords('Gráfok és utak bejárása', 16, ['és'])` → `'Gráfok…'`; short names unchanged; the drawer opens on tap, not on the clear icon; Done closes it; checking in the drawer requests; the summary text for two selections); implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): TreePicker's phone panel and first-words summary`.

### Task 11: TextInput and SearchInput

**Files:** Create `src/TextInput.tsx`, `src/SearchInput.tsx`; Modify `src/index.ts`; Test `src/__tests__/TextWidgets.test.tsx`; Gallery `src/fields/TextField.stories.tsx`.

- TextInput: antd `Input` (or `Input.TextArea` when `field.control === 'textarea'`), placeholder from the field, `aria-label` the label, `fieldTooltip`. Requests on every change; when `field.commits`, keeps a draft and requests on blur or Enter (Enter in a textarea is a newline: blur only), the draft following `field.value` when it changes from outside (Review Focus 2).
- SearchInput: `Input` with an inline search icon as `prefix`, `allowClear` (requests `''`), Esc clears, `onEnter?: () => void` called on Enter after the value is requested; same request rule as TextInput.

- [ ] Steps: failing tests (each keystroke requests; commit mode requests on blur/Enter only; outside change resets the draft; Esc clears; onEnter called; textarea Enter does not request); implement; run, tsc, gallery typecheck; story; commit `feat(vultus-antd): TextInput and SearchInput`.

### Task 12: FieldWidget, Field, item

**Files:** Create `src/FieldWidget.tsx`, `src/Field.tsx`, `src/FieldItem.tsx`; Modify `src/index.ts`; Test `src/__tests__/Field.test.tsx`; Gallery `packages/vultus-gallery/src/definitions/Field.stories.tsx`, `src/definitions/StoredFields.stories.tsx` (add `vultus-react-router` and `react-router` to the gallery's devDependencies; a memory router with the current URL shown under the fields).

**Interfaces:**
```ts
type WidgetName = 'switch' | 'checkbox' | 'select' | 'segmented' | 'slider' | 'checkboxes' | 'switches' | 'input' | 'picker' | 'checklist' | 'search';
export function FieldWidget(props: { field: FieldControls<any, any>; widget?: WidgetHint; item?: boolean } & Record<string, unknown>): JSX.Element | null;
export function Field<D extends FieldDefinition>(props: {
  definition: D; stored?: boolean; value?: unknown; onChange?: (v: any) => void; commit?: FieldCommit<any>;
  widget?: WidgetHint; item?: boolean;
  label?: string; description?: string; enabled?: Decision; disabled?: Decision; visible?: boolean; hidden?: boolean; placeholder?: string;
} & Record<string, unknown>): JSX.Element | null;
```
- Defaults per kind: boolean/mixed-boolean `switch`, oneOf `select`, manyOf `checkboxes`, numeric `input`, range `slider`, tree `picker`, text `input`. Allowed names per kind as the spec's widget table. An unknown kind or a name not allowed for the kind throws `` `Field '${id}': no widget '${name}' for kind '${kind}'` ``.
- Precedence for the widget and its display options: render-site props, then the definition's `widget` hint (a name or `{ name, ...options }`), then the kind's default. Overrides of definition values (`label`, `description`, `enabled`/`disabled`, `visible`/`hidden`, `placeholder`) come from render-site props over the definition.
- `<Field>` renders a per-kind inner component (so each instance calls exactly one hook). Storage: inside by default; `stored` calls `useStoredField(definition)` with the definition object itself (Review Focus 4) and gives the kind's hook `{ ...stored.options, ...overrides }`; `value`/`onChange` or `commit` from the props otherwise. Remaining props go to the widget.
- `item`: `FieldItem` wraps the widget in an antd `Form.Item` with the field's label (except the `checkbox` widget, which shows its own), the description as the label's `tooltip` (markdown via `ReasonMarkdown`), and the last commit's messages as `help` (`validateStatus: 'error'` when any is an error).

- [ ] Steps: failing tests (each kind's default widget renders; a hint picks the widget; a render-site widget overrides the hint; an override label shows; an unknown widget throws; stored over a `memoryStore` writes the store; stored with an unfit value warns once over three renders (Review Focus 4); item shows label, description tooltip and an error message); implement; run, tsc, gallery typecheck; stories; commit `feat(vultus-antd): Field, FieldWidget and labelled items`.

### Task 13: vultus-antd README and exports

**Files:** Modify `packages/vultus-antd/README.md` (entry points; a section per new widget family in the style of the existing "One-of fields"; `<Field>` / `<FieldWidget>` / `item`; the texts table gains `done`, `search`, `joiningWords`; disabled tree nodes and antd's conduction), `src/index.ts` (check every new public name is exported).

- [ ] Steps: write; check every name mentioned exists; commit `docs(vultus-antd): new widgets, Field, FieldWidget`.

### Task 14: Tip verification

- [ ] Full suites once: vultus-core, vultus-react-router, vultus-antd (`./node_modules/.bin/vitest run` in each); tsc in the three packages and the gallery typecheck; `cd packages/vultus-gallery && ./node_modules/.bin/storybook build --output-dir /tmp/vultus-gallery-build` succeeds (then remove the output). Record results in the report; no commit unless something needed fixing.

## Release (controller, after the whole-branch review)

1. Sync to excavator, run the suites there, version commit `chore(vultus): vultus-core 0.5.1, vultus-react-router 0.1.0, vultus-antd 0.7.0`, tags `vultus-core@0.5.1`, `vultus-react-router@0.1.0`, `vultus-antd@0.7.0`.
2. Push main (fast-forward) and the tags; publish the three packages from the excavator worktree in dependency order (core, react-router, antd), `--no-git-checks`; confirm on the registry.
3. topics.log; tell TeacherTeacher (react-router 7, `<ReactRouterArgStore>`, `<Field>`, widget names).
