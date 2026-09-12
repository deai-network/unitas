# Publishing compiled npm packages (vultus, optio UI)

Status: approved by the owner on 2026-09-12. Covers unitas (`vultus-core`,
`vultus-antd`) and optio (`optio-ui`, `optio-conversation-ui`).

## Problem

All four packages publish raw TypeScript source: `main`, `types` and `exports`
point at `./src/*.ts(x)` and no JavaScript is shipped. Their `build` script is
`tsc`, but the tsconfig sets `noEmit`, so nothing is ever built.

A consumer therefore has to compile our `.tsx` files itself, with the automatic
JSX runtime. Vite apps using `@vitejs/plugin-react` (such as excavator's
frontend) do that without being told. Plain vitest, Node/SSR and most
non-Vite bundlers do not: they compile our JSX with the classic runtime and
fail with `ReferenceError: React is not defined`, or they refuse `.ts` in
`node_modules` altogether. This was found on 2026-09-12, when
optio-conversation-ui's own test suite resolved `vultus-antd` from the npm
registry and 18-20 Markdown tests failed that way.

## Decision

Publish compiled ESM JavaScript with declarations. Keep development on source.

- In the repository, `package.json` keeps `main`, `types` and `exports`
  pointing at `./src`, so workspace links, HMR and tests keep working with no
  build step.
- At publish time, `publishConfig` replaces `main`, `types` and `exports` with
  their `dist/` equivalents. `pnpm publish` (and `pnpm pack`) apply these
  overrides; this was verified with pnpm 11.1.1.

Rejected alternatives: pointing `exports` at `dist/` in the repository with a
custom `source` condition for development (every dev consumer would need
`resolve.conditions` or a `tsc --watch`), and bundling with tsup or Vite
library mode (new dependencies; its extras, such as CSS inlining and tree
shaking, are not needed).

## Changes in each package

1. **`tsconfig.build.json`** extends the package's `tsconfig.json`, sets
   `noEmit: false`, and excludes tests (`src/**/*.test.ts`,
   `src/**/*.test.tsx`, `src/**/__tests__`). It emits ES2022 ESM, `.d.ts`,
   declaration maps and source maps into `dist/`, keeping `jsx: react-jsx`.
   The source already imports relative files with a `.js` suffix, so the
   output is valid for Node ESM and for webpack's fully-specified resolution.
2. **Scripts:** in optio, whose `tsconfig.json` includes tests, `build`
   becomes `tsc && tsc -p tsconfig.build.json`: the first half is today's
   check, including tests; the second emits. In unitas, `tsconfig.json`
   already excludes tests, so `build` is `tsc -p tsconfig.build.json` alone.
   `prepack: pnpm run build` guarantees that every `pnpm pack` or
   `pnpm publish`, including a manual one, ships a fresh `dist/`.
3. **`publishConfig`** maps `main` to `dist/index.js`, `types` to
   `dist/index.d.ts`, and every `exports` subpath to
   `{ "types": "./dist/<name>.d.ts", "import": "./dist/<name>.js" }`.
   For example, vultus-antd's `./markdown` maps to `dist/Markdown.*` and
   vultus-core's `./link` to `dist/LinkContext.*`.
4. **`files`** lists `dist` and `src` (tests excluded, as today) plus the
   README. `src` stays so declaration maps and source maps resolve to real
   source ("go to definition" lands in TypeScript, not in `.d.ts`).
5. **unitas only:** the `repository` field points at `deai-network/unitas`
   (today it names the optio repository), and `publishConfig.access` is
   `public`.

Unchanged: the side-effect import `katex/dist/katex.min.css` in
optio-conversation-ui stays in the compiled output. Consumers still need a
bundler that handles CSS imports and serves the KaTeX fonts, as documented in
`AnswerBlock.tsx`.

## Versions and release order

| Package | From | To |
|---|---|---|
| vultus-core | 0.1.0 | 0.1.1 |
| vultus-antd | 0.1.0 | 0.1.1 |
| optio-ui | 0.4.0 | 0.4.1 |
| optio-conversation-ui | 0.4.0 | 0.4.1 |

Patch releases: no API change. optio-conversation-ui's dependency on
`vultus-antd` moves from `^0.1.0` to `^0.1.1`, so registry consumers get the
compiled package. Release in dependency order: vultus-core, vultus-antd, then
optio-ui and optio-conversation-ui through optio's release script
(`docs/release-cookbook.md`). Publishing is a separate step that needs the
owner's go.

## Documentation

- optio `docs/release-cookbook.md`: the "source-distributed template"
  paragraph for adding a TypeScript package describes this pattern instead.
- optio-conversation-ui `AnswerBlock.tsx`: the consumer-requirements comment
  says the package ships compiled JavaScript; the CSS and font requirements
  stay.
- optio-ui `AGENTS.md`: the entry line names the source entry for the
  workspace and the `dist/` entry for published consumers.

## Verification

Commands in the implementation plan; no permanent test harness.

- `pnpm pack` each package, then check that every `exports` target in the
  packed `package.json` exists in the tarball and that no test files ship.
- In plain Node, `import()` the packed dist entry of vultus-core, vultus-antd
  and optio-ui (optio-conversation-ui is excluded because of its CSS import).
- Reproduce the original failure against the packed vultus-antd: a vitest run
  with no JSX setting that renders its `Markdown` must pass.

## Sequencing

The unitas part is done in `excavator:~/deai/unitas`. The optio part goes on
its own branch after the Claude Code conversation-rendering branch lands,
since both touch optio-conversation-ui.
