# vultus: arguments in the URL path and fragment — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `<ReactRouterArgStore path={[...]} fragment={...}>` keeps arguments in the path and fragment too; a path write means going somewhere else, with permanence declared on the definitions.

**Architecture:** `permanent` on the definitions reaches the store through a new optional `ArgStore.declare`, called by the hooks. A pure token module in vultus-react-router reads, builds, encodes and validates the path below the store's route; the store applies it in `read`, `write`, `hrefFor` and `flush`, its in-flight logic unchanged.

**Tech Stack:** React 19, react-router 7.18 (peer >=7 <9), vitest + @testing-library/react (jsdom), pnpm 11.1.1 via corepack.

**Spec:** `docs/2026-10-30-vultus-path-args-design.md` (binding; read it first). The throwaway prototype on branch `spike/path-args` (`packages/vultus-react-router/src/spike/`) shows how much carries over; it maps route params, which this design does not, and its code is not to be copied wholesale.

## Global Constraints

- Branch `csillag/path-args` in `/home/csillag/chat/vultus/unitas`; one commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push; commit only your own paths, by name.
- pnpm only as `corepack pnpm@11.1.1 --dir /home/csillag/chat/vultus/unitas ...`.
- Run only the affected test files, one per command: `corepack pnpm@11.1.1 --dir /home/csillag/chat/vultus/unitas --filter <package> exec vitest run src/__tests__/<File>`; and `--filter <package> typecheck`.
- The shell rules of `/home/csillag/chat/vultus/2026-10-29-pending-focus-brief-common.md` ("Shell rules" section) apply.
- With neither `path` nor `fragment`, the store behaves exactly as today: its existing test files pass unchanged.
- vultus-core stays free of react-router and antd.
- SSOT: never add a prop or list that restates what a definition says.

## Review Focus

1. A write naming a later token together with an earlier one, in either order, keeps the later one: "open this task with these filters".
2. `..` under a browser router never reaches the router; the value stays and a warning names the key.
3. A value at the default leaves a vanishing token's segment out, and the next token then reads the right segment; a task named like a variant is refused.
4. An undeclared query key survives going somewhere else; a declared non-permanent one goes; a wrapper store that does not forward `declare` keeps today's behaviour.
5. Accented segments round-trip under a browser router, whose `pathnameBase` and `pathname` are encoded differently from a memory router's.

---

### Task 1: permanence on the definitions, `declare` on the store (vultus-core)

**Files:** `packages/vultus-core/src/argStore.ts` (`ArgStore.declare?`), `useArg.ts` (`ArgDefinition.permanent`; declare in `useArg`; its comment "without a `permanent` flag" goes), `useStoredField.ts` (`FieldDefinition.permanent` reaching the arg; declare in `useStoredFields`), `useFieldGroup.ts` (declare in `useStoredValues`), the definition's type wherever `FieldDefinition` lives; `packages/vultus-antd/src/Field.tsx` (`DEFINITION_KEYS` gains `permanent`: a compile-time check enforces it). Tests in the existing test files.

**Interfaces:** `declare?(key: string, facts: { permanent: boolean }): void` on `ArgStore`.

- [ ] Step 1: failing tests: `useArg` declares its definition's key and permanence to a store with `declare` (false by default), and works with one without; `useStoredField`, `useStoredFields` and `useFieldGroup(defs, { stored: true })` declare every definition, hidden ones too; declaring does not notify subscribers.
- [ ] Step 2: implement; declare in render, idempotent.
- [ ] Step 3: run the test files and the typechecks of vultus-core and vultus-antd.
- [ ] Step 4: commit `feat(vultus-core): arguments declare their permanence to the store`.

### Task 2: the path tokens (vultus-react-router, pure)

**Files:** create `packages/vultus-react-router/src/pathTokens.ts` and `src/__tests__/pathTokens.test.ts`; export `token`, `vanishing`, `rest` from `src/index.ts`.

**Interfaces (produces):** `token(def, opts?)`, `vanishing(def, opts?)`, `rest(def, opts?)` returning a `PathToken` (`key`, `kind`, `independent`, the allowed values or how to resolve them); `readPath(tokens, segments)` → key to raw value; `buildPath(tokens, values)` → segments or a refusal naming the key and the reason; `encodeSegment`, `decodeSegment`; `goingElsewhere(tokens, current, changes)` → the implied removals of later tokens.

- [ ] Step 1: failing tests for the spec's Reading, Encoding and "Writes that cannot be represented": each refusal; `s19~modern`, `resz.1-kep`, `a@b_c`, a space, `50%`, `a/b` in a rest, `/` in a token as `%2F`, a literal `%2F` round-trip, accents; vanishing recognised by membership, the next token reading the same segment; a rest only last (throws otherwise); an allowed value from a one-of field's `choices`, and `{ allowedValues }` for a bare arg.
- [ ] Step 2: implement.
- [ ] Step 3: run the test file and the typecheck.
- [ ] Step 4: commit `feat(vultus-react-router): path tokens: read, build, encode, refuse`.

### Task 3: the store

**Files:** `packages/vultus-react-router/src/ReactRouterArgStore.tsx`; `src/__tests__/ReactRouterArgStorePath.test.tsx` (new). `query.ts` only if needed.

- [ ] Step 1: failing tests:
  - `path` read and written with one navigation across path, query, fragment; `hrefFor` equal to the address; a push if any asked;
  - going somewhere else: later tokens and declared non-permanent keys go, permanent and undeclared stay, keys named in the same write stay in either order, `independent` cuts nothing, a same-value write cuts nothing, and read-your-writes shows the removals at once;
  - refusals: no navigation, the value kept, a warning;
  - the store's route context: the part below the route's base; throws when the route's pattern does not end in `*`; a plain `<BrowserRouter>` + `<Routes>` works;
  - browser router: accents, a space and `@` round-trip, `..` refused; a basename;
  - the page stays mounted across token writes;
  - the in-flight guarantees with the pathname changing: read-your-writes while loading, a batch on the store's own loading navigation, a batch waiting for an outside navigation (and dropping path changes that no longer fit, the rest landing), blocked, redirected, overtaken (the spike's `Q3` cases are the model).
- [ ] Step 2: implement: props `path`, `fragment`; the base from `UNSAFE_RouteContext`; `declare`; the rest of the store's logic stays.
- [ ] Step 3: run the new file and the existing `ReactRouterArgStore.test.tsx`, `query.test.ts`, `StoredGroup.test.tsx`, `StoredOverRouter.test.tsx`, unchanged; the typecheck.
- [ ] Step 4: commit `feat(vultus-react-router): arguments in the path and the fragment`.

### Task 4: docs and the gallery

**Files:** `packages/vultus-react-router/README.md` (the API, the rules, Placement, Scroll; the README TODO on the stellar-router port updated), `packages/vultus-core/README.md` (`permanent`, `declare`), a gallery story `packages/vultus-gallery/src/definitions/PathArgs.stories.tsx` (a memory router, the URL shown live, a vanishing variant, a rest task, a fragment, permanent and non-permanent filters).

- [ ] Step 1: write them.
- [ ] Step 2: the typechecks of the three packages.
- [ ] Step 3: commit `docs(vultus): arguments in the path and the fragment`.
- [ ] Step 4 (controller): the story in Chromium: writes, the URL, refusals, the page staying mounted.
