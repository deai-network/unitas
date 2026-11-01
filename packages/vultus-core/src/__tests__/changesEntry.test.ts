import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import * as main from '../index.js';

// For reading package.json and the sources: not new URL(..., import.meta.url), which Vite rewrites.
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');
const manifest = JSON.parse(readFileSync(join(HERE, '../../package.json'), 'utf8'));

/** The modules a source file imports at runtime: each `import` and `export ... from`, but those of
 *  types alone (`import type`, `export type`), which the build drops. */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;'"=(]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    if (!match[1]) found.push(match[2]!);
  }
  return found;
}

/** What `entry` loads at runtime, through the package's own files: those files, and the packages
 *  they name. */
function loaded(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    for (const specifier of runtimeImports(file)) {
      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }
      const base = join(dirname(file), specifier).replace(/\.js$/, '');
      const found = ['.ts', '.tsx'].map((extension) => base + extension).find((path) => existsSync(path));
      expect(found, `${file}: ${specifier}`).toBeDefined();
      visit(found!);
    }
  };
  visit(join(SRC, entry));
  return { files: Array.from(files, (file) => file.slice(SRC.length + 1)).sort(), packages: Array.from(packages).sort() };
}

describe('the /changes entry', () => {
  it('exports the text changes', async () => {
    expect(Object.keys(await import('../changes.js')).sort())
      .toEqual(['ChangingText', 'changeDurations', 'changesIn', 'readText', 'useTextChanges']);
  });

  it('keeps them out of the main entry', () => {
    const names = Object.keys(main);
    expect(names).toContain('useVultusComponents');
    for (const name of ['changesIn', 'readText', 'useTextChanges', 'changeDurations', 'ChangingText']) {
      expect(names).not.toContain(name);
    }
  });

  it('importing the main entry loads no diff-match-patch; importing the subpath does', async () => {
    let loads = 0;
    vi.resetModules();
    vi.doMock('diff-match-patch', async (importOriginal) => {
      loads++;
      return importOriginal();
    });
    try {
      expect(await import('../index.js')).toHaveProperty('useVultusComponents');
      expect(loads).toBe(0);
      const changes = await import('../changes.js');
      expect(loads).toBe(1);
      // The real one, through the mock: the subpath works.
      expect(changes.changesIn('a hivei b', 'a hívei b').map((change) => change.level)).toContain('removed');
    } finally {
      vi.doUnmock('diff-match-patch');
      vi.resetModules();
    }
  });

  it('the main entry reaches no file of the subpath at runtime (its slot types are types alone), nor diff-match-patch', () => {
    const { files, packages } = loaded('index.ts');
    expect(files).toContain('Components.tsx');
    expect(files.filter((file) => file === 'changes.ts' || file.startsWith('changes/'))).toEqual([]);
    expect(packages).not.toContain('diff-match-patch');
  });

  it('the subpath imports react and diff-match-patch alone at runtime: no unified, react-markdown, hast or unist utility', () => {
    const { files, packages } = loaded('changes.ts');
    expect(files).toContain('changes/changesIn.ts');
    expect(packages).toEqual(['diff-match-patch', 'react']);
  });

  it('is mapped in package.json, from source and once published from dist', () => {
    expect(manifest.exports['./changes']).toBe('./src/changes.ts');
    expect(manifest.publishConfig.exports['./changes']).toEqual({
      types: './dist/changes.d.ts',
      import: './dist/changes.js',
      default: './dist/changes.js',
    });
  });

  it('depends on diff-match-patch and hast types, and on neither unified, react-markdown nor a hast or unist utility', () => {
    expect(manifest.dependencies).toHaveProperty('diff-match-patch');
    expect(manifest.dependencies).toHaveProperty('@types/hast');
    for (const field of ['dependencies', 'peerDependencies']) {
      const names = Object.keys(manifest[field] ?? {});
      expect(names).not.toContain('unified');
      expect(names).not.toContain('react-markdown');
      expect(names.filter((name) => name.startsWith('hast-util-') || name.startsWith('unist-util-'))).toEqual([]);
    }
  });
});
