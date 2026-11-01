# vultus: text changes, moved from harma-style — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** harma-style's text-changes logic lives in `vultus-core/changes`, unchanged in behaviour, drawing its marks through a lendable `ChangeMark` slot with a static fallback.

**Spec:** `docs/2026-11-01-vultus-text-changes-design.md` (binding). Source: harma-style main 8e27a57 at `/home/csillag/chat/swarm/harma-style/packages/harma-style-antd/src/` (`changes.ts`, `textChanges/`, `__tests__/`); survey `/home/csillag/chat/vultus/2026-11-01-text-changes-survey.md`.

## Global Constraints

- Branch `csillag/text-changes` in `/home/csillag/chat/vultus/unitas`; one commit per task; messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never push; commit only your own paths by name.
- pnpm only as `corepack pnpm@11.1.1 --dir /home/csillag/chat/vultus/unitas ...`; one test file per command; never touch `/home/csillag/chat/swarm/harma-style` (read only).
- The shell rules of `/home/csillag/chat/vultus/2026-10-29-pending-focus-brief-common.md` ("Shell rules") apply.
- vultus-core stays antd-free and free of harma-style; its main entry must not load `diff-match-patch`.
- No redesign: behaviour, constants, option names and the public API stay as harma-style has them; only the names in the spec's "Names" change.

## Review Focus

1. A switch with no lent mark still ends: marks go after the default timings.
2. A lent mark receives exactly the props harma-style's `Highlight` receives today, keyed by the switch number.
3. `durations` comes from the lent mark when it has one; a lent mark without `durations` uses the defaults.
4. Importing `vultus-core` (main entry) does not load `diff-match-patch`.
5. React 18 and 19: `inert` on removed letters.

---

### Task 1: the logic in `vultus-core/changes`

**Files:** `packages/vultus-core/src/changes/` (the moved files), `src/changes.ts` (the subpath entry), `package.json` (`exports` `./changes` in dev and publishConfig; `diff-match-patch` dependency; `@types/hast` in dependencies as harma-style has it; `@types/diff-match-patch` dev), the moved tests and helpers under `src/__tests__/`, `src/Components.tsx` (the `ChangeMark` slot and its types).

- [ ] Step 1: move the files, keeping history-free copies faithful; replace the `Highlight` call with the lent `ChangeMark` from `useVultusComponents()`, falling back to an internal default mark (spec, "The fallback"); `changeDurations` becomes the default timings plus the lent mark's `durations`; rename the DOM names (spec, "Names").
- [ ] Step 2: move the tests; where they assert `Highlight`'s output, lend a test mark and assert its props; add tests for the fallback and for `durations` from a lent mark.
- [ ] Step 3: run every moved test file and the vultus-core typecheck; the packaging test proves the main entry stays light.
- [ ] Step 4: commit `feat(vultus-core): text changes, moved from harma-style`.

### Task 2: the slot in `VultusProvider`, docs, gallery

**Files:** `packages/vultus-antd/src/VultusProvider.tsx` (merge the slot as `Spinner`), its test; `packages/vultus-core/README.md` (a "Text changes" section: API, the lent mark, the fallback, Praeceptor-shaped example); `packages/vultus-antd/README.md` (the slot); a gallery story `packages/vultus-gallery/src/fields/TextChanges.stories.tsx` or similar (a text switching between two versions: the fallback, and a lent demo mark with a simple CSS of its own).

- [ ] Step 1: failing test for the merge (a nested provider overriding or clearing `ChangeMark`, identity kept as `Spinner`'s); implement.
- [ ] Step 2: docs and the story.
- [ ] Step 3: run the provider test, the typechecks of vultus-core, vultus-antd and vultus-gallery.
- [ ] Step 4: commit `feat(vultus-antd): VultusProvider lends ChangeMark; docs and gallery`.
