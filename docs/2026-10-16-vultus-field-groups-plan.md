# Field groups: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `useFieldGroup(definitions, { stored? })` in vultus-core: the definitions' option
functions read each other's shown values as `ctx.values.<id>`, with the fallback rule, defaults
that follow options, cycle detection and loud errors; inside and stored storage.

**Architecture:** a pure engine (`fieldGroupValues.ts`) computes each field's default and shown
value on demand from kept values, with options evaluated in a guarded context carrying `values`;
`useFieldGroup` keeps the values (React state, or the ArgStore), runs each field's kind hook in
outside storage mode (`value` = shown value, `onChange` = write the kept value) with the group's
context set for the duration of the call, and returns the controls. Widgets are unchanged.

**Tech Stack:** TypeScript, React 19, vitest + Testing Library (jsdom), pnpm workspace.

**Spec:** `docs/2026-10-16-vultus-field-groups-design.md` (read it first).

## Global Constraints

- Work in `~/chat/vultus/unitas`, branch `csillag/vultus-field-groups`.
- vultus-core stays antd-free (`src/no-antd.test.ts`). No new dependencies.
- Tests per task: only the affected test files, `pnpm --filter <pkg> exec vitest run src/__tests__/<file>`; plus `pnpm --filter <pkg> typecheck` for each touched package.
- Error texts as the spec words them (field id and option first, as `readingContext` does today).
- Code style: match the surrounding files (explanatory JSDoc on exports).
- Commits: explicit `git add <files>`; message ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`; no version bumps, no merges.

## Review Focus

- A field whose default comes from options that read another field: the default moves with that field, in both storage modes (Task 2, 3, 4).
- The kept value returning: A changes away (B falls back), A changes back (B shows its kept value again) (Task 2, 3, 4).
- A function reading `ctx.values` during the kind hook's render but also a function the hook keeps and calls later (numeric `format(n, ctx)`): it must still see the group's context (Task 3).
- TeacherTeacher's case: a stored `search` (text) and `toc` (oneOfTree, `visible: (ctx) => ctx.values.search === ''`): typing hides the list, clearing shows it, the URL keeps `toc` (Task 4).
- A group re-rendered with new definition objects of the same shape (inline literals): no error, no loop (Task 3).

---

### Task 1: the field context for groups

**Files:** Modify `packages/vultus-core/src/FieldContext.tsx`; Test `packages/vultus-core/src/__tests__/FieldContext.test.tsx`

**Interfaces (internal; not exported from index.ts):**
- `extendFieldContext(base: FieldCtx, extra: Record<string, unknown>, where: string): object` — a
  guarded context with `base`'s keys (none for `NO_FIELD_CONTEXT`) plus `extra`'s; throws
  `${where}: the field context already has '${key}'; a field group provides it` when `base` has a
  key of `extra`.
- `withFieldContext<T>(ctx: FieldCtx, run: () => T): T` — while `run` executes (synchronously),
  `useFieldContext()` returns `ctx`; restored in `finally`; nests.
- The guard: reading `values` from a context that has no `values` key throws the missing-key
  error with the text `ctx.values is only available inside a field group` (instead of the
  generic "was never provided").

- [ ] Step 1: failing tests: extend keeps base keys and adds extra; conflict throws with the text;
  `withFieldContext` makes a hook called inside `run` see the given context, restores after,
  restores after a throw, nests; reading `values` outside a group gives the group text (through
  `resolveIn`, prefixed with the field and option).
- [ ] Step 2: run, expect failures. Step 3: implement. Step 4: run the file and
  `pnpm --filter vultus-core typecheck`. Step 5: commit `feat(vultus-core): the field context carries a group's values`.

### Task 2: the group values engine (pure)

**Files:** Create `packages/vultus-core/src/fieldGroupValues.ts`; Test `packages/vultus-core/src/__tests__/fieldGroupValues.test.ts`

**Interfaces:**
- Consumes Task 1's `extendFieldContext`; the existing `initialValueOf`, `sanitizeStored`, `valueTypeOf` (kinds.ts).
- Produces:
  ```ts
  interface GroupValues {
    ctx: object;                        // guarded: app keys + `values` (lazy getters by id)
    valueOf(id: string): unknown;       // shown value: sanitizeStored(kept ?? default), options in ctx
    defaultOf(id: string): unknown;     // initialValue (no `values`), else the kind's implicit initial from current options
    values: Readonly<Record<string, unknown>>; // shown values, all ids
  }
  function createGroupValues(params: {
    definitions: readonly FieldDefinition[];
    appCtx: FieldCtx;
    kept(id: string): unknown | undefined;   // undefined: no kept value (reads as the default)
    warn(id: string, message: string): void; // sanitizing warnings (the caller decides silence/once)
  }): GroupValues
  ```
  Each call is one render's snapshot: results memoized per id within the instance.
- Errors (spec texts): unknown id in `ctx.values` (`no field '<id>' in the group (fields: …)`);
  duplicate ids; a `mixed-boolean` definition; `initialValue` reading `values`
  (`initialValue cannot read other fields' values`); a cycle
  (`Fields 'a' -> 'b' -> 'a' depend on each other's values`), detected with an in-progress set
  over `valueOf`/`defaultOf`.
- `initialValue` functions receive a context whose `values` throws the initialValue text; every
  other option receives `ctx` (wrap the definition's `initialValue` before `initialValueOf`).

- [ ] Step 1: failing tests over `layout` (oneOf rendered/original), `paper` (oneOf, choices
  depend on layout: rendered → [a4, a5], original → [a4, a5, letter]), `copies` (numeric,
  `visible` depends on layout): `values.paper` reads `layout`; `paper` kept `letter` with layout
  `rendered` shows `a4` (fallback), with `original` shows `letter`; a oneOf without
  `initialValue` whose choices depend on another field has a default that moves; the app
  context's own key readable beside `values`; each error above with its text.
- [ ] Step 2: run, expect failures. Step 3: implement. Step 4: run the file and typecheck.
  Step 5: commit `feat(vultus-core): field group values: references, fallbacks, cycles`.

### Task 3: `useFieldGroup` in the group's own state

**Files:** Create `packages/vultus-core/src/useFieldGroup.ts`, `packages/vultus-core/src/kindHooks.ts`;
Modify `packages/vultus-core/src/index.ts`, `packages/vultus-core/README.md`;
Test `packages/vultus-core/src/__tests__/useFieldGroup.test.tsx`

**Interfaces:**
- `kindHooks.ts`: `useKindField(definition, options)` dispatching on `definition.kind` to the
  kind's hook (internal).
- Exported:
  ```ts
  interface FieldGroup {
    fields: FieldControls<any, any>[];           // in definition order (the kind hooks' own controls)
    byId: Record<string, FieldControls<any, any>>;
    values: Readonly<Record<string, unknown>>;   // shown values
    isDefault(id: string): boolean;              // throws for an id not in the group
    changedCount: number;
    resetAll(method?: UpdateMethod): void;
  }
  function useFieldGroup(definitions: readonly FieldDefinition[], options?: { stored?: boolean }): FieldGroup
  ```
- Inside mode (this task): kept values in `useState<Record<string, unknown>>({})`; a write of a
  value equal to the field's current default removes the key; `resetAll` clears all; fallbacks
  silent. Each field: `withFieldContext(group.ctx, () => useKindField(def, { ...defWithoutInitialValue, value: valueOf(id), onChange: write(id) }))`,
  in definition order (stable hook order). Shape check: ids+kinds of the first render kept in a
  ref; a different shape throws (spec text: remount with a React `key`).
- `stored` throws `not yet` until Task 4 (Task 4 replaces it).
- README: a "Field groups" section (references, the fallback rule, defaults, errors, storage,
  rendering with `<FieldWidget>`).

- [ ] Step 1: failing tests (renderHook): `byId.paper.choices` follow `layout`; setting layout
  back shows the kept paper again; `copies.visible` follows layout and its value stays when
  hidden; `isDefault`/`changedCount`/`resetAll`; a value set equal to the default is not kept
  (the field then follows its default); shape change throws; rerender with new but equal
  definition objects is fine; numeric `format` given as `(n, ctx) => …` reading `ctx.values`
  works when the widget-facing controls format a number after render.
- [ ] Step 2-4 as usual (run the new file, kinds.test, useStoredField.test, typecheck). Step 5:
  commit `feat(vultus-core): useFieldGroup`.

### Task 4: stored groups

**Files:** Modify `packages/vultus-core/src/useFieldGroup.ts`, README;
Test `packages/vultus-core/src/__tests__/useFieldGroup.test.tsx`,
`packages/vultus-react-router/src/__tests__/StoredGroup.test.tsx` (new)

**Interfaces:** `stored: true` reads every field's raw value from the nearest ArgStore in one
subscription (as `useStoredFields`), parses it with `valueTypeOf(kind)` (an unparsable raw warns
once and counts as absent); `onChange` writes `rawFor(value, currentDefault)` (absent when equal);
`hrefFor` from `store.hrefFor` likewise; sanitizing warnings once per (field, raw value), as
`useStoredField`; `resetAll(method = 'replace')` one write of all keys.

- [ ] Step 1: failing tests: core over `memoryStore` (absent key reads as the current default;
  a stored `letter` falls back under `rendered` and returns under `original`, the store
  untouched; one warning per raw value; `resetAll` one write; `hrefFor` with a store that has
  one); router (`createMemoryRouter` + `<ReactRouterArgStore>`): TeacherTeacher's
  `search`/`toc` case: typing into `search` hides `toc` (`visible` false), clearing shows it,
  `?toc=` untouched throughout; `hrefFor` gives URLs.
- [ ] Step 2-5 as usual; commit `feat(vultus-core): stored field groups`.

### Task 5: rendering, gallery, docs

**Files:** Test `packages/vultus-antd/src/__tests__/FieldGroup.test.tsx` (new); Create
`packages/vultus-gallery/src/definitions/FieldGroup.stories.tsx`; Modify
`packages/vultus-antd/README.md` (one line under `<FieldWidget>`).

- [ ] Step 1: antd test: a group's controls rendered with `<FieldWidget item>`: choosing a layout
  changes the paper select's options; the hidden field renders nothing.
- [ ] Step 2: story `Definitions/Field group` (spec "Gallery"), both storage modes, the stored one
  under a memory router with the URL shown; headless check on :6008 (no console errors,
  `/tmp/fieldgroup-*.png`).
- [ ] Step 3: gallery typecheck; commit `docs(vultus): field group story and READMEs`.
