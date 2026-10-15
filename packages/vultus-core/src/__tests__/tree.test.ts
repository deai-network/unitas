import { describe, it, expect } from 'vitest';
import { coveredNodes, filterTree, normalizeTreeValue, toggleTreeValue, type TreeNode } from '../tree.js';

type Id = 'A' | 'A1' | 'A2' | 'A2a' | 'A2b' | 'B' | 'B1';

// A(A1, A2(A2a, A2b)), B(B1)
const NODES: TreeNode<Id>[] = [
  { value: 'A', children: [{ value: 'A1' }, { value: 'A2', children: [{ value: 'A2a' }, { value: 'A2b' }] }] },
  { value: 'B', children: [{ value: 'B1' }] },
];

describe('normalizeTreeValue: topmost', () => {
  it('a node whose ancestor is in the value is dropped', () => {
    expect(normalizeTreeValue(NODES, ['A1', 'A'], 'topmost')).toEqual(['A']);
  });

  it('a node all of whose children are covered replaces them', () => {
    expect(normalizeTreeValue(NODES, ['A2a', 'A2b'], 'topmost')).toEqual(['A2']);
  });

  it('replacing goes up recursively', () => {
    expect(normalizeTreeValue(NODES, ['A1', 'A2'], 'topmost')).toEqual(['A']);
    expect(normalizeTreeValue(NODES, ['A1', 'A2a', 'A2b'], 'topmost')).toEqual(['A']);
  });

  it('lists in tree pre-order', () => {
    expect(normalizeTreeValue(NODES, ['B1', 'A2a'], 'topmost')).toEqual(['A2a', 'B']);
  });

  it('keeps unknown values at the end, without duplicates', () => {
    expect(normalizeTreeValue(NODES, ['zz', 'B1'] as Id[], 'topmost')).toEqual(['B', 'zz']);
    expect(normalizeTreeValue<string>(NODES, ['zz', 'yy', 'zz'], 'topmost')).toEqual(['zz', 'yy']);
  });
});

describe('normalizeTreeValue: all, leaves, independent', () => {
  it('all: the value nodes, their descendants, and ancestors all of whose children are covered', () => {
    expect(normalizeTreeValue(NODES, ['A2'], 'all')).toEqual(['A2', 'A2a', 'A2b']);
    expect(normalizeTreeValue(NODES, ['A1', 'A2'], 'all')).toEqual(['A', 'A1', 'A2', 'A2a', 'A2b']);
  });

  it('leaves: the covered leaves', () => {
    expect(normalizeTreeValue(NODES, ['A'], 'leaves')).toEqual(['A1', 'A2a', 'A2b']);
  });

  it('independent: the value as given, without duplicates', () => {
    expect(normalizeTreeValue(NODES, ['A', 'A1', 'A'], 'independent')).toEqual(['A', 'A1']);
  });
});

describe('coveredNodes', () => {
  it('a node covers its descendants', () => {
    expect(coveredNodes(NODES, ['A2'])).toEqual(['A2', 'A2a', 'A2b']);
  });

  it('a node all of whose children are covered is covered too (as antd checks it)', () => {
    expect(coveredNodes(NODES, ['A1', 'A2a', 'A2b'], 'leaves')).toEqual(['A', 'A1', 'A2', 'A2a', 'A2b']);
  });

  it('independent: the value itself', () => {
    expect(coveredNodes(NODES, ['A2'], 'independent')).toEqual(['A2']);
  });
});

describe('toggleTreeValue', () => {
  it('all: removing a node removes it and its ancestors, keeping its covered siblings and theirs', () => {
    // Covered before: A, A1, A2, A2a, A2b. A2a goes, and with it A2 and A (no longer all children covered).
    expect(toggleTreeValue(NODES, ['A', 'A1', 'A2', 'A2a', 'A2b'], 'A2a', 'all')).toEqual(['A1', 'A2b']);
  });
});

describe('filterTree', () => {
  type Labelled = { value: string; label?: string; children?: Labelled[] };
  const TOPICS: Labelled[] = [
    {
      value: 'math', label: 'Matek', children: [
        { value: 'comb', label: 'Kombinatorika' },
        { value: 'geo', label: 'Geometria' },
        { value: 'num', label: 'Számelmélet' },
      ],
    },
    { value: 'phys', label: 'Fizika' },
  ];

  it('keeps a match and its ancestors, with only their kept children', () => {
    expect(filterTree(TOPICS, 'kombinatorika')).toEqual([
      { value: 'math', label: 'Matek', children: [{ value: 'comb', label: 'Kombinatorika' }] },
    ]);
  });

  it('a matching node keeps its whole subtree, as antd TreeSelect does', () => {
    expect(filterTree(TOPICS, 'Matek')).toEqual([TOPICS[0]]);
  });

  it('a matching node deeper down keeps its ancestors, with only the path to it, and its whole subtree', () => {
    const sciences: Labelled[] = [
      {
        value: 'sci', label: 'Science', children: [
          { value: 'phys', label: 'Physics', children: [{ value: 'mech', label: 'Mechanics' }, { value: 'opt', label: 'Optics' }] },
          { value: 'chem', label: 'Chemistry' },
        ],
      },
    ];
    expect(filterTree(sciences, 'physics')).toEqual([
      {
        value: 'sci', label: 'Science', children: [
          { value: 'phys', label: 'Physics', children: [{ value: 'mech', label: 'Mechanics' }, { value: 'opt', label: 'Optics' }] },
        ],
      },
    ]);
  });

  it('a kept node with no kept children has no children list, not an empty one', () => {
    const [kept] = filterTree([{ value: 'x', label: 'X', children: [] }], 'x');
    expect(kept.value).toBe('x');
    expect(kept.children).toBeUndefined();
    const [math] = filterTree(TOPICS, 'kombinatorika');
    expect(math.children![0].children).toBeUndefined();
  });

  it('an empty query returns the nodes unchanged', () => {
    expect(filterTree(TOPICS, '')).toBe(TOPICS);
    expect(filterTree(TOPICS, '  ')).toBe(TOPICS);
  });

  it('ignores accents and case, and surrounding spaces in the query', () => {
    expect(filterTree(TOPICS, ' SZAMELM ')).toEqual([
      { value: 'math', label: 'Matek', children: [{ value: 'num', label: 'Számelmélet' }] },
    ]);
  });

  it('matches the value when there is no label', () => {
    expect(filterTree([{ value: 'alpha' }, { value: 'beta' }], 'alp')).toEqual([{ value: 'alpha' }]);
  });

  it('does not change the nodes it is given', () => {
    filterTree(TOPICS, 'kombinatorika');
    expect(TOPICS[0].children).toHaveLength(3);
  });
});
