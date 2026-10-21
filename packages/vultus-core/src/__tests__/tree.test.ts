import { describe, it, expect } from 'vitest';
import {
  canChooseNode, choosableValues, coveredNodes, expandedTreeKeys, filterTree, normalizeTreeValue, toggleTreeValue, treePath,
  type TreeNode,
} from '../tree.js';

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

describe('disabled nodes (as antd conducts checks)', () => {
  // Geometria(Síkgeometria, Térgeometria — disabled), as in the gallery's topics.
  const GEOMETRIA: TreeNode[] = [
    {
      value: 'geometria', label: 'Geometria', children: [
        { value: 'sikgeometria', label: 'Síkgeometria' },
        { value: 'tergeometria', label: 'Térgeometria', disabled: { verdict: true, reason: 'No tasks yet' } },
      ],
    },
  ];

  it('topmost: checking Síkgeometria checks Geometria (all its enabled children are covered)', () => {
    expect(toggleTreeValue(GEOMETRIA, [], 'sikgeometria', 'topmost')).toEqual(['geometria']);
    expect(normalizeTreeValue(GEOMETRIA, ['sikgeometria'], 'topmost')).toEqual(['geometria']);
  });

  it('a checked parent does not cover its disabled child', () => {
    expect(coveredNodes(GEOMETRIA, ['geometria'])).toEqual(['geometria', 'sikgeometria']);
    expect(coveredNodes(GEOMETRIA, ['sikgeometria'], 'leaves')).toEqual(['geometria', 'sikgeometria']);
  });

  it('all and leaves: no disabled node enters the value', () => {
    expect(toggleTreeValue(GEOMETRIA, [], 'geometria', 'all')).toEqual(['geometria', 'sikgeometria']);
    expect(normalizeTreeValue(GEOMETRIA, ['geometria'], 'all')).toEqual(['geometria', 'sikgeometria']);
    expect(toggleTreeValue(GEOMETRIA, [], 'geometria', 'leaves')).toEqual(['sikgeometria']);
  });

  it('unchecking the only enabled child unchecks the parent too', () => {
    expect(toggleTreeValue(GEOMETRIA, ['geometria'], 'sikgeometria', 'topmost')).toEqual([]);
  });

  it('a disabled node listed in the value stays, covering itself only; unchecking its parent keeps it', () => {
    const nodes: TreeNode[] = [
      { value: 'P', children: [{ value: 'D', disabled: true, children: [{ value: 'D1' }] }, { value: 'E' }] },
    ];
    expect(normalizeTreeValue(nodes, ['D'], 'topmost')).toEqual(['D']);
    expect(coveredNodes(nodes, ['D'])).toEqual(['D']);
    // Checking P keeps D (P does not cover it, so topmost names it beside P); unchecking P keeps it too.
    const checked = toggleTreeValue(nodes, ['D'], 'P', 'topmost');
    expect(checked).toEqual(['P', 'D']);
    expect(toggleTreeValue(nodes, checked, 'P', 'topmost')).toEqual(['D']);
  });

  it('leaves: a parent whose children are all disabled can be checked (it names itself)', () => {
    const nodes: TreeNode[] = [{ value: 'P', children: [{ value: 'd1', disabled: true }, { value: 'd2', disabled: true }] }];
    expect(toggleTreeValue(nodes, [], 'P', 'leaves')).toEqual(['P']);
    expect(toggleTreeValue(nodes, ['P'], 'P', 'leaves')).toEqual([]);
  });

  it('topmost: a disabled parent in the value does not swallow its checked children', () => {
    const nodes: TreeNode[] = [{ value: 'D', disabled: true, children: [{ value: 'e1' }, { value: 'e2' }] }];
    expect(toggleTreeValue(nodes, ['D'], 'e1', 'topmost')).toEqual(['D', 'e1']);
    expect(normalizeTreeValue(nodes, ['D', 'e1', 'e2'], 'topmost')).toEqual(['D', 'e1', 'e2']);
    expect(normalizeTreeValue(nodes, ['D', 'e1', 'e2'], 'leaves')).toEqual(['D', 'e1', 'e2']);
  });

  it('coverage does not pass through a disabled node: its subtree is not covered through a checked ancestor', () => {
    const nodes: TreeNode[] = [
      { value: 'P', children: [{ value: 'D', enabled: false, children: [{ value: 'D1' }] }, { value: 'E' }] },
    ];
    expect(coveredNodes(nodes, ['P'])).toEqual(['P', 'E']);
    expect(normalizeTreeValue(nodes, ['P'], 'leaves')).toEqual(['E']);
  });

  it('a parent whose children are all disabled is never covered through them', () => {
    const nodes: TreeNode[] = [{ value: 'P', children: [{ value: 'D1', disabled: true }, { value: 'D2', enabled: { verdict: false } }] }];
    expect(normalizeTreeValue(nodes, ['D1', 'D2'], 'topmost')).toEqual(['D1', 'D2']);
    expect(coveredNodes(nodes, ['D1', 'D2'])).toEqual(['D1', 'D2']);
  });

  it('a disabled parent is not covered through its children', () => {
    const nodes: TreeNode[] = [{ value: 'D', disabled: true, children: [{ value: 'C1' }, { value: 'C2' }] }];
    expect(normalizeTreeValue(nodes, ['C1', 'C2'], 'topmost')).toEqual(['C1', 'C2']);
  });

  it('works on the widgets\' node controls too (enabled: boolean)', () => {
    const controls = [
      {
        value: 'geometria', enabled: true, children: [
          { value: 'sikgeometria', enabled: true, children: undefined },
          { value: 'tergeometria', enabled: false, children: undefined },
        ],
      },
    ];
    expect(normalizeTreeValue(controls, ['sikgeometria'], 'topmost')).toEqual(['geometria']);
    expect(coveredNodes(controls, ['geometria'])).toEqual(['geometria', 'sikgeometria']);
  });
});

describe('normalizing keeps what the value covers (all subsets of a tree with disabled nodes)', () => {
  // R1(a, b⊘(b1, b2), c(c1⊘)), R2⊘(x, y), R3(z⊘)
  const nodes: TreeNode[] = [
    {
      value: 'R1', children: [
        { value: 'a' },
        { value: 'b', disabled: true, children: [{ value: 'b1' }, { value: 'b2' }] },
        { value: 'c', children: [{ value: 'c1', disabled: true }] },
      ],
    },
    { value: 'R2', disabled: true, children: [{ value: 'x' }, { value: 'y' }] },
    { value: 'R3', children: [{ value: 'z', disabled: true }] },
  ];
  const all = ['R1', 'a', 'b', 'b1', 'b2', 'c', 'c1', 'R2', 'x', 'y', 'R3', 'z'];
  const disabled = new Set(['b', 'c1', 'R2', 'z']);
  const subsets = Array.from({ length: 1 << all.length }, (_, mask) => all.filter((_, i) => mask & (1 << i)));
  const covered = (value: string[]) => new Set(coveredNodes(nodes, value));
  const SELECTIONS = ['topmost', 'all', 'leaves'] as const;

  it.each(SELECTIONS)('%s: the normalized value covers exactly what the value does, and is its own normal form', (selection) => {
    for (const value of subsets) {
      const normal = normalizeTreeValue(nodes, value, selection);
      expect(covered(normal), `${selection} ${value.join(',')} -> ${normal.join(',')}`).toEqual(covered(value));
      expect(normalizeTreeValue(nodes, normal, selection)).toEqual(normal);
    }
  });

  it.each(SELECTIONS)('%s: toggling an enabled node flips it alone among the disabled ones: theirs stay as they were', (selection) => {
    for (const value of subsets) {
      const before = covered(value);
      for (const node of all.filter((v) => !disabled.has(v))) {
        const next = toggleTreeValue(nodes, value, node, selection);
        const after = covered(next);
        const where = `${selection} ${value.join(',')} toggle ${node} -> ${next.join(',')}`;
        expect(after.has(node), where).toBe(!before.has(node));
        for (const d of disabled) expect(after.has(d), `${where}: ${d}`).toBe(before.has(d));
        expect(normalizeTreeValue(nodes, next, selection), where).toEqual(next);
      }
    }
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

describe('choosable nodes', () => {
  // Geometria (folder) > Síkgeometria > Kör, Térgeometria (disabled); Algebra.
  const geo: TreeNode[] = [
    {
      value: 'geo', label: 'Geometria', choosable: false, children: [
        { value: 'sik', label: 'Síkgeometria', children: [{ value: 'kor', label: 'Kör' }] },
        { value: 'ter', label: 'Térgeometria', disabled: { verdict: true, reason: 'later' } },
      ],
    },
    { value: 'alg', label: 'Algebra' },
  ];
  const byValue = (value: string) => {
    const find = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const node of nodes) {
        if (node.value === value) return node;
        const found = node.children && find(node.children);
        if (found) return found;
      }
      return undefined;
    };
    return find(geo)!;
  };

  describe('canChooseNode', () => {
    it('a folder (choosable: false) cannot be chosen, under either choose', () => {
      expect(canChooseNode(byValue('geo'), 'any')).toBe(false);
      expect(canChooseNode(byValue('geo'), 'leaves')).toBe(false);
    });

    it('a node with children can be chosen under \'any\', not under \'leaves\'', () => {
      expect(canChooseNode(byValue('sik'), 'any')).toBe(true);
      expect(canChooseNode(byValue('sik'), 'leaves')).toBe(false);
    });

    it('a disabled node cannot be chosen', () => {
      expect(canChooseNode(byValue('ter'), 'any')).toBe(false);
      expect(canChooseNode(byValue('ter'), 'leaves')).toBe(false);
    });

    it('a leaf can be chosen under either choose', () => {
      expect(canChooseNode(byValue('kor'), 'any')).toBe(true);
      expect(canChooseNode(byValue('kor'), 'leaves')).toBe(true);
    });
  });

  describe('choosableValues', () => {
    it('\'any\': every node canChooseNode accepts, in pre-order', () => {
      expect(choosableValues(geo, 'any')).toEqual(['sik', 'kor', 'alg']);
    });

    it('\'leaves\': only the leaves, in pre-order', () => {
      expect(choosableValues(geo, 'leaves')).toEqual(['kor', 'alg']);
    });
  });

  describe('treePath', () => {
    it('a nested value: the values from the root down to it, inclusive', () => {
      expect(treePath(geo, 'kor')).toEqual(['geo', 'sik', 'kor']);
    });

    it('a root value: itself alone', () => {
      expect(treePath(geo, 'alg')).toEqual(['alg']);
    });

    it('a value naming no node: empty', () => {
      expect(treePath(geo, 'nope')).toEqual([]);
    });
  });
});

describe('expandedTreeKeys: a list', () => {
  it('the listed nodes with children, in pre-order', () => {
    expect(expandedTreeKeys(NODES, [], ['B', 'A2'])).toEqual(['A2', 'B']);
  });

  it("and the value's ancestors, so its node shows", () => {
    expect(expandedTreeKeys(NODES, ['A2a'], ['B'])).toEqual(['A', 'A2', 'B']);
  });

  it('a listed leaf, or a value naming no node, opens nothing', () => {
    expect(expandedTreeKeys(NODES, [], ['A1', 'nincs'])).toEqual([]);
  });

  it('an empty list: only the value\'s ancestors', () => {
    expect(expandedTreeKeys(NODES, ['B1'], [])).toEqual(['B']);
  });
});
