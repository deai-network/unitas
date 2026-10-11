# Spinner slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An app lends its loading spinner to vultus and optio through `VultusComponents.Spinner` (keyed, scoped), and vultus-antd, optio-ui and optio-conversation-ui render it at their loading sites, falling back to today's antd output without a provider.

**Architecture:** vultus-core holds the contract (types, a context, `SpinnerScope`, `useSpinnerKey`), antd-free. vultus-antd's `VultusProvider` sets the context; every site asks `useVultusComponents().Spinner` and `useSpinnerKey(localKey)` and renders the provided component or its unchanged antd code. optio-ui depends on vultus-core as a peer; optio-conversation-ui reaches it through vultus-antd; each optio agent view scopes its conversation by process id.

**Tech Stack:** React 18+/19, antd 6, TypeScript, vitest 3 + jsdom + Testing Library, pnpm workspaces (optio links the unitas packages).

**Spec:** `docs/2026-10-11-spinner-slot-design.md` (this repo); optio summary in optio `docs/2026-10-11-spinner-slot-design.md`. Site numbers below are the spec's.

## Global Constraints

- Work only in the clones on superego: unitas `~/chat/slot/unitas`, optio `~/chat/slot/optio`, both on branch `csillag/spinner-slot`. optio's workspace links `../unitas/packages/vultus-{core,antd}` to that unitas clone. Never write to the excavator host (its `~/deai/unitas` and `~/deai/optio` are linked into a running dev stack).
- Run tests with each package's `./node_modules/.bin/vitest run` (and `./node_modules/.bin/tsc --noEmit` where the package has a typecheck). Baseline: vultus-core 62, vultus-antd 183, optio-ui 215, optio-conversation-ui 718 + 1 skipped. Workspace deps are already built (`pnpm --filter "optio-conversation-ui^..." build`); re-run that if a dependency's dist is needed again.
- Do not change existing test assertions: they pin the no-provider behaviour, which must stay exactly as today. Add new tests for the provided path.
- Hooks are called unconditionally at every site (rules of hooks): `useVultusComponents()` and `useSpinnerKey(...)` run whether or not a Spinner is provided.
- vultus-core never imports antd (`src/no-antd.test.ts`).
- Local keys: `vultus:action:<id>`, `vultus:field:<id>`, `optio:...` exactly as in the spec's site tables. Scope separator `/`. Sizes `'small'` unless the spec says otherwise.
- Commits: unitas `feat(vultus): …` / `feat(vultus-antd): …` / `docs(vultus): …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. optio `feat(optio-ui): …` / `feat(optio-conversation-ui): …` / `build(optio-dashboard): …` **without** any Co-Authored-By or self-credit line (optio AGENTS.md). Local commits only; never push.
- optio AGENTS.md: tests must not depend on wall-clock time.

## Review Focus

1. A nested `VultusProvider` without `components` must not hide the outer Spinner; one with `components` overrides only the slots it names. Test in Task 2.
2. Keys of vultus-antd controls inside an optio agent view carry the view's scope (`optio:process:<id>/vultus:action:send`). Test in Task 5.
3. Hook order stays stable when a provider appears or disappears between renders (rerender with and without a provider at a site). Test in Tasks 2 and 4.
4. One vultus-core copy in optio-dashboard's dev alias setup (`OPTIO_DEV_VULTUS`): alias and dedupe include vultus-core. Checked in Task 4 by reading the resolved config, not by a test.
5. BoolSwitch with a provider: no antd loading spinner inside the switch, the provided Spinner after it, and the switch still disabled while pending. Test in Task 3.

---

### Task 1: vultus-core contract

**Files:**
- Create: `unitas/packages/vultus-core/src/Components.tsx`
- Modify: `unitas/packages/vultus-core/src/index.ts` (exports), `unitas/packages/vultus-core/README.md` (a short "Components" section)
- Test: `unitas/packages/vultus-core/src/__tests__/Components.test.tsx`

**Interfaces:**
- Produces: `SpinnerProps`, `SpinnerComponent`, `VultusComponents`, `VultusComponentsContext` (default `{}`), `useVultusComponents(): VultusComponents`, `SpinnerScope(props: { name: string; children?: ReactNode })`, `useSpinnerKey(localKey: string): string` — exactly as in the spec's API block. Scopes nest by joining names with `/`, outermost first.

- [ ] **Step 1: Failing tests**

```tsx
it('defaults to no components', () => { /* probe: useVultusComponents() deep-equals {} */ });
it('scopes keys: none, one, nested', () => {
  // probe renders useSpinnerKey('vultus:action:send')
  // no scope -> 'vultus:action:send'
  // <SpinnerScope name="optio:process:p1"> -> 'optio:process:p1/vultus:action:send'
  // nested "a" > "b" -> 'a/b/vultus:action:send'
});
it('provides components through the context', () => { /* Provider value {Spinner: S}; probe sees S */ });
```

Run: `cd ~/chat/slot/unitas/packages/vultus-core && ./node_modules/.bin/vitest run src/__tests__/Components.test.tsx` — FAIL (module missing).

- [ ] **Step 2: Implement `Components.tsx` and the index exports.**
- [ ] **Step 3:** focused test PASS; full suite (`./node_modules/.bin/vitest run`) PASS incl. no-antd; `./node_modules/.bin/tsc --noEmit` clean.
- [ ] **Step 4: Commit** `feat(vultus): VultusComponents.Spinner slot with key scopes`.

### Task 2: VultusProvider `components`

**Files:**
- Modify: `unitas/packages/vultus-antd/src/VultusProvider.tsx`, `unitas/packages/vultus-antd/README.md` (the prop, an example with an app spinner, scopes)
- Test: `unitas/packages/vultus-antd/src/__tests__/VultusProvider.test.tsx` (add cases)

**Interfaces:**
- Consumes: Task 1's exports (re-exported by vultus-antd's `export * from 'vultus-core'`).
- Produces: `VultusProvider` prop `components?: VultusComponents`; when given it provides `{ ...outer, ...components }` (outer = `useVultusComponents()`), when not given it provides nothing new.

- [ ] **Step 1: Failing tests:** a probe under `<VultusProvider components={{ Spinner: A }}>` sees A; nested `<VultusProvider>` without components still sees A; nested `<VultusProvider components={{ Spinner: B }}>` sees B; no provider at all: `{}`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3:** vultus-antd full suite PASS, tsc clean.
- [ ] **Step 4: Commit** `feat(vultus-antd): VultusProvider components`.

### Task 3: vultus-antd sites 1-6

**Files:**
- Modify: `ActionButton.tsx`, `CombinedActionButton.tsx`, `FormSubmitButton.tsx`, `BoolCheckbox.tsx`, `BoolSwitch.tsx`, `OneOfSelect.tsx` (all in `unitas/packages/vultus-antd/src/`)
- Test: `unitas/packages/vultus-antd/src/__tests__/spinnerSlot.test.tsx` (new)

**Interfaces:**
- Consumes: `useVultusComponents`, `useSpinnerKey` (Task 1), `VultusProvider components` (Task 2).

A recording test spinner: `const calls: SpinnerProps[] = []; const RecSpinner = (p: SpinnerProps) => { calls.push(p); return <span data-testid="rec-spinner" data-key={p.spinnerKey} />; };`

- [ ] **Step 1: Failing tests** (each wrapped in `<VultusProvider components={{ Spinner: RecSpinner }}>`, pending state):
  - ActionButton pending: the button contains `rec-spinner` with `data-key="vultus:action:<id>"`, size `'small'`; antd's default loading icon absent; the icon-end slot behaviour the existing tests pin still holds.
  - CombinedActionButton (main half pending) and FormSubmitButton: same, with their action ids.
  - BoolCheckbox pending: `rec-spinner` (key `vultus:field:<id>`) where the antd Spin was, no `.ant-spin`.
  - BoolSwitch pending: the switch has no `.ant-switch-loading`, is disabled, and `rec-spinner` (key `vultus:field:<id>`) follows it.
  - OneOfSelect pending: the Select's loading icon is `rec-spinner` (key `vultus:field:<id>`).
  - Inside `<SpinnerScope name="s1">`: keys are prefixed `s1/…`.
  - Rerender the same tree first without, then with the provider: no hook-order error, the spinner appears.
- [ ] **Step 2: Implement** per the spec's vultus-antd table (provided path only; the no-provider code path is unchanged).
- [ ] **Step 3:** vultus-antd full suite PASS (existing tests untouched), tsc clean.
- [ ] **Step 4: Commit** `feat(vultus-antd): render the provided Spinner at loading sites`.

### Task 4: optio-ui

**Files:**
- Modify: `optio/packages/optio-ui/package.json` (peer `vultus-core` `>=0.3.0` and devDependency `vultus-core` `^0.3.0`: ranges the current linked 0.3.0 satisfies; the release step raises them to the version that ships the slot, see the ruling under Task 5), `optio/pnpm-lock.yaml`, `optio/packages/optio-ui/AGENTS.md` and `README.md` (version, deps, peers incl. the missing antd/@ant-design/icons), `optio/packages/optio-dashboard/vite.config.ts` (`OPTIO_DEV_VULTUS`: alias and dedupe vultus-core too), sites 7-10: `components/ProcessList.tsx`, `components/LaunchControls.tsx`, `components/ProcessDetailView.tsx`, `widgets/IframeWidget.tsx`
- Test: `optio/packages/optio-ui/src/__tests__/spinnerSlot.test.tsx` (new)

**Interfaces:**
- Consumes: `vultus-core` exports (Task 1) via the workspace link.

- [ ] **Step 1: Wire the dependency** (package.json, lockfile via `pnpm install` in the optio clone; nothing outside it), and confirm `optio-ui/node_modules/vultus-core` resolves to `~/chat/slot/unitas/packages/vultus-core`.
- [ ] **Step 2: Failing tests** (provider: `<VultusComponentsContext.Provider value={{ Spinner: RecSpinner }}>`): ProcessList loading shows `rec-spinner` key `optio:process-list` size `'default'`; LaunchControls resurrecting shows `rec-spinner` key `optio:process:<id>:resurrecting` in place of `LoadingOutlined`; ProcessDetailView and IframeWidget loading show `rec-spinner` before "Loading…" (keys `optio:process:<id>:detail` / `:widget`), test ids unchanged; a SpinnerScope prefixes them; rerender without/with provider is safe.
- [ ] **Step 3: Implement** sites 7-10 per the spec; update AGENTS.md/README; dashboard vite.config alias + dedupe (read the resulting config once to confirm vultus-core is in both lists).
- [ ] **Step 4:** optio-ui full suite PASS (existing untouched), `tsc --noEmit` (or the package's build) clean; optio-dashboard typecheck if it has one.
- [ ] **Step 5: Commits** `feat(optio-ui): render an app-provided Spinner (vultus-core slot)` and `build(optio-dashboard): dev alias and dedupe for vultus-core` (no self-credit lines).

### Task 5: optio-conversation-ui

**Files:**
- Modify: `optio/packages/optio-conversation-ui/README.md` (vultus-antd range; the spinner slot and its precedence over native spinners), `src/ConversationView.tsx` (sites 11-14), `src/opencode/OpencodeView.tsx` (site 15), the seven agent views (`claudecode/ClaudeCodeView.tsx`, `opencode/OpencodeView.tsx`, `grok/GrokView.tsx`, `codex/CodexView.tsx`, `cursor/CursorView.tsx`, `kimicode/KimiCodeView.tsx`, `antigravity/AntigravityView.tsx`: wrap `ConversationView` in `SpinnerScope name={\`optio:process:${process._id}\`}`)
- Test: `optio/packages/optio-conversation-ui/src/__tests__/spinnerSlot.test.tsx` (new)

**Interfaces:**
- Consumes: `useVultusComponents`, `useSpinnerKey`, `SpinnerScope` (re-exported by vultus-antd from vultus-core; import from `vultus-antd`), `VultusProvider components`.

Ruling for Tasks 4 and 5: package versions stay as they are (vultus-core 0.3.0, vultus-antd 0.5.0) until the owner-approved releases; dependency ranges written now must be satisfied by those linked versions (pnpm links a workspace package only when its version satisfies the range). So optio-conversation-ui keeps `vultus-antd >=0.5.0` here, and the release step raises the ranges (optio-ui peer `vultus-core >=0.4.0`, conversation-ui peer `vultus-antd >=0.6.0`). Record the needed raises in the READMEs' notes and in the task reports.

- [ ] **Step 1: Failing tests** (provider: `<VultusProvider components={{ Spinner: RecSpinner }}>`): background-running item → key `optio:background:<taskId|callId|seq>`; running tool row → `optio:tool:<callId|seq>`; busy conversation → working indicator renders `rec-spinner` key `optio:working` even when `nativeSpinner` is given; in-progress todo → `optio:todo:<id>`; OpencodeView without session id → `rec-spinner` before "Loading…" (key `optio:process:<id>:widget`); an agent view (e.g. ClaudeCodeView) with a pending send/interrupt → the vultus button's spinner key is `optio:process:<id>/vultus:action:<id>`; without a provider all of these render exactly as today (existing tests).
- [ ] **Step 2: Implement** per the spec.
- [ ] **Step 3:** optio-conversation-ui full suite PASS (existing untouched); tsc/build clean.
- [ ] **Step 4: Commit** `feat(optio-conversation-ui): app-provided Spinner and per-process key scopes` (no self-credit lines).

### Task 6: vultus-gallery story

**Files:**
- Create: `unitas/packages/vultus-gallery/src/providers/SpinnerSlot.stories.tsx` (and a tiny `DemoSpinner` there: a CSS ring with `title={spinnerKey}`)

The gallery needs its own install, which must not disturb the optio-linked packages: make a git worktree of the unitas clone at `/tmp/unitas-gallery` (branch checked out detached at HEAD), `pnpm install` there, and verify there; copy nothing back except the committed story (commit it in the unitas clone).

- [ ] **Step 1:** write the story: "Providers/Spinner slot": ActionButton (slow fire), BoolCheckbox and BoolSwitch (slow commit), OneOfSelect, inside `<VultusProvider components={{ Spinner: DemoSpinner }}>`, plus the same in a nested `SpinnerScope name="demo-scope"` showing prefixed keys.
- [ ] **Step 2:** in `/tmp/unitas-gallery`: gallery typecheck clean; run Storybook there on a free port and screenshot the story (headless Chromium at /usr/bin/chromium with playwright-core from /home/csillag/chat/antd-x-shots/node_modules/playwright-core) while actions are pending; look at it.
- [ ] **Step 3: Commit** in the unitas clone `docs(vultus): gallery story for the spinner slot`; remove `/tmp/unitas-gallery` (`git worktree remove`).

## After the plan (not part of it)

Releases, each with the owner's go, in order: vultus-core 0.4.0, vultus-antd 0.6.0 (dependency on vultus-core ^0.4.0), optio-ui minor (peer vultus-core >=0.4.0), optio-conversation-ui minor (peer vultus-antd >=0.6.0). Then the branches are merged and pushed, and excavator adopts it.
