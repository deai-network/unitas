# Compiled npm packages for vultus: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `vultus-core` and `vultus-antd` publish compiled ESM JavaScript with declarations, so a consumer without a JSX-aware bundler can use them, per `docs/2026-09-12-npm-packaging-design.md`. This plan covers the unitas half of that spec; the optio half (`optio-ui`, `optio-conversation-ui`) gets its own plan.

**Architecture:** In the repository, `package.json` keeps `exports` pointing at `./src`, so workspace links and HMR don't change. A `tsconfig.build.json` emits `dist/`, `prepack` builds it, and `publishConfig` swaps `main`, `types` and `exports` to `dist/` in the packed and published manifest. Verification is by packing: a manifest check, and a plain consumer project that reproduces today's failure and shows it gone.

**Tech Stack:** TypeScript 5 (`tsc`), pnpm 11.1.1 (`pnpm pack`, `publishConfig`), vitest 3 + jsdom, Node 24.

## Global Constraints

- Work in `excavator:~/deai/unitas` on branch `compiled-npm-packages`. Do not push and do not publish: publishing needs the owner's go.
- Do not run `pnpm install` in `~/deai/unitas`. Each package's `node_modules` comes from optio's workspace install (`excavator:~/deai/optio` lists these packages), and optio-conversation-ui and excavator's dev frontend resolve through them. A unitas install would relink them.
- Versions: `vultus-core` 0.1.0 -> 0.1.1, `vultus-antd` 0.1.0 -> 0.1.1.
- In the repository, `exports` keeps pointing at `./src`. Only `publishConfig` names `dist/`: `main` -> `./dist/index.js`, `types` -> `./dist/index.d.ts`, and each `exports` subpath -> `{ "types": "./dist/<name>.d.ts", "import": "./dist/<name>.js" }`.
- `files` = `dist`, `src` without tests, `README.md`.
- `repository.url` = `git+https://github.com/deai-network/unitas.git`; `publishConfig.access` = `public`.
- `build` = `tsc -p tsconfig.build.json` (unitas's `tsconfig.json` already excludes tests); `prepack` = `pnpm run build`.
- Pack into `/tmp/vultus-pack` (`--pack-destination`), never into the package directory: `*.tgz` is not gitignored.
- The host has 3.8 GB RAM and other agents run test suites on it. vultus-antd's tests time out under load with vitest's 5 s default, so run them with `--maxWorkers=2 --testTimeout=30000`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/vultus-core/tsconfig.build.json` (new) | emit `dist/` from `tsconfig.json` | 1 |
| `packages/vultus-core/package.json` | version, repository, files, scripts, publishConfig | 1 |
| `packages/vultus-antd/tsconfig.build.json` (new) | emit `dist/` from `tsconfig.json` | 2 |
| `packages/vultus-antd/package.json` | version, repository, files, scripts, publishConfig | 2 |

## Commands used throughout

Run everything on excavator (`ssh excavator`). Define this shell function in the shell you run the checks from. It packs a package into `/tmp/vultus-pack` and checks the packed manifest: every `main`/`types`/`exports` target must exist in the tarball and live under `dist/`, and no test file may ship.

```bash
packcheck() {
  mkdir -p /tmp/vultus-pack && rm -f /tmp/vultus-pack/$1-*.tgz
  (cd ~/deai/unitas/packages/$1 && pnpm pack --pack-destination /tmp/vultus-pack >/dev/null) || return 1
  PKG=$1 node --input-type=module <<'JS'
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const name = process.env.PKG;
const tgz = '/tmp/vultus-pack/' + readdirSync('/tmp/vultus-pack').find((f) => f.startsWith(name + '-') && f.endsWith('.tgz'));
const files = execSync(`tar -tzf ${tgz}`).toString().split('\n').filter(Boolean).map((f) => f.replace(/^package\//, ''));
const pkg = JSON.parse(execSync(`tar -xOzf ${tgz} package/package.json`).toString());
const targets = [pkg.main, pkg.types, ...Object.values(pkg.exports ?? {}).flatMap((e) => (typeof e === 'string' ? [e] : Object.values(e)))]
  .filter(Boolean).map((t) => t.replace(/^\.\//, ''));
const missing = targets.filter((t) => !files.includes(t));
const notDist = targets.filter((t) => !t.startsWith('dist/'));
const tests = files.filter((f) => /__tests__|\.test\./.test(f));
console.log(JSON.stringify({ tgz, version: pkg.version, dependencies: pkg.dependencies ?? {}, targets, missing, notDist, tests }));
if (missing.length || notDist.length || tests.length) { console.log('PACK CHECK FAILED'); process.exit(1); }
console.log('PACK CHECK OK');
JS
}
```

---

### Task 1: vultus-core publishes compiled output

**Files:**
- Create: `packages/vultus-core/tsconfig.build.json`
- Modify: `packages/vultus-core/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `packcheck vultus-core` leaves `/tmp/vultus-pack/vultus-core-0.1.1.tgz`, whose manifest points at `dist/`. Task 2's consumer project installs it.

- [ ] **Step 1: Create the branch**

```bash
cd ~/deai/unitas && git switch -c compiled-npm-packages
```

- [ ] **Step 2: Run the pack check to see it fail**

Run: `packcheck vultus-core`
Expected: `PACK CHECK FAILED`, with `"version":"0.1.0"` and `notDist` listing `src/index.ts` and `src/LinkContext.tsx`.

- [ ] **Step 3: Create `packages/vultus-core/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false }
}
```

(`tsconfig.json` already sets `outDir: dist`, `rootDir: src` and `jsx: react-jsx`, and excludes tests; the base config turns on declarations, declaration maps and source maps.)

- [ ] **Step 4: Replace `packages/vultus-core/package.json`**

```json
{
  "name": "vultus-core",
  "version": "0.1.1",
  "license": "Apache-2.0",
  "description": "Framework-neutral action model + hooks for vultus (antd-free by design)",
  "repository": { "type": "git", "url": "git+https://github.com/deai-network/unitas.git", "directory": "packages/vultus-core" },
  "author": "Kristof Csillag <kristof.csillag@deai-labs.com>",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./link": "./src/LinkContext.tsx"
  },
  "files": ["dist", "src", "!src/**/__tests__", "!src/**/*.test.ts", "!src/**/*.test.tsx", "README.md"],
  "publishConfig": {
    "access": "public",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
      "./link": { "types": "./dist/LinkContext.d.ts", "import": "./dist/LinkContext.js" }
    }
  },
  "scripts": { "build": "tsc -p tsconfig.build.json", "prepack": "pnpm run build", "test": "vitest run" },
  "peerDependencies": { "react": ">=18", "react-i18next": ">=15" },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "i18next": "^25.0.0",
    "jsdom": "^29.0.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-i18next": "^17.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.2.4"
  }
}
```

Only `version`, `repository.url`, `files` (adds `dist`), `publishConfig` (new) and `scripts` (`build`, new `prepack`) change. Check with `git diff packages/vultus-core/package.json` that nothing else moved.

- [ ] **Step 5: Run the pack check to see it pass**

Run: `packcheck vultus-core`
Expected: `PACK CHECK OK`, `"version":"0.1.1"`, `targets` = `dist/index.js`, `dist/index.d.ts`, `dist/LinkContext.d.ts`, `dist/LinkContext.js` (in manifest order), `missing`, `notDist` and `tests` empty.

- [ ] **Step 6: Check the compiled output**

```bash
cd ~/deai/unitas/packages/vultus-core
grep -l "react/jsx-runtime" dist/*.js
grep -c "React.createElement" dist/*.js | grep -v ':0$' || echo "no classic JSX"
node --input-type=module -e "const m = await import('./dist/index.js'); const l = await import('./dist/LinkContext.js'); console.log(typeof m.useAction, typeof l.useInternalLink)"
```

Expected: the first command lists `dist/LinkContext.js` (the only source file with JSX; `MessageSink.tsx` only calls `createContext`); the second prints `no classic JSX`; the third prints `function function` (plain Node, no JSX transform).

- [ ] **Step 7: Run the package's tests**

Run: `cd ~/deai/unitas/packages/vultus-core && node_modules/.bin/vitest run`
Expected: `Tests  31 passed (31)`, as before the change.

- [ ] **Step 8: Commit**

```bash
cd ~/deai/unitas
git add packages/vultus-core/package.json packages/vultus-core/tsconfig.build.json
git commit -m "build(vultus-core): publish compiled ESM and declarations (0.1.1)

The package shipped raw .ts/.tsx, so consumers without a JSX-aware bundler
failed to load it. prepack now emits dist/ (tsconfig.build.json) and
publishConfig points main/types/exports at it in the published manifest; the
repository keeps exporting ./src for workspace links. Also fix the
repository URL (it named the optio repo).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: vultus-antd publishes compiled output, proven by a plain consumer

**Files:**
- Create: `packages/vultus-antd/tsconfig.build.json`
- Modify: `packages/vultus-antd/package.json`
- Scratch (not committed): `/tmp/vultus-consumer/`

**Interfaces:**
- Consumes (Task 1): `/tmp/vultus-pack/vultus-core-0.1.1.tgz` via `packcheck vultus-core`.
- Produces: `/tmp/vultus-pack/vultus-antd-0.1.1.tgz`, whose `vultus-core` dependency is `0.1.1`.

- [ ] **Step 1: Build a plain consumer against the registry packages and see it fail**

```bash
rm -rf /tmp/vultus-consumer && mkdir /tmp/vultus-consumer && cd /tmp/vultus-consumer
printf '{ "name": "vultus-consumer", "private": true, "type": "module" }\n' > package.json
printf 'packages: []\n' > pnpm-workspace.yaml
cat > vitest.config.mjs <<'C'
// Deliberately no JSX setting: a plain consumer.
export default { test: { environment: 'jsdom' } };
C
cat > markdown.test.js <<'T'
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { Markdown } from 'vultus-antd/markdown';
import { useAction } from 'vultus-antd';

test('the published vultus-antd renders Markdown in a plain consumer', () => {
  render(createElement(Markdown, null, 'Hello **world**'));
  expect(screen.getByText('world').tagName).toBe('STRONG');
  expect(typeof useAction).toBe('function');
});
T
pnpm add -w react@^19 react-dom@^19 antd@^5 i18next@^25 react-i18next@^17 vitest@^3 jsdom@^29 @testing-library/react@^16 vultus-core@0.1.0 vultus-antd@0.1.0
pnpm exec vitest run
```

Expected: the test FAILS with `ReferenceError: React is not defined` (the registry 0.1.0 ships `.tsx`, compiled here with classic JSX). A "pnpm approve-builds" notice from `pnpm add` is harmless.

- [ ] **Step 2: Run the pack check to see it fail**

Run: `packcheck vultus-antd`
Expected: `PACK CHECK FAILED`, `"version":"0.1.0"`, `notDist` listing `src/index.ts` and `src/Markdown.tsx`.

- [ ] **Step 3: Create `packages/vultus-antd/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false }
}
```

- [ ] **Step 4: Replace `packages/vultus-antd/package.json`**

```json
{
  "name": "vultus-antd",
  "version": "0.1.1",
  "license": "Apache-2.0",
  "description": "Ant Design action-button + markdown components for vultus (depends on and re-exports vultus-core)",
  "repository": { "type": "git", "url": "git+https://github.com/deai-network/unitas.git", "directory": "packages/vultus-antd" },
  "author": "Kristof Csillag <kristof.csillag@deai-labs.com>",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./markdown": "./src/Markdown.tsx"
  },
  "files": ["dist", "src", "!src/**/__tests__", "!src/**/*.test.ts", "!src/**/*.test.tsx", "README.md"],
  "publishConfig": {
    "access": "public",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
      "./markdown": { "types": "./dist/Markdown.d.ts", "import": "./dist/Markdown.js" }
    }
  },
  "scripts": { "build": "tsc -p tsconfig.build.json", "prepack": "pnpm run build", "test": "vitest run" },
  "dependencies": {
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "vultus-core": "workspace:*"
  },
  "peerDependencies": { "antd": ">=5", "react": ">=18", "react-dom": ">=18", "react-i18next": ">=15" },
  "devDependencies": {
    "@ant-design/v5-patch-for-react-19": "^1.0.3",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "antd": "^5.29.3",
    "i18next": "^25.0.0",
    "jsdom": "^29.0.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-i18next": "^17.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.2.4"
  }
}
```

Only `version`, `repository.url`, `files`, `publishConfig` and `scripts` change; `git diff` must show nothing else.

- [ ] **Step 5: Run the pack checks to see them pass**

```bash
packcheck vultus-core && packcheck vultus-antd
```

Expected: two `PACK CHECK OK`. vultus-antd's line shows `"version":"0.1.1"`, `"dependencies":{..."vultus-core":"0.1.1"}` (pnpm rewrote `workspace:*`), and `targets` all under `dist/` (`index.js`, `index.d.ts`, `Markdown.d.ts`, `Markdown.js`).

- [ ] **Step 6: Check the compiled output**

```bash
cd ~/deai/unitas/packages/vultus-antd
grep -c "React.createElement" dist/*.js | grep -v ':0$' || echo "no classic JSX"
grep -l "react/jsx-runtime" dist/Markdown.js
```

Expected: `no classic JSX`, then `dist/Markdown.js`.

- [ ] **Step 7: Point the consumer at the packed packages and see it pass**

```bash
cd /tmp/vultus-consumer
cat > pnpm-workspace.yaml <<'W'
packages: []
overrides:
  vultus-core: file:/tmp/vultus-pack/vultus-core-0.1.1.tgz
  vultus-antd: file:/tmp/vultus-pack/vultus-antd-0.1.1.tgz
W
pnpm add -w /tmp/vultus-pack/vultus-core-0.1.1.tgz /tmp/vultus-pack/vultus-antd-0.1.1.tgz
pnpm exec vitest run
node --input-type=module -e "const m = await import('vultus-antd'); const md = await import('vultus-antd/markdown'); console.log(typeof md.Markdown, 'ActionButton' in m, typeof m.useAction)"
```

Expected: `Tests  1 passed (1)`; the Node line prints `object true function` (`Markdown` is a `memo` component, so its `typeof` is `object`). If `pnpm add` fails to resolve `vultus-core@0.1.1` from the registry, the override did not apply: stop and report that, with the output.

- [ ] **Step 8: Run the package's tests**

Run: `cd ~/deai/unitas/packages/vultus-antd && node_modules/.bin/vitest run --maxWorkers=2 --testTimeout=30000`
Expected: `Test Files  7 passed (7)`, no failures. (With vitest's default 5 s timeout and other suites running on the host, three tests time out; that is load, not this change.)

- [ ] **Step 9: Commit and clean up**

```bash
cd ~/deai/unitas
git add packages/vultus-antd/package.json packages/vultus-antd/tsconfig.build.json
git commit -m "build(vultus-antd): publish compiled ESM and declarations (0.1.1)

The package shipped raw .tsx, so a consumer without a JSX-aware bundler
failed with \"React is not defined\" (found in optio-conversation-ui's test
suite). prepack now emits dist/ and publishConfig points main/types/exports
at it; the repository keeps exporting ./src. Verified with a plain vitest
consumer: fails against the registry 0.1.0, passes against the packed 0.1.1.
Also fix the repository URL (it named the optio repo).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
rm -rf /tmp/vultus-consumer
git status --short
```

Expected: `git status --short` prints nothing (`dist/` is gitignored; the tarballs are in `/tmp/vultus-pack`, kept for the release step).

---

## Release (not part of this plan's execution)

With the owner's go, in dependency order, from `excavator:~/deai/unitas` after the branch is merged:

```bash
cd packages/vultus-core && pnpm publish && cd ../vultus-antd && pnpm publish
```

`prepack` rebuilds `dist/` for each; `publishConfig.access` is `public`. Then push `main` and tag `vultus-core@0.1.1` / `vultus-antd@0.1.1` as the owner prefers.
