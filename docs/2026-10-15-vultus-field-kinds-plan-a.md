# vultus field kinds, part A (vultus-core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vultus-core 0.5.0: field definitions as data with a field context, the many-of, numeric, range, tree and text hooks, value types, and the argument layer with memory and localStorage stores.

**Architecture:** Additive changes to vultus-core. A field context (one React context, its value guarded by a Proxy) is passed to every function in a definition. The new hooks are built on the existing `useFieldCore`. A kinds module ties each kind to its implicit initial value, value type and sanitizer. The argument layer (an `ArgStore` read with `useSyncExternalStore`) stores raw strings by key; field adapters put fields on top of it.

**Tech Stack:** TypeScript 5.7 (strict, ESM, relative imports with `.js`), React 19 hooks, vitest 3 + @testing-library/react (jsdom), pnpm 11 workspace.

**Spec:** `docs/2026-10-15-vultus-field-kinds-design.md` (parts B, vultus-react-router, and C, vultus-antd, get their own plan after this one is merged).

## Global Constraints

- Work only in the worktree `excavator:~/wt-vultus/unitas` (branch `csillag/vultus-field-kinds`). Never touch `~/deai/unitas` (excavator's dev stack links it). Never run `pnpm install` anywhere but the worktree root.
- Run tests per file: `cd ~/wt-vultus/unitas/packages/vultus-core && ./node_modules/.bin/vitest run <file>`. Type check: `./node_modules/.bin/tsc -p tsconfig.json`. No whole-suite runs per task; Task 11 verifies the tip once.
- vultus-core never imports antd (`src/no-antd.test.ts`) nor a router.
- Additive for today's callers (optio, excavator): existing tests keep passing; the only expected test edit is `useOneOfField.test.tsx`'s `toEqual` on choices (new `dimmed: false`).
- `ValueOrFn<T, Ctx = any> = T | ((ctx: Ctx) => T)`. Functions without parameters keep working without a provider.
- A missing context or context key throws; it never passes `undefined` along. Stored raw strings are outside input: they never throw, they fall back to the default (or are dropped from a list) with a `console.warn`.
- Error message prefixes: `Field '<id>': ` for fields, `Argument '<key>': ` for arguments.
- Commits: conventional (`feat(vultus-core): ...`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (unitas practice). Stage explicit files only.

## Review Focus

1. Probing the guarded context the way libraries do (`then`, `toJSON`, `asymmetricMatch`, `$$typeof`, symbols) must not throw. Test in Task 1.
2. Choices or nodes that change between renders while the value still holds one that is gone: no crash; the stale value is kept by the hook (only storage drops it), and toggling another choice keeps it. Test in Task 3.
3. Edited or old URL values: `'true'` for a boolean, `'abc'` for a number, `'5..2'` for a range, `'b,,a'` for a list. Parse returns `undefined` (default) or normalizes; never throws. Test in Task 8.
4. Writing a value equal to the default removes the key, also for a set in another order (default `['a','b']`, set `['b','a']`). Test in Task 9.
5. Two writes in the same tick (two `set` calls in one `act`) both land. Test in Task 9.

---

### Task 1: Field context and context functions

**Files:**
- Modify: `packages/vultus-core/src/types.ts` (`ValueOrFn`)
- Create: `packages/vultus-core/src/FieldContext.tsx`
- Modify: `packages/vultus-core/src/resolve.ts` (add `resolveIn`; `resolve` unchanged, actions keep using it)
- Modify: `packages/vultus-core/src/field.ts` (`useFieldCore` resolves its options through the context, including `initialValue`)
- Modify: `packages/vultus-core/src/useOneOfField.ts` (`choices` through the context)
- Modify: `packages/vultus-core/src/index.ts`
- Test: `packages/vultus-core/src/__tests__/FieldContext.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type ValueOrFn<T, Ctx = any> = T | ((ctx: Ctx) => T);                       // types.ts
  export const NO_FIELD_CONTEXT: unique symbol;                                        // FieldContext.tsx
  export type FieldCtx = object | typeof NO_FIELD_CONTEXT;
  export function FieldContextProvider(props: { value: object; children?: ReactNode }): JSX.Element;
  export function createFieldContext<Ctx extends object>(): {
    Provider: (props: { value: Partial<Ctx>; children?: ReactNode }) => JSX.Element };
  export function useFieldContext(): FieldCtx;                                         // the guarded value
  export function resolveIn<T>(v: ValueOrFn<T> | undefined, fallback: T, ctx: FieldCtx, where: string): T; // resolve.ts
  ```
- The option types of fields gain a last generic `Ctx = any`: `FieldOptions<TValue, TRequest, RouteId, Ctx>`, `FieldBaseOptions<TValue, Ctx>` (export it), `OneOfFieldOptions<T, RouteId, Ctx>`, `BoolFieldOptions<RouteId, Ctx>`, `MixedBoolFieldOptions<RouteId, Ctx>`; `initialValue?: ValueOrFn<TValue, Ctx>`.

**Rules:**
- `resolveIn`: `undefined` gives `fallback`; a non-function is returned as is; a function with `length === 0` is called with no argument; a function with `length > 0` is called with `ctx`, or, when `ctx === NO_FIELD_CONTEXT`, throws `` `${where} is a function of the field context, but no FieldContextProvider is above it` ``. `where` is `` `Field '${id}': option '${name}'` ``.
- The provider merges: `{ ...outerRaw, ...value }`, so the React context carries `{ raw, guarded }`. With no provider, `useFieldContext()` returns `NO_FIELD_CONTEXT`.
- The guard (a `Proxy` over `raw`) throws on reading a string key that is not `in` the raw value: `` `Field context: '${key}' was never provided (provided: ${Object.keys(raw).join(', ')})` ``. Symbols and `then`, `toJSON`, `asymmetricMatch`, `$$typeof`, `nodeType` pass through. A key present with the value `undefined` is fine.
- `createFieldContext` returns a typed alias of the same provider (one React context), so providers from different factories nest and merge.
- `useFieldCore` resolves `initialValue` once, in the `useState` initializer, through `resolveIn`.

- [ ] **Step 1: Write the failing tests** in `FieldContext.test.tsx` (silence React's error log with `vi.spyOn(console, 'error').mockImplementation(() => {})` where a render throws):
  - `functions without parameters work without a provider`: `useOneOfField({ id: 'm', label: () => 'Mode', choices: () => [{ value: 'a' }] })` gives `label === 'Mode'`, `value === 'a'`.
  - `a context function without a provider throws`: `renderHook(() => useBoolField({ id: 'sec', label: (ctx: { t: (k: string) => string }) => ctx.t('x') }))` throws `/Field 'sec': option 'label' is a function of the field context, but no FieldContextProvider is above it/`.
  - `the provider's value reaches the functions`: wrapper `<FieldContextProvider value={{ t: (k: string) => k.toUpperCase() }}>`, label `(ctx) => ctx.t('x')` gives `'X'`.
  - `nested providers merge`: outer `{ t }`, inner `{ items: [1, 2] }`; `description: (ctx) => ctx.t(String(ctx.items.length))` gives `'2'`.
  - `a missing key throws, naming it and the provided keys`: provider `{ t, lang: 'hu' }`, `label: (ctx) => ctx.items` throws `/Field context: 'items' was never provided \(provided: t, lang\)/`.
  - `a key provided as undefined is fine`: provider `{ items: undefined }`, `label: (ctx) => String(ctx.items)` gives `'undefined'`.
  - `probing the context does not throw` (Review Focus 1): `label: (ctx) => [ctx.then, ctx.toJSON, ctx.asymmetricMatch, ctx.$$typeof, ctx[Symbol.iterator]].map(String).join()` gives `'undefined,undefined,undefined,undefined,undefined'`.
  - `initialValue may be a context function`: provider `{ on: true }`, `useBoolField({ id: 'sec', initialValue: (ctx) => ctx.on })` gives `value === true`.
  - `choices may be a context function`: provider `{ allow: false }`, `useOneOfField({ id: 'm', choices: (ctx) => [{ value: 'a' }, { value: 'b', enabled: ctx.allow }], initialValue: 'a' })` gives `choices[1].enabled === false`.
  - `createFieldContext gives a typed provider of the same context`: `const C = createFieldContext<{ t: (k: string) => string }>()`; `<C.Provider value={{ t: () => 'T' }}>` gives label `'T'`.
- [ ] **Step 2: Run them and see them fail**: `./node_modules/.bin/vitest run src/__tests__/FieldContext.test.tsx`. Expected: FAIL (`FieldContextProvider` is not exported).
- [ ] **Step 3: Implement** `FieldContext.tsx`, `resolveIn`, the `Ctx` generics, and `useFieldCore`/`useOneOfField` resolving through `resolveIn` with `useFieldContext()`.
- [ ] **Step 4: Run** `FieldContext.test.tsx`, `useBoolField.test.tsx`, `useMixedBoolField.test.tsx`, `useOneOfField.test.tsx`, then `tsc -p tsconfig.json`. Expected: all pass, no type errors.
- [ ] **Step 5: Commit** `feat(vultus-core): field context; definition functions receive it`.

### Task 2: Common additions: kind, placeholder, widget hint, commits, note and dimmed, normalizeText

**Files:**
- Modify: `packages/vultus-core/src/field.ts`
- Create: `packages/vultus-core/src/choices.ts` (the choice types and `resolveChoice`, moved out of `useOneOfField.ts`, which re-exports the types)
- Create: `packages/vultus-core/src/normalizeText.ts`
- Modify: `packages/vultus-core/src/useOneOfField.ts`, `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/fieldCommon.test.tsx`, `src/__tests__/normalizeText.test.ts`; update `src/__tests__/useOneOfField.test.tsx` (choices' `toEqual` gains `dimmed: false`)

**Interfaces:**
- Consumes: Task 1's `resolveIn`, `useFieldContext`.
- Produces:
  ```ts
  export type FieldKind = 'boolean' | 'mixed-boolean' | 'oneOf' | 'manyOf' | 'numeric' | 'range' | 'tree' | 'text';
  export type WidgetHint = string | { name: string; [option: string]: unknown };
  // FieldBaseOptions<TValue, Ctx> gains:
  kind?: FieldKind; placeholder?: ValueOrFn<string | undefined, Ctx>; widget?: WidgetHint;
  // FieldControls<TValue, TRequest> gains:
  type: FieldKind;  placeholder: string | undefined;  commits: boolean;  widget: WidgetHint | undefined;
  // useFieldCore(type: FieldKind, ...)
  // choices.ts
  export interface OneOfChoice<T extends string = string> { /* today's fields */ note?: string; dimmed?: boolean }
  export interface OneOfChoiceControls<T extends string = string> { /* today's fields */ note: string | undefined; dimmed: boolean }
  export function resolveChoice<T extends string>(fieldId: string, choice: OneOfChoice<T>): OneOfChoiceControls<T>;
  export function normalizeText(text: string): string;   // normalizeText.ts
  ```

**Rules:**
- `kind` given and different from the hook's type throws `` `Field '${id}': a definition of kind '${kind}' was passed to the '${type}' hook` ``.
- `commits` is true exactly in commit storage.
- `normalizeText`: `text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`.

- [ ] **Step 1: Write the failing tests:**
  - `fieldCommon.test.tsx`: placeholder (a string, and a context function); `commits` false inside and with `onChange`, true with `commit`; `widget` passed through (`{ name: 'segmented', iconOnly: true }`); a mismatched `kind` throws (`useBoolField({ id: 'x', kind: 'oneOf' })`); one-of choices carry `note` (`'12'`) and `dimmed` (default `false`).
  - `normalizeText.test.ts`: `normalizeText('Kombinatorika') === 'kombinatorika'`, `normalizeText('Feltételes') === 'felteteles'`, `normalizeText('Ő') === 'o'`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two new files and `useOneOfField.test.tsx` (updated), `useBoolField.test.tsx`, `useMixedBoolField.test.tsx`, then in `packages/vultus-antd`: `./node_modules/.bin/vitest run src/__tests__/OneOfWidgets.test.tsx src/__tests__/BoolWidgets.test.tsx`, and `tsc`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(vultus-core): kind, placeholder, widget hint, commits, choice notes; normalizeText`.

### Task 3: many-of

**Files:**
- Create: `packages/vultus-core/src/useManyOfField.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/useManyOfField.test.tsx`

**Interfaces:**
- Consumes: `useFieldCore`, `resolveChoice`, `resolveIn`, `useFieldContext`.
- Produces:
  ```ts
  export type ManyOfOwnOptions<T extends string = string, Ctx = any> = { choices: ValueOrFn<OneOfChoice<T>[], Ctx> };
  export type ManyOfFieldOptions<T extends string = string, RouteId extends string = string, Ctx = any> =
    FieldOptions<T[], T[], RouteId, Ctx> & ManyOfOwnOptions<T, Ctx>;
  export interface ManyOfChoiceControls<T extends string = string> extends OneOfChoiceControls<T> { selected: boolean }
  export interface ManyOfFieldControls<T extends string = string> extends FieldControls<T[], T[]> {
    choices: ManyOfChoiceControls<T>[]; isSelected(value: T): boolean; toggle(value: T): void }
  export function useManyOfField<T extends string = string, RouteId extends string = string, Ctx = any>(
    opts: ManyOfFieldOptions<T, RouteId, Ctx>, registry?: ErrorRoutesRegistry<RouteId>): ManyOfFieldControls<T>;
  export function manyOfInitialValue<T extends string>(opts: { initialValue?: ValueOrFn<T[]> }, ctx: FieldCtx, id: string): T[];  // resolved, else []
  ```
- Also add `OneOfOwnOptions<T, Ctx> = { choices: ValueOrFn<OneOfChoice<T>[], Ctx> }` to `useOneOfField.ts` and `oneOfInitialValue(opts, ctx, id)` (resolved `initialValue`, else the first enabled choice), used by `useOneOfField` itself.

**Rules:**
- A request is normalized: known values in choice order without duplicates, then values the field holds that are no longer among the choices, in their current order (Review Focus 2).
- A request that contains an unknown value, or changes the membership of a disabled choice, is ignored with `console.warn` (as one-of). `toggle` of a disabled or unknown choice likewise.
- `kind` `'manyOf'`.

- [ ] **Step 1: Write the failing tests:**
  - starts at `[]`; `toggle('a')` gives `['a']`, again `[]`;
  - `setValue(['c', 'a'])` gives `['a', 'c']` (choice order); `choices[].selected` follows;
  - a disabled choice `b` (in `initialValue`) cannot be toggled off or on; `console.warn` called; value unchanged;
  - `setValue(['a', 'zz'])` is ignored with a warning;
  - local storage: `value: ['a']`, `onChange` spy; `setValue([])` calls it with `[]` (an empty list is a value);
  - Review Focus 2: local `value: ['a', 'gone']` with choices `a, b`; `toggle('b')` calls `onChange(['a', 'b', 'gone'])`; `isSelected('gone') === true`; no throw;
  - commit storage: `commit.fire` receives the normalized list; `confirmationFor(['a'])` uses a function confirmation;
  - choices and `initialValue` as context functions (`initialValue: (ctx) => ctx.all`).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `useManyOfField.test.tsx`, `useOneOfField.test.tsx`, `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): useManyOfField`.

### Task 4: numeric

**Files:**
- Create: `packages/vultus-core/src/numeric.ts` (shared by numeric and range), `packages/vultus-core/src/useNumericField.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/useNumericField.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface NumericBounds<Ctx = any> {
    min?: ValueOrFn<number | undefined, Ctx>; max?: ValueOrFn<number | undefined, Ctx>;
    step?: ValueOrFn<number | undefined, Ctx>; integer?: ValueOrFn<boolean, Ctx>;
    unit?: ValueOrFn<string | undefined, Ctx>; format?: (n: number, ctx: any) => string }
  export interface ResolvedNumeric { min: number | undefined; max: number | undefined; step: number | undefined;
    integer: boolean; unit: string | undefined; format(n: number): string }
  export function resolveNumeric(id: string, opts: NumericBounds, ctx: FieldCtx): ResolvedNumeric;
  export function clamp(n: number, min?: number, max?: number): number;
  export type NumericOwnOptions<Ctx = any> = NumericBounds<Ctx>;
  export type NumericFieldOptions<RouteId extends string = string, Ctx = any> = FieldOptions<number, number, RouteId, Ctx> & NumericOwnOptions<Ctx>;
  export interface NumericFieldControls extends FieldControls<number, number>, ResolvedNumeric { valueText: string }
  export function useNumericField<RouteId extends string = string, Ctx = any>(opts: NumericFieldOptions<RouteId, Ctx>, registry?: ErrorRoutesRegistry<RouteId>): NumericFieldControls;
  export function numericInitialValue(opts: NumericFieldOptions, ctx: FieldCtx, id: string): number;   // resolved initialValue, else clamp(min ?? 0, min, max)
  ```

**Rules:**
- Default format: `` `${n}${unit ?? ''}` ``. A `format` with two declared parameters and no provider throws as `resolveIn` does (`option 'format'`).
- The shown value is clamped into the bounds. A request is clamped, rounded when `integer`; a non-finite request is ignored with a warning.
- `kind` `'numeric'`.

- [ ] **Step 1: Write the failing tests:** implicit initial (`min: 5` gives 5; none gives 0; `min: 2` gives 2); `valueText` with `unit: '%'` gives `'50%'`; `format: (n, ctx) => ctx.lang + n` under a provider `{ lang: 'hu' }`; `integer` rounds `setValue(2.6)` to 3; `setValue(500)` with `max: 100` gives 100; `setValue(NaN)` ignored with a warning; local value 500 with `max: 100` shows 100.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `useNumericField.test.tsx`, `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): useNumericField`.

### Task 5: range

**Files:**
- Create: `packages/vultus-core/src/useRangeField.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/useRangeField.test.tsx`

**Interfaces:**
- Consumes: `NumericBounds`, `resolveNumeric`, `clamp` (Task 4).
- Produces:
  ```ts
  export type Range = [number, number];
  export type RangeOwnOptions<Ctx = any> = NumericBounds<Ctx> & { min: ValueOrFn<number, Ctx>; max: ValueOrFn<number, Ctx> };
  export type RangeFieldOptions<RouteId extends string = string, Ctx = any> = FieldOptions<Range, Range, RouteId, Ctx> & RangeOwnOptions<Ctx>;
  export interface RangeFieldControls extends FieldControls<Range, Range>, ResolvedNumeric { min: number; max: number; valueText: string }
  export function useRangeField<RouteId extends string = string, Ctx = any>(opts: RangeFieldOptions<RouteId, Ctx>, registry?: ErrorRoutesRegistry<RouteId>): RangeFieldControls;
  export function rangeInitialValue(opts: RangeFieldOptions, ctx: FieldCtx, id: string): Range;   // resolved initialValue, else [min, max]
  ```

**Rules:** `step` defaults to 1. `valueText` is `` `${format(from)}–${format(to)}` `` (U+2013). The shown value is each end clamped, then ordered. A request is clamped, rounded when `integer`, ordered (`from <= to`). `kind` `'range'`.

- [ ] **Step 1: Write the failing tests:** implicit `[min, max]`; `valueText` with `format: (y) => \`${y}/${String(y + 1).slice(2)}\`` on `[2010, 2025]` gives `'2010/11–2025/26'`; a local value `[2005, 2030]` with bounds `2010..2025` shows `[2010, 2025]`; `setValue([2020, 2015])` gives `[2015, 2020]`; `min`/`max` as context functions; `step` defaults to 1.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `useRangeField.test.tsx`, `useNumericField.test.tsx`, `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): useRangeField`.

### Task 6: tree

**Files:**
- Create: `packages/vultus-core/src/tree.ts` (pure helpers), `packages/vultus-core/src/useTreeField.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/tree.test.ts`, `src/__tests__/useTreeField.test.tsx`

**Interfaces:**
- Consumes: `resolveChoice`, `normalizeText`.
- Produces:
  ```ts
  export interface TreeNode<T extends string = string> extends OneOfChoice<T> { children?: TreeNode<T>[] }
  export interface TreeNodeControls<T extends string = string> extends OneOfChoiceControls<T> {
    children: TreeNodeControls<T>[] | undefined; checked: boolean }
  export type TreeSelection = 'topmost' | 'all' | 'leaves' | 'independent';
  export type TreeExpand = 'top' | 'none' | 'selected' | 'all';
  export function normalizeTreeValue<T extends string>(nodes: TreeNode<T>[], value: T[], selection: TreeSelection): T[];
  export function coveredNodes<T extends string>(nodes: TreeNode<T>[], value: T[], selection?: TreeSelection): T[];
  export function filterTree<N extends { label?: string; value: string; children?: N[] }>(nodes: N[], query: string): N[];
  export type TreeOwnOptions<T extends string = string, Ctx = any> = {
    nodes: ValueOrFn<TreeNode<T>[], Ctx>; selection?: TreeSelection; expand?: TreeExpand };
  export type TreeFieldOptions<T extends string = string, RouteId extends string = string, Ctx = any> = FieldOptions<T[], T[], RouteId, Ctx> & TreeOwnOptions<T, Ctx>;
  export interface TreeFieldControls<T extends string = string> extends FieldControls<T[], T[]> {
    nodes: TreeNodeControls<T>[]; selection: TreeSelection; expandedKeys: T[];
    byValue: Map<T, TreeNodeControls<T>>; toggle(value: T): void }
  export function useTreeField<T extends string = string, RouteId extends string = string, Ctx = any>(opts: TreeFieldOptions<T, RouteId, Ctx>, registry?: ErrorRoutesRegistry<RouteId>): TreeFieldControls<T>;
  export function treeInitialValue<T extends string>(opts: { initialValue?: ValueOrFn<T[]> }, ctx: FieldCtx, id: string): T[];  // resolved, else []
  ```

**Rules:**
- Normalization (antd's semantics), output in tree pre-order, unknown values kept at the end:
  - `topmost` (default; `SHOW_PARENT`): a node whose ancestor is covered is dropped; a node all of whose children are covered replaces them (recursively);
  - `all` (`SHOW_ALL`): every covered node: the value's nodes, their descendants, and ancestors all of whose children are covered;
  - `leaves` (`SHOW_CHILD`): the covered leaves;
  - `independent` (`checkStrictly`): the value as given, without duplicates.
- `coveredNodes`: every node the value stands for (all descendants of each value node in the cascading modes; the value itself in `independent`).
- `toggle(node)`: in the cascading modes, from the covered set: a covered node is removed with its descendants and its ancestors; an uncovered one is added with its descendants; the result is normalized. In `independent`, add or remove the node. Toggling a disabled node is ignored with a warning. `setValue` normalizes and does not police disabled nodes (the widgets disable them).
- `checked`: covered (cascading modes) or in the value (`independent`).
- `filterTree`: keeps a node whose `normalizeText(label ?? value)` includes `normalizeText(query.trim())`, or which has a kept descendant (with only its kept children); an empty query returns the nodes unchanged.
- `expandedKeys`: `top` (default), the roots with children; `none`, `[]`; `selected`, the ancestors of the value's nodes; `all`, every node with children.
- `kind` `'tree'`.

- [ ] **Step 1: Write the failing tests** over a fixture `A(A1, A2(A2a, A2b)), B(B1)`:
  - `tree.test.ts`: topmost: `['A1', 'A']` gives `['A']`; `['A2a', 'A2b']` gives `['A2']`; `['A1', 'A2']` gives `['A']`. all: `['A2']` gives `['A2', 'A2a', 'A2b']`. leaves: `['A']` gives `['A1', 'A2a', 'A2b']`. independent: `['A', 'A1', 'A']` gives `['A', 'A1']`. Unknown kept last: `['zz', 'B1']` topmost gives `['B', 'zz']`. `coveredNodes(['A2'])` gives `['A2', 'A2a', 'A2b']`. `filterTree` with labels `Kombinatorika` under `Matek` and a sibling `Geometria`: query `'kombinatorika'` keeps `Matek > Kombinatorika` only; `''` returns all.
  - `useTreeField.test.tsx`: starts at `[]`; `toggle('A2b')` with value `['A']` (topmost) gives `['A1', 'A2a']`; toggling a disabled node is ignored with a warning; `checked` on descendants of a value node; `expandedKeys` for each `expand`; nodes with `note` and `dimmed`; nodes as a context function.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `tree.test.ts`, `useTreeField.test.tsx`, `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): useTreeField and tree helpers`.

### Task 7: text

**Files:**
- Create: `packages/vultus-core/src/useTextField.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/useTextField.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type TextOwnOptions = { control?: 'input' | 'textarea' };
  export type TextFieldOptions<RouteId extends string = string, Ctx = any> = FieldOptions<string, string, RouteId, Ctx> & TextOwnOptions;
  export interface TextFieldControls extends FieldControls<string, string> { control: 'input' | 'textarea' }
  export function useTextField<RouteId extends string = string, Ctx = any>(opts: TextFieldOptions<RouteId, Ctx>, registry?: ErrorRoutesRegistry<RouteId>): TextFieldControls;
  export function textInitialValue(opts: { initialValue?: ValueOrFn<string> }, ctx: FieldCtx, id: string): string;   // resolved, else ''
  ```
- Also add `boolInitialValue(opts, ctx, id)` and `mixedBoolInitialValue(opts, ctx, id)` (resolved, else `false`) next to their hooks, used by them.

- [ ] **Step 1: Write the failing tests:** starts at `''`; `control` defaults to `'input'`; `setValue('abc')`; `commits` with `commit`; `placeholder` from a context function.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `useTextField.test.tsx`, `useBoolField.test.tsx`, `useMixedBoolField.test.tsx`, `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): useTextField`.

### Task 8: Definitions, value types, initial values, sanitizing

**Files:**
- Create: `packages/vultus-core/src/valueTypes.ts`, `packages/vultus-core/src/kinds.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/valueTypes.test.ts`, `src/__tests__/kinds.test.tsx`

**Interfaces:**
- Consumes: each kind's `XOwnOptions` and `xInitialValue` (Tasks 3-7), `FieldBaseOptions`.
- Produces:
  ```ts
  export interface ValueType<T> { parse(raw: string): T | undefined; format(value: T): string; isEqual(a: T, b: T): boolean }
  export const booleanType: ValueType<boolean>;      // '1' / '0'; anything else: undefined
  export const stringType: ValueType<string>;
  export const stringSetType: ValueType<string[]>;   // format: sorted, comma-joined; '' <-> []; parse drops empty items and sorts; format throws on an item containing ','
  export const numberType: ValueType<number>;        // '' or not finite: undefined
  export const rangeType: ValueType<[number, number]>; // 'from..to'; from > to or not finite: undefined
  type Definition<K extends FieldKind, V, Own, Ctx> = { kind: K } & FieldBaseOptions<V, Ctx> & { initialValue?: ValueOrFn<V, Ctx> } & Own;
  export type FieldDefinition<Ctx = any> =
    | Definition<'boolean', boolean, {}, Ctx> | Definition<'mixed-boolean', MixedBool, {}, Ctx>
    | Definition<'oneOf', string, OneOfOwnOptions<string, Ctx>, Ctx> | Definition<'manyOf', string[], ManyOfOwnOptions<string, Ctx>, Ctx>
    | Definition<'numeric', number, NumericOwnOptions<Ctx>, Ctx> | Definition<'range', Range, RangeOwnOptions<Ctx>, Ctx>
    | Definition<'tree', string[], TreeOwnOptions<string, Ctx>, Ctx> | Definition<'text', string, TextOwnOptions, Ctx>;
  export function initialValueOf(definition: FieldDefinition, ctx: FieldCtx): unknown;
  export function valueTypeOf(kind: FieldKind): ValueType<any>;      // throws for 'mixed-boolean'
  export function sanitizeStored(definition: FieldDefinition, value: unknown, ctx: FieldCtx): unknown;
  ```

**Rules:**
- `valueTypeOf('mixed-boolean')` throws `` `a mixed-boolean field is an aggregate of other data and cannot be stored` ``.
- `sanitizeStored`, with a `console.warn` naming the field whenever it changes something: one-of, a value not among the choices gives `initialValueOf`; many-of and tree, values not among the choices or nodes are dropped (tree, then normalized); numeric, clamped; range, clamped and ordered; boolean and text, unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `valueTypes.test.ts` (Review Focus 3): `booleanType.parse('1') === true`, `parse('0') === false`, `parse('true') === undefined`; `numberType.parse('abc') === undefined`, `parse('') === undefined`, `parse('12') === 12`; `rangeType.parse('2010..2025')` gives `[2010, 2025]`, `parse('5..2') === undefined`, `format([1, 2]) === '1..2'`; `stringSetType.parse('b,,a')` gives `['a', 'b']`, `parse('')` gives `[]`, `format(['b', 'a']) === 'a,b'`, `format([]) === ''`, `format(['a,b'])` throws `/contains ','/`, `isEqual(['a', 'b'], ['b', 'a'])`.
  - `kinds.test.tsx`: `initialValueOf` for each kind (with and without `initialValue`, one-of's first enabled choice, an `initialValue` context function under a provider); `valueTypeOf` for each kind, `'mixed-boolean'` throws; `sanitizeStored` for each rule above.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): field definitions, value types, initial values`.

### Task 9: The argument layer

**Files:**
- Create: `packages/vultus-core/src/argStore.ts` (types, `memoryStore`), `packages/vultus-core/src/localStorageStore.ts`, `packages/vultus-core/src/ArgStoreContext.tsx`, `packages/vultus-core/src/useArg.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/useArg.test.tsx`, `src/__tests__/localStorageStore.test.ts`

**Interfaces:**
- Consumes: `ValueType` (Task 8), `resolveIn`, `useFieldContext` (Task 1).
- Produces:
  ```ts
  export type UpdateMethod = 'push' | 'replace';
  export interface RawChange { key: string; raw: string | undefined }
  export interface ArgStore { read(key: string): string | undefined; write(changes: RawChange[], method: UpdateMethod): void;
    subscribe(listener: () => void): () => void; hrefFor?(changes: RawChange[]): string }
  export function memoryStore(initial?: Record<string, string>): ArgStore & { snapshot(): Record<string, string> };
  export function localStorageStore(prefix: string): ArgStore;          // items under `${prefix}.${key}`
  export function ArgStoreProvider(props: { store: ArgStore; children?: ReactNode }): JSX.Element;
  export function useArgStore(): ArgStore;                              // throws 'No ArgStoreProvider is above this component'
  export interface ArgDefinition<T, Ctx = any> { key: string; valueType: ValueType<T>; default: ValueOrFn<T, Ctx> }
  export interface ArgControls<T> { value: T; isDefault: boolean; set(value: T, method?: UpdateMethod): void;
    reset(method?: UpdateMethod): void; hrefFor(value: T): string | undefined }
  export function useArg<T>(definition: ArgDefinition<T>): ArgControls<T>;
  export type ArgChange = { definition: ArgDefinition<any>; value?: unknown; reset?: true };
  export function setArg<T>(definition: ArgDefinition<T>, value: T): ArgChange;
  export function resetArg(definition: ArgDefinition<any>): ArgChange;
  export function useArgWriter(): (changes: ArgChange[], method?: UpdateMethod) => void;
  ```

**Rules:**
- `method` defaults to `'replace'`. A change's raw value is `undefined` for a reset or when `isEqual(value, default)`, else `format(value)`.
- Reading: `useSyncExternalStore(store.subscribe, () => store.read(key))`; absent gives the default; a raw value that does not parse gives the default with `` console.warn(`Argument '${key}': cannot read '${raw}', using the default`) ``, once per raw value.
- The default resolves through `resolveIn` with `where` `` `Argument '${key}': option 'default'` ``.
- `memoryStore.write` applies all changes, then notifies once. `localStorageStore` notifies its own subscribers on write, and on `window` `storage` events for keys under its prefix (another tab).

- [ ] **Step 1: Write the failing tests:**
  - `useArg.test.tsx` over `memoryStore()` in an `ArgStoreProvider`: absent key gives the default and `isDefault`; `set` writes the formatted raw; Review Focus 4: default `['a', 'b']` (`stringSetType`), `set(['b', 'a'])` leaves the key absent; `reset` removes the key; `isDefault` false after a non-default `set`; `useArgWriter()([setArg(a, 'x'), resetArg(b)], 'push')` calls `store.write` once with both changes and `'push'` (spy); Review Focus 5: two `set` calls on two arguments in one `act` leave both keys in `snapshot()`; raw `'abc'` for a `numberType` argument gives the default and warns once over two renders; no provider throws `/No ArgStoreProvider/`; `hrefFor` returns `undefined` with a store without `hrefFor`, and the store's result with one; a default as a context function under a `FieldContextProvider`.
  - `localStorageStore.test.ts` (jsdom): `write` then `read` under the prefix (`localStorage.getItem('p.x')`); removal on `raw: undefined`; a subscriber is notified on write and on `window.dispatchEvent(new StorageEvent('storage', { key: 'p.x' }))`, but not for `'other.x'`.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files and `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): arguments: stores, useArg, batched changes`.

### Task 10: Fields over arguments

**Files:**
- Create: `packages/vultus-core/src/useStoredField.ts`
- Modify: `src/index.ts`
- Test: `packages/vultus-core/src/__tests__/useStoredField.test.tsx`

**Interfaces:**
- Consumes: `FieldDefinition`, `initialValueOf`, `valueTypeOf`, `sanitizeStored` (Task 8); `useArg`, `useArgStore`, `ArgDefinition`, `UpdateMethod` (Task 9).
- Produces:
  ```ts
  export function argOf(definition: FieldDefinition, ctx: FieldCtx): ArgDefinition<any>;  // key: definition.id; valueType: valueTypeOf(kind); default: initialValueOf(definition, ctx)
  export interface StoredField<D extends FieldDefinition = FieldDefinition> {
    options: Omit<D, 'initialValue'> & { value: any; onChange(value: any): void };   // the outside form, for the kind's hook
    isDefault: boolean; reset(method?: UpdateMethod): void }
  export function useStoredField<D extends FieldDefinition>(definition: D): StoredField<D>;
  export interface StoredFields { isDefault(id: string): boolean; changedCount: number; resetAll(method?: UpdateMethod): void }
  export function useStoredFields(definitions: FieldDefinition[]): StoredFields;
  ```

**Rules:** `options.value` is `sanitizeStored(definition, arg.value, ctx)`; `onChange` writes with `'replace'`. `useStoredFields` subscribes once, with the joined raw values of all keys as its snapshot (a stable string); `resetAll` is one write removing every key.

- [ ] **Step 1: Write the failing tests** over a `memoryStore` (render the kind's hook with `stored.options`):
  - absent key: the definition's initial value; a change writes the store;
  - many-of with `initialValue: ['regional', 'final']`: unchecking both writes `rounds=''` and reads back `[]` (present but empty), while an absent key reads the default;
  - a stored one-of value not among the choices shows the initial value and warns;
  - `useStoredFields`: `changedCount` 2 after changing two of three fields; `isDefault('rounds')`; `resetAll()` calls `store.write` once and empties the store;
  - a `'mixed-boolean'` definition throws.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `useStoredField.test.tsx`, `tsc`. Expected: pass.
- [ ] **Step 5: Commit** `feat(vultus-core): fields stored as arguments`.

### Task 11: Exports, READMEs, tip verification

**Files:**
- Modify: `packages/vultus-core/src/index.ts` (everything above exported; check nothing is missing)
- Modify: `packages/vultus-core/README.md` (new sections after `## Fields`: `## Field context`, `## More kinds` (many-of, numeric, range, tree, text), `## Definitions as data` (`kind`, `FieldDefinition`, `initialValueOf`, `widget` hint), `## Arguments` (value types, stores, `useArg`, batches, `useStoredField(s)`); update `## Entry points`)
- Modify: `README.md` (repo root): a `## TODO` section with three entries of a few sentences each: vultus-window-history; the stellar-router port (location manager with path tokens and URL schemas, `permanent` arguments, interceptors with `try...`, links and `BoundLink`, NavRefs, redirects); the form layer (validation, layout as data, labels and actions in field lists).

- [ ] **Step 1: Build**: `cd packages/vultus-core && ./node_modules/.bin/tsc -p tsconfig.build.json && ls dist/index.js dist/FieldContext.js dist/useArg.js`; then `rm -rf dist`. Expected: builds, files present.
- [ ] **Step 2: Tip verification (once)**: `./node_modules/.bin/vitest run` in `packages/vultus-core`, then in `packages/vultus-antd`. Expected: all pass, `no-antd` included.
- [ ] **Step 3: Write the READMEs** (the core README in the style of its existing sections: what it is, the rules, one short example each).
- [ ] **Step 4: Commit** `docs(vultus): field kinds, definitions, arguments in the READMEs; TODOs`.

## Release (controller, after the whole-branch review)

1. In the worktree: `git fetch && git rebase origin/main` (expected: no-op), then the version commit `chore(vultus): vultus-core 0.5.0` (only `packages/vultus-core/package.json`) with a message summarizing the release, as `9d3ef91` does.
2. `git tag -a vultus-core@0.5.0 -m "vultus-core 0.5.0"`.
3. `cd packages/vultus-core && pnpm publish --access public` (prepack builds `dist/`; the branch is not `main`, so add `--no-git-checks`).
4. `git push origin HEAD:main vultus-core@0.5.0` (fast-forward), and push the branch for parts B and C.
5. Log it in `topics.log`; tell TeacherTeacher that vultus-core 0.5.0 is on npm, with the names module-api uses (`FieldDefinition`, `createFieldContext`, `initialValueOf`, `valueTypeOf`, `ArgStore`, `useStoredField(s)`).
