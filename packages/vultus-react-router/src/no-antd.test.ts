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

test('vultus-react-router never imports antd (antd-free by design, as vultus-core)', () => {
  // vitest runs with cwd = package root. The shipped source only: tests may run vultus-antd's
  // widgets over the store (antd and vultus-antd are devDependencies for that).
  const offenders = walk(join(process.cwd(), 'src'))
    .filter((f) => !/__tests__|\.test\.tsx?$/.test(f))
    .filter((f) => /from\s+['"]antd['"]|from\s+['"]antd\//.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
});
