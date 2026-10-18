import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/**
 * Modules that load React. vultus-core is among them: its only entry imports `react` and
 * `react-i18next`, so this package takes nothing but types from it.
 */
const REACT_LOADING = /^(react|react-dom|react-i18next|antd|vultus-core)(\/|$)/;

/** Every module a file loads at run time: imports and re-exports that are not `type`-only, `import()` and `require()`. */
function loadedModules(source: string): string[] {
  const statements = [...source.matchAll(/\b(import|export)\s+(type\s+)?(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g)]
    .filter((m) => m[2] === undefined)
    .map((m) => m[3]);
  const calls = [...source.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return [...statements, ...calls];
}

test('vultus-filtrum never loads React (it runs where the server builds its queries)', () => {
  // vitest runs with cwd = package root. The shipped source only.
  const offenders = walk(join(process.cwd(), 'src'))
    .filter((f) => !/__tests__|\.test\.tsx?$/.test(f))
    .flatMap((f) => loadedModules(readFileSync(f, 'utf8')).filter((m) => REACT_LOADING.test(m)).map((m) => `${f}: ${m}`));
  expect(offenders).toEqual([]);
});
