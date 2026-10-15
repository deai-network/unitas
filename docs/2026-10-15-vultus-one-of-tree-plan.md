# The one-of tree field kind: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a `oneOfTree` field kind (single choice from a tree) in vultus-core, `hrefFor` links on
field options and controls, and the OneOfTreePicker / OneOfTreeList widgets in vultus-antd, with
gallery stories and docs.

**Architecture:** the kind follows useOneOfField (validated `setValue`, the current choice's
description) over the many-of tree's nodes and helpers (`tree.ts`); kinds.ts gives it storage
(plain string). `hrefFor` rides with `value` / `onChange` / `commit` into the controls, and
useStoredField fills it from its store. The widgets reuse the many-of tree's antd plumbing
(`treeData`, search, drawer) and the request path of useOneOfRequest.

**Tech Stack:** TypeScript, React 19, antd 6 (vultus-antd only), vitest + Testing Library
(jsdom), pnpm workspace, Storybook (vultus-gallery).

**Spec:** `docs/2026-10-15-vultus-one-of-tree-design.md` (read it first; the field-kinds spec
`docs/2026-10-15-vultus-field-kinds-design.md` holds the conventions it builds on).

## Global Constraints

- Work in `~/chat/vultus/unitas` (branch `csillag/vultus-one-of-tree`) only.
- vultus-core stays antd-free (`src/no-antd.test.ts`).
- Tests per task: only the affected test files, one at a time
  (`pnpm --filter <pkg> exec vitest run src/__tests__/<file>`), and `pnpm --filter <pkg> typecheck`
  for each touched package. No full suites per task.
- Texts: `pathSeparator: ' › '`, `none: 'None'` (VultusTexts).
- Defaults: `choose: 'any'`, `optional: false`, `expand: 'selected'`, widget hint `'picker'`.
- The empty value is `''`.
- Code style: match the surrounding files (explanatory JSDoc on exports, no new dependencies).
- Commits: explicit `git add <files>`; message ends with
  `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`; no version bumps, no merges.
- The gallery Storybook is served from this clone (tmux `vultus-gallery`, superego :6008); leave
  it running.

## Review Focus

- A stored value naming a folder (or a node a context change made unchoosable) falls back to the
  initial value with a warning (Task 3).
- The nodes change so the value names no node: `current` undefined, `next` the first node, the
  picker shows its placeholder (never the raw value), the list selects nothing (Tasks 3, 4, 5).
- A disabled field or a pending commit: the list renders no links and requests nothing on click
  (Task 5).
- A search hiding the current node: the picker and the list keep the value; Enter in a filtered
  list chooses only a shown node (Tasks 4, 5).
- An optional field with an `initialValue`: `clear()` requests `''`, stored explicitly; a field
  that is not optional refuses `''` (Tasks 2, 3).

---

### Task 1: choosable nodes in the tree helpers (vultus-core)

**Files:**
- Modify: `packages/vultus-core/src/tree.ts`, `packages/vultus-core/src/index.ts`
- Test: `packages/vultus-core/src/__tests__/tree.test.ts`

**Interfaces:**
- Produces (exported from `tree.ts` and `index.ts`):
  - `TreeNode.choosable?: boolean` (JSDoc: default true; a folder when false; only the one-of
    tree reads it).
  - `type TreeChoose = 'any' | 'leaves'`.
  - `canChooseNode(node: TreeNode, choose: TreeChoose): boolean`: `choosable !== false`, enabled
    (the existing `nodeEnabled`), and under `'leaves'` no children.
  - `choosableValues<T extends string>(nodes: TreeNode<T>[], choose: TreeChoose): T[]`: the values
    `canChooseNode` accepts, in pre-order.
  - `treePath<T extends string>(nodes: TreeNode<T>[], value: T): T[]`: the values from the root
    down to `value` inclusive; `[]` when no node has it.

- [ ] **Step 1: failing tests** in `tree.test.ts`, `describe('choosable nodes')`, over
  `geo = [{ value: 'geo', label: 'Geometria', choosable: false, children: [{ value: 'sik', label: 'Síkgeometria', children: [{ value: 'kor', label: 'Kör' }] }, { value: 'ter', label: 'Térgeometria', disabled: 'later' }] }, { value: 'alg', label: 'Algebra' }]`:
  - `canChooseNode`: `geo` false (folder), `sik` true under `'any'` and false under `'leaves'`,
    `ter` false (disabled), `kor` true.
  - `choosableValues(geo, 'any')` → `['sik', 'kor', 'alg']`; `'leaves'` → `['kor', 'alg']`.
  - `treePath(geo, 'kor')` → `['geo', 'sik', 'kor']`; `treePath(geo, 'alg')` → `['alg']`;
    `treePath(geo, 'nope')` → `[]`.
- [ ] **Step 2:** run `tree.test.ts`; expect the new tests to fail (not exported).
- [ ] **Step 3:** implement the three functions and the type in `tree.ts`; export them from
  `index.ts`.
- [ ] **Step 4:** run `tree.test.ts` (all pass) and `pnpm --filter vultus-core typecheck`.
- [ ] **Step 5:** commit `feat(vultus-core): choosable tree nodes (canChooseNode, choosableValues, treePath)`.

### Task 2: `hrefFor` on field options and controls

**Files:**
- Modify: `packages/vultus-core/src/field.ts` (FieldStorage, FieldControls, useFieldCore),
  `packages/vultus-core/src/useStoredField.ts`, `packages/vultus-antd/src/Field.tsx` (props typing),
  `packages/vultus-core/README.md` (a short "Links" paragraph)
- Test: `packages/vultus-core/src/__tests__/fieldCommon.test.tsx`,
  `packages/vultus-core/src/__tests__/useStoredField.test.tsx`,
  `packages/vultus-react-router/src/__tests__/ReactRouterArgStore.test.tsx`

**Interfaces:**
- Produces:
  - `FieldStorage`: both outside branches (`value` + `onChange`, `value` + `commit`) gain
    `hrefFor?: (value: TRequest) => string | undefined`; the inside branch `hrefFor?: never`.
  - `FieldControls<TValue, TRequest>` gains `hrefFor(value: TRequest): string | undefined`
    (JSDoc: the link that requesting `value` amounts to, where whoever keeps the value gave one;
    a URL store does). `useFieldCore` returns the options' function, or one answering `undefined`.
  - `useStoredField(definition).options` carries `hrefFor`: `useArg`'s `hrefFor` for the field's
    arg (it answers `undefined` for a store without `hrefFor`).
  - vultus-antd `<Field>`: `hrefFor` is accepted alongside `value` / `onChange` / `commit` (the
    non-stored branch) and is `?: never` in the `stored` branch.

- [ ] **Step 1: failing tests**:
  - `fieldCommon.test.tsx` "hrefFor": a field run with `{ value, onChange, hrefFor: (v) => '#?k=' + v }`
    has `controls.hrefFor('x') === '#?k=x'`; with `commit` likewise; inside the field,
    `controls.hrefFor('x') === undefined`.
  - `useStoredField.test.tsx` "hrefFor": under an ArgStoreProvider with a test store whose
    `hrefFor(changes)` returns `'#?' + changes.map((c) => c.key + '=' + c.raw).join('&')`, a text
    definition `{ kind: 'text', id: 'q' }` gives `options.hrefFor('abc') === '#?q=abc'`; under
    `memoryStore()`, `options.hrefFor('abc') === undefined`.
  - `ReactRouterArgStore.test.tsx` "a stored field links its values": a oneOf definition
    `{ kind: 'oneOf', id: 'paper', choices: [{ value: 'a4' }, { value: 'a3' }] }` run through
    `useOneOfField(useStoredField(d).options)` inside `<ReactRouterArgStore>` over
    `createMemoryRouter` at `/print`: `hrefFor('a3')` ends with `/print?paper=a3`, and
    `hrefFor('a4')` (the default) has no `paper=`.
  - Compile-time: in `Field.tsx`'s existing type-only checks (or `src/__tests__` type file the
    package already checks), `<Field stored definition={d} hrefFor={…} />` is an error.
- [ ] **Step 2:** run the three test files; expect the new tests to fail.
- [ ] **Step 3:** implement as in Interfaces; the hrefFor function is stable (`useCallback`) where
  the other options are.
- [ ] **Step 4:** run the three files, then `pnpm --filter vultus-core typecheck`,
  `pnpm --filter vultus-react-router typecheck`, `pnpm --filter vultus-antd typecheck`.
- [ ] **Step 5:** commit `feat(vultus-core): hrefFor on field options and controls; a stored field gets its store's`.

### Task 3: the `oneOfTree` kind (vultus-core)

**Files:**
- Create: `packages/vultus-core/src/useOneOfTreeField.ts`
- Modify: `packages/vultus-core/src/field.ts` (`FieldKind` gains `'oneOfTree'`),
  `packages/vultus-core/src/kinds.ts`, `packages/vultus-core/src/index.ts`,
  `packages/vultus-core/README.md`
- Test: `packages/vultus-core/src/__tests__/useOneOfTreeField.test.tsx` (new),
  `packages/vultus-core/src/__tests__/kinds.test.tsx`

**Interfaces:**
- Consumes: Task 1's `TreeChoose`, `canChooseNode`, `choosableValues`, `treePath`; the existing
  `expandedTreeKeys`, `resolveChoice`, `useFieldCore`, `resolveIn`.
- Produces (exported from `index.ts`):
  - `type OneOfTreeOwnOptions<T extends string = string, Ctx = any> = { nodes: ValueOrFn<TreeNode<T>[], Ctx>; choose?: TreeChoose; optional?: boolean; expand?: TreeExpand }`
  - `type OneOfTreeFieldOptions<T, RouteId, Ctx> = FieldOptions<T | '', T | '', RouteId, Ctx> & OneOfTreeOwnOptions<T, Ctx>`
  - `interface OneOfTreeNodeControls<T> extends OneOfChoiceControls<T> { children: OneOfTreeNodeControls<T>[] | undefined; choosable: boolean; current: boolean; onPath: boolean }`
  - `interface OneOfTreeFieldControls<T> extends FieldControls<T | '', T | ''> { nodes; byValue: Map<T, OneOfTreeNodeControls<T>>; current: OneOfTreeNodeControls<T> | undefined; path: OneOfTreeNodeControls<T>[]; previous: OneOfTreeNodeControls<T> | undefined; next: OneOfTreeNodeControls<T> | undefined; optional: boolean; choose: TreeChoose; expandedKeys: T[]; clear(): void }`
  - `oneOfTreeInitialValue<T>(opts: { initialValue?: ValueOrFn<T | ''>; nodes; choose?; optional? }, ctx: FieldCtx, id: string, nodes: TreeNode<T>[]): T | ''`
  - `useOneOfTreeField<T, RouteId, Ctx>(opts, registry?): OneOfTreeFieldControls<T>`
  - kinds.ts: `FieldDefinition` gains `Definition<'oneOfTree', string, OneOfTreeOwnOptions<string, Ctx>, Ctx>`
    (plus its `Fits` line); `initialValueOf`, `valueTypeOf` (`stringType`), `sanitizeStored` handle it.

Semantics are the spec's "The kind" section; in short: `setValue` refuses (console.warn, as
useOneOfField's messages) a value naming no node, a node `canChooseNode` rejects, and `''` unless
`optional`; `clear()` is `setValue('')`; `valueDescription` falls back to `current?.description`;
`expandedKeys = expandedTreeKeys(nodes, value ? [value] : [], expand ?? 'selected')`;
`previous` / `next` are the neighbours of `current` in `choosableValues` (with no `current`,
`previous` undefined and `next` the first). The value shown is `field.value` as stored (a value
naming no node stays, `current` undefined). vultus-antd's typecheck fails at FieldWidget's
kind maps from this task until Task 4 registers the kind: planned, do not patch vultus-antd here.

- [ ] **Step 1: failing tests** in `useOneOfTreeField.test.tsx` (renderHook, the Task 1 `geo` tree):
  - initial value: `'sik'` (first choosable, `'any'`); `'kor'` under `choose: 'leaves'`; `''` with
    `optional`; `initialValue: 'alg'` wins; `''` when no node can be chosen.
  - `setValue('kor')` sets it; `setValue('geo')` (folder), `setValue('ter')` (disabled),
    `setValue('nope')` and, not optional, `setValue('')` are refused with a warning and leave the
    value; optional: `clear()` sets `''`.
  - controls: for value `'kor'`, `current.value === 'kor'`, `path.map(v)` = `['geo','sik','kor']`,
    `byValue.get('sik').onPath === true`, `byValue.get('kor').current === true`,
    `byValue.get('geo').choosable === false`, `previous.value === 'sik'`, `next.value === 'alg'`;
    at `'alg'` `next` undefined; at `'sik'` `previous` undefined.
  - a value naming no node (outside storage `{ value: 'gone', onChange }`): `current` undefined,
    `path` `[]`, `previous` undefined, `next.value === 'sik'`.
  - `valueDescription`: the current node's description; `valueDescriptions` wins.
  - `expandedKeys` for `'kor'`: `['geo', 'sik']`; with `expand: 'top'` as the many-of tree's.
- [ ] **Step 2: failing tests** in `kinds.test.tsx`, `describe('oneOfTree')`:
  `initialValueOf` as above; `valueTypeOf('oneOfTree') === stringType`; `sanitizeStored`: `'kor'`
  kept; `'nope'`, `'geo'` (folder) and, not optional, `''` fall back to the initial value with one
  warning each; optional `''` kept silently.
- [ ] **Step 3:** run both files; expect failures.
- [ ] **Step 4:** implement `useOneOfTreeField.ts` (modelled on useOneOfField and
  useManyOfTreeField), the kinds.ts cases, the exports, and a README section for the kind
  (`choosable`, `choose`, `optional`, the controls).
- [ ] **Step 5:** run both files, `tree.test.ts`, `useStoredField.test.tsx`, and
  `pnpm --filter vultus-core typecheck`.
- [ ] **Step 6:** commit `feat(vultus-core): the one-of tree field kind`.

### Task 4: OneOfTreePicker and the kind's registration (vultus-antd)

**Files:**
- Create: `packages/vultus-antd/src/OneOfTreePicker.tsx`,
  `packages/vultus-antd/src/useOneOfTreeRequest.ts`
- Modify: `packages/vultus-antd/src/treeData.tsx` (accept one-of tree nodes),
  `packages/vultus-antd/src/FieldWidget.tsx`, `packages/vultus-antd/src/Field.tsx`,
  `packages/vultus-antd/src/texts.ts`, `packages/vultus-antd/src/index.ts`
- Test: `packages/vultus-antd/src/__tests__/OneOfTreePicker.test.tsx` (new),
  `packages/vultus-antd/src/__tests__/Field.test.tsx`

**Interfaces:**
- Consumes: Task 3's `OneOfTreeFieldControls`, `OneOfTreeNodeControls`, `useOneOfTreeField`.
- Produces:
  - `useOneOfTreeRequest<T>(field: OneOfTreeFieldControls<T>): { request(next: T | ''): void; wrap; asking }`
    — as useOneOfRequest: the confirmation's OK labelled with the requested node's label (the
    field's label for `''`); nothing while disabled, pending, asking, or `next === field.value`.
  - `treeData` accepts nodes of either kind (`TreeNodeControls` or `OneOfTreeNodeControls`, typed
    by a `children` of the same type) and, for a node with `choosable`, sets antd's `selectable`
    to it.
  - `OneOfTreePickerProps<T> { field: OneOfTreeFieldControls<T>; size?; style?; listHeight?: number; popupMatchSelectWidth?: boolean | number; summary?: 'label' | 'path'; panel?: 'dropdown' | 'drawer' }`
    (defaults and JSDoc as ManyOfTreePickerProps; `panel="drawer"` is Task 6, accepted here
    and rendering the dropdown until then).
  - `VultusTexts` gains `pathSeparator` (`' › '`) and `none` (`'None'`).
  - FieldWidget: `WIDGETS.oneOfTree = { picker: OneOfTreePicker }`, default `'picker'`,
    `ControlsByKind.oneOfTree`, `KindOfControls` checks `OneOfTreeFieldControls` first.
  - Field: `oneOfTree: kindFields('oneOfTree', useOneOfTreeField)`; the store-read keys gain
    `'choose'`, `'optional'` (with `nodes`, `initialValue`); its kind-specific definition keys
    list gains `'choose'`, `'optional'`.
  - Exports: `OneOfTreePicker`, `OneOfTreePickerProps`.

Behaviour (spec "OneOfTreePicker"): antd TreeSelect single; a choosable node requests itself and
the dropdown closes; a folder opens / closes on click (`treeExpandAction="click"`); search as
ManyOfTreePicker's (accent-insensitive, keeps a match's subtree, keyboard never on a hidden node);
`value` passed to TreeSelect only while `field.current` exists (else the placeholder shows);
`summary="path"` shows `path` labels joined by `texts.pathSeparator`; `optional` shows a clear
button that requests `''`; the stable tooltip span (`withTooltip(..., { stable: true, ... })` with
the style split, block span without a width, as the other selects); `data-field-id`; notes
right-aligned, disabled nodes with reasons (treeData's `'aside'` style).

- [ ] **Step 1: failing tests** in `OneOfTreePicker.test.tsx` (the `geo` tree with a note on
  `kor` and a description on `alg`):
  - opening and clicking "Kör" requests `'kor'` and closes the dropdown; clicking "Geometria"
    (folder) requests nothing and shows / hides its children; under `choose: 'leaves'`
    "Síkgeometria" requests nothing.
  - the closed field shows "Kör"; with `summary="path"` "Geometria › Síkgeometria › Kör".
  - a value naming no node shows the placeholder, not "gone".
  - search "kor" shows Kör with its ancestors; "geometria" keeps Síkgeometria and Kör under
    Geometria; the current value survives a search that hides it.
  - optional: the clear button requests `''`; not optional: no clear button.
  - a disabled node "Térgeometria" cannot be chosen and its reason is its tooltip.
  - with a confirmation (`commit: { fire, confirmation: { kind: 'modal', … } }`), choosing asks
    first and the OK names the node.
  - focus stays on the control across a value change in `<Field item>` (as stableTooltip.test).
- [ ] **Step 2: failing tests** in `Field.test.tsx`: a `oneOfTree` definition renders
  OneOfTreePicker by default; `<Field stored definition={d} nodes={…}>` throws (a store-read key).
- [ ] **Step 3:** run both files; expect failures.
- [ ] **Step 4:** implement.
- [ ] **Step 5:** run both files, `ManyOfTreePicker.test.tsx`, `ManyOfTreeChecklist.test.tsx`
  (treeData changed), then `pnpm --filter vultus-antd typecheck` and
  `pnpm --filter vultus-core typecheck`.
- [ ] **Step 6:** commit `feat(vultus-antd): OneOfTreePicker; the one-of tree kind renders`.

### Task 5: OneOfTreeList (vultus-antd)

**Files:**
- Create: `packages/vultus-antd/src/OneOfTreeList.tsx`
- Modify: `packages/vultus-antd/src/FieldWidget.tsx` (`list`; `WidgetName` gains `'list'`),
  `packages/vultus-antd/src/index.ts`
- Test: `packages/vultus-antd/src/__tests__/OneOfTreeList.test.tsx` (new)

**Interfaces:**
- Consumes: Task 4's `useOneOfTreeRequest`, `treeData`, texts `none`, `search`.
- Produces: `OneOfTreeListProps<T> { field: OneOfTreeFieldControls<T>; search?: boolean; style? }`
  and an internal `nested?: boolean` (as ManyOfTreeChecklist's: no `data-field-id` / `data-value`,
  for the picker's drawer, Task 6) plus an internal `onChosen?: () => void` (called after a
  plain-click request, for the drawer to close); `WIDGETS.oneOfTree.list`; exports
  `OneOfTreeList`, `OneOfTreeListProps`.

Behaviour (spec "OneOfTreeList"): antd Tree (`blockNode`, no checkboxes, controlled
`selectedKeys = current ? [value] : []` and `expandedKeys` starting at `field.expandedKeys`);
`onPath` titles strong; a choosable node requests itself on click and opens if it has children
(never closes on that click); a folder toggles; when `field.value` changes, its `path` ancestors
join the expanded keys and the node scrolls into view (`scrollIntoView?.({ block: 'nearest' })`);
links: when `field.enabled && !field.pending` and `field.hrefFor(node.value)` is a string, a
choosable node's title is `<a href>`; a plain left click prevents the default and lets the tree's
selection request it; a click with Ctrl / Cmd / Shift / Alt stops propagation and leaves the
default (no request); `search` adds the many-of tree's search box (`texts.search` label, same
filtering); `optional` adds a first row (`placeholder` else `texts.none`) that requests `''` and
shows selected while the value is `''`; the stable tooltip span around the tree (block); disabled
nodes greyed with reasons (treeData `'brackets'` notes).

- [ ] **Step 1: failing tests** in `OneOfTreeList.test.tsx`:
  - the current node is selected (`aria-selected` / antd's selected class) and its ancestors'
    titles are strong; a value naming no node selects nothing.
  - clicking "Kör" requests `'kor'`; clicking "Síkgeometria" (with children) requests it and its
    children stay shown; clicking "Geometria" (folder) toggles its children and requests nothing.
  - rerendering with value `'kor'` from `'alg'` opens Geometria and Síkgeometria.
  - links: with `hrefFor: (v) => '#?toc=' + v`, "Kör" is `<a href="#?toc=kor">`; a plain click
    requests once and `defaultPrevented` is true; a Ctrl-click requests nothing and is not
    default-prevented; a folder has no `<a>`; without `hrefFor` no `<a>` at all; with the field
    disabled, or a commit pending, no `<a>` and clicks request nothing.
  - `search`: typing "kor" leaves Kör and its ancestors; Enter on the active (shown) node chooses
    it; the current value survives a search hiding it.
  - optional: the first row reads the placeholder (else "None"), requests `''`, and is selected
    while the value is `''`.
  - a disabled node cannot be chosen; its reason is its tooltip.
  - `<Field definition={d} widget="list" />` renders OneOfTreeList.
- [ ] **Step 2:** run the file; expect failures.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run the file, `Field.test.tsx`, `OneOfTreePicker.test.tsx`;
  `pnpm --filter vultus-antd typecheck`.
- [ ] **Step 5:** commit `feat(vultus-antd): OneOfTreeList, links included`.

### Task 6: the picker's phone panel, and the widgets' tooltip anchor

**Files:**
- Modify: `packages/vultus-antd/src/OneOfTreePicker.tsx`
- Test: `packages/vultus-antd/src/__tests__/OneOfTreePickerPanel.test.tsx` (new),
  `packages/vultus-antd/src/__tests__/stableTooltip.test.tsx`,
  `packages/vultus-antd/src/__tests__/tooltipAnchor.test.tsx`

**Interfaces:**
- Consumes: Task 5's `OneOfTreeList` with `nested` and `onChosen`.

Behaviour: as ManyOfTreePicker's `panel="drawer"`: the closed field never opens its dropdown; a
tap anywhere on it (or Enter on the focused field) opens a drawer from the bottom (88% high),
titled with the field's label, holding `<OneOfTreeList field={field} search nested onChosen={close} />`;
choosing closes it; no Done button; the optional clear still works on the closed field.

- [ ] **Step 1: failing tests** in `OneOfTreePickerPanel.test.tsx`: a tap opens the drawer (no
  dropdown) titled with the label; choosing "Kör" in it requests `'kor'` and closes it; the
  drawer's list carries no `data-field-id`; its search filters; Enter on the focused field opens
  it. In `stableTooltip.test.tsx` and `tooltipAnchor.test.tsx`: OneOfTreePicker and OneOfTreeList
  cases parallel to the existing selects' (same node and focus across a value whose description
  comes and goes; the `vultus-tooltip-anchor` span takes `style.width` / layout keys; the picker
  without a width gets a block span).
- [ ] **Step 2:** run the three files; expect failures.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run the three files and `OneOfTreePicker.test.tsx`; `pnpm --filter vultus-antd typecheck`.
- [ ] **Step 5:** commit `feat(vultus-antd): OneOfTreePicker's phone panel`.

### Task 7: gallery and docs

**Files:**
- Create: `packages/vultus-gallery/src/fields/OneOfTreeField.stories.tsx`
- Modify: `packages/vultus-gallery/src/definitions/Field.stories.tsx` (a one-of tree with the
  `list` hint), `packages/vultus-antd/README.md`, `docs/2026-10-15-vultus-field-kinds-design.md`
  (widget table row `| oneOfTree | OneOfTreePicker (picker, default), OneOfTreeList (list) |`)

Stories (title `Fields/One of tree`, the style of `Fields/Many of tree`): picker (disabled nodes
with reasons, notes and dimmed, folders, `choose: 'leaves'`, optional with a placeholder,
`summary="path"`), on a phone (`panel="drawer"`), list (optional "All categories", `search`), and
"Table of contents": a memory router + `<ReactRouterArgStore>` (as `Definitions/Stored fields`), a
chapter tree run through `useOneOfTreeField(useStoredField(toc).options)`, rendered with
`<FieldWidget field={…} widget="list" />`, with "‹ previous" / "next ›" antd Buttons whose `href`
is `field.hrefFor(field.previous / next .value)` and whose click requests it, and the current URL
shown under it.

- [ ] **Step 1:** write the stories and docs.
- [ ] **Step 2:** `pnpm --filter vultus-gallery typecheck`.
- [ ] **Step 3:** headless Chromium on :6008: each new story renders without console errors;
  screenshots `/tmp/oneoftree-*.png`; in the TOC story, "next ›" moves the selection and the URL,
  and the list's entries are `<a href>`.
- [ ] **Step 4:** commit `docs(vultus): one-of tree stories and READMEs`.
