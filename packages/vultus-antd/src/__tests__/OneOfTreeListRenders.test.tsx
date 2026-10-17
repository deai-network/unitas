import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { App as AntApp, type TreeProps } from 'antd';
import { Profiler, type ReactNode } from 'react';
import { useOneOfTreeField, type TreeNode } from 'vultus-core';
import { OneOfTreeList } from '../OneOfTreeList.js';

/**
 * What a value change costs the list: how often the rows' titles render, what antd's Tree is
 * handed, and how many commits it takes. A new tree data or expansion makes rc-tree re-flatten
 * its rows and render every row four times over (its motion state, the list's end of motion,
 * its `listChanging` timeout); a new value alone needs neither.
 */

/** Each render of antd's Tree: the props whose identity makes rc-tree re-flatten its rows. */
const given = vi.hoisted(() => [] as { treeData: unknown; expandedKeys: unknown }[]);
/** Renders of each node's ChoiceLabel (a row's title), by the node's value. */
const titles = vi.hoisted(() => new Map<string, number>());

vi.mock('antd', async (importOriginal) => {
  const antd = await importOriginal<typeof import('antd')>();
  const { createElement } = await import('react');
  function Tree(props: TreeProps<any>) {
    given.push({ treeData: props.treeData, expandedKeys: props.expandedKeys });
    return createElement(antd.Tree, props);
  }
  return { ...antd, Tree };
});

vi.mock('../ChoiceLabel.js', async (importOriginal) => {
  const own = await importOriginal<typeof import('../ChoiceLabel.js')>();
  const { createElement } = await import('react');
  function ChoiceLabel(props: Parameters<typeof own.ChoiceLabel>[0]) {
    const value = (props.choice as { value?: string }).value ?? '';
    titles.set(value, (titles.get(value) ?? 0) + 1);
    return createElement(own.ChoiceLabel, props);
  }
  return { ...own, ChoiceLabel };
});

type Toc = 'p1' | 'c1' | 'c2' | 's21' | 'p2' | 'c3';

// Part one (a folder) > Chapter one, Chapter two > Section 2.1; Part two > Chapter three.
const TOC: TreeNode<Toc>[] = [
  {
    value: 'p1', label: 'Part one', choosable: false, children: [
      { value: 'c1', label: 'Chapter one' },
      { value: 'c2', label: 'Chapter two', children: [{ value: 's21', label: 'Section 2.1' }] },
    ],
  },
  { value: 'p2', label: 'Part two', children: [{ value: 'c3', label: 'Chapter three' }] },
];

/** A link per value, the same function throughout, as a store's `hrefFor` is. */
const toc = (value: Toc | '') => `#?toc=${value}`;

/** A field kept at the render site, as a stored one is (the URL): vultus-core builds its node controls afresh on every render. */
function Outside({ value, expand = 'all' }: { value: Toc; expand?: 'all' | 'selected' }) {
  const field = useOneOfTreeField<Toc>({
    id: 'toc', label: 'Contents', nodes: TOC, expand, value, onChange: () => {}, hrefFor: toc,
  });
  return <OneOfTreeList field={field} />;
}

let commits = 0;
const counted = (node: ReactNode) => (
  <AntApp><Profiler id="list" onRender={() => { commits += 1; }}>{node}</Profiler></AntApp>
);

const isSelected = (text: string) => screen.getByText(text).closest('[role="treeitem"]')?.getAttribute('aria-selected') === 'true';
/**
 * Lets rc-tree's own follow-ups run: an open or close motion ends (jsdom never ends it: the rows
 * go at its deadline), then its `listChanging` timeout.
 */
async function settle() {
  await waitFor(() => expect(document.querySelector('.ant-tree-treenode-motion')).toBeNull(), { timeout: 3000 });
  await act(() => new Promise((resolve) => { setTimeout(resolve, 50); }));
}

/** Mounts the list at `from`, settles it, and clears the counts. */
async function mountAt(from: Toc, expand?: 'all' | 'selected') {
  const view = render(counted(<Outside value={from} expand={expand} />));
  await settle();
  given.length = 0;
  titles.clear();
  commits = 0;
  return (to: Toc) => view.rerender(counted(<Outside value={to} expand={expand} />));
}

beforeEach(() => {
  given.length = 0;
  titles.clear();
  commits = 0;
});

describe('OneOfTreeList: a new value alone', () => {
  it('a sibling: antd\'s Tree keeps its data and expansion, no title renders, one commit', async () => {
    const changeTo = await mountAt('c1');
    const before = { treeData: undefined as unknown, expandedKeys: undefined as unknown };
    changeTo('c1'); // a render of the page with the same value: the reference
    Object.assign(before, given.at(-1));
    given.length = 0;
    titles.clear();
    commits = 0;
    changeTo('c2');
    await waitFor(() => expect(isSelected('Chapter two')).toBe(true));
    await settle();
    expect(given.length).toBeGreaterThan(0);
    for (const props of given) {
      expect(props.treeData).toBe(before.treeData);
      expect(props.expandedKeys).toBe(before.expandedKeys);
    }
    expect(Object.fromEntries(titles)).toEqual({});
    expect(commits).toBe(1);
  });

  it('another branch: only the titles whose strong path changes render, each once; one commit', async () => {
    const changeTo = await mountAt('c1');
    changeTo('c3');
    await waitFor(() => expect(isSelected('Chapter three')).toBe(true));
    await settle();
    // Part one leaves the path, Part two joins it; nothing else renders again.
    expect(Object.fromEntries(titles)).toEqual({ p1: 1, p2: 1 });
    const data = new Set(given.map((props) => props.treeData));
    expect(data.size).toBe(1);
    expect(commits).toBe(1);
  });

  it('a value under a closed node: the expansion opens it, the tree data stays', async () => {
    const changeTo = await mountAt('c1', 'selected');
    expect(screen.queryByText('Chapter three')).toBeNull();
    changeTo('c3');
    await waitFor(() => expect(isSelected('Chapter three')).toBe(true));
    await settle();
    expect(screen.getByText('Chapter one')).toBeInTheDocument();
    expect(new Set(given.map((props) => props.treeData)).size).toBe(1);
    // The rows the expansion shows render for the first time; of the rows shown before, only
    // those whose strong path changes render again.
    expect(titles.get('c1')).toBeUndefined();
    expect(titles.get('c2')).toBeUndefined();
  });
});
