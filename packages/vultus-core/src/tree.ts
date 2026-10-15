import type { OneOfChoice, OneOfChoiceControls } from './choices.js';
import { getVerdict } from './decision.js';
import { normalizeText } from './normalizeText.js';

/** A node of a tree field (Praeceptor's categories): a choice with children. */
export interface TreeNode<T extends string = string> extends OneOfChoice<T> {
  children?: TreeNode<T>[];
  /** Whether the one-of tree may choose this node (default true); a folder when false. Ignored by the many-of tree. */
  choosable?: boolean;
}

/** A node as the widgets get it: the resolved choice, its children likewise, and whether it shows checked. */
export interface TreeNodeControls<T extends string = string> extends OneOfChoiceControls<T> {
  children: TreeNodeControls<T>[] | undefined;
  /** Covered by the value (in the cascading selections), or in the value (`'independent'`). */
  checked: boolean;
}

/**
 * What a tree field's value lists, as antd TreeSelect's `showCheckedStrategy` and
 * `checkStrictly` do. In the three cascading selections a node stands for its subtree, and
 * a node all of whose children are covered is covered too — disabled nodes aside, as antd
 * conducts its checks (see `cascade`); they differ only in which of the covered nodes the
 * value names:
 * - `'topmost'` (`SHOW_PARENT`, the default): the covered nodes whose parent is not covered;
 * - `'all'` (`SHOW_ALL`): every covered node;
 * - `'leaves'` (`SHOW_CHILD`): the covered leaves.
 *
 * Where a disabled node breaks the cascade, the value also names what the others would not
 * cover: `'topmost'` a covered disabled node under a covered parent, and a covered node under
 * a covered disabled parent (as antd TreeSelect's SHOW_PARENT does); `'leaves'` a covered node
 * with children that is disabled or has no enabled child (stricter than antd's SHOW_CHILD,
 * which drops a checked disabled parent whose enabled children are all checked, and a parent
 * whose only children are disabled and checked — so the value would no longer cover them).
 *
 * `'independent'` (`checkStrictly`, moxb's `strictSelect`): each node is chosen on its own.
 */
export type TreeSelection = 'topmost' | 'all' | 'leaves' | 'independent';

/**
 * Which nodes a tree widget opens at first: `'top'` (the default), the roots with children;
 * `'none'`; `'selected'` (moxb's `expandValues`), the ancestors of the value's nodes; `'all'`,
 * every node with children.
 */
export type TreeExpand = 'top' | 'none' | 'selected' | 'all';

function hasChildren(node: { children?: unknown[] }): boolean {
  return (node.children?.length ?? 0) > 0;
}

/** The nodes in pre-order, and each node's parent. */
function indexTree<T extends string>(nodes: TreeNode<T>[]): { order: TreeNode<T>[]; parent: Map<T, T> } {
  const order: TreeNode<T>[] = [];
  const parent = new Map<T, T>();
  const walk = (list: TreeNode<T>[], up: T | undefined) => {
    for (const node of list) {
      order.push(node);
      if (up !== undefined) parent.set(node.value, up);
      if (node.children) walk(node.children, node.value);
    }
  };
  walk(nodes, undefined);
  return { order, parent };
}

/** The values that name no node, in their order, without duplicates (kept, so a stale value is not silently dropped). */
function unknownValues<T extends string>(order: TreeNode<T>[], value: T[]): T[] {
  const known = new Set(order.map((n) => n.value));
  return [...new Set(value.filter((v) => !known.has(v)))];
}

/**
 * Whether a node can be checked: its `enabled` / `disabled` resolved as resolveChoice does (a
 * Decision takes no context, so this needs none). Works on a definition's nodes (TreeNode,
 * Decisions) and on the widgets' node controls (TreeNodeControls, `enabled: boolean`) alike.
 */
function nodeEnabled(node: Pick<TreeNode, 'enabled' | 'disabled'>): boolean {
  if (node.enabled !== undefined) return getVerdict(node.enabled, true);
  return !getVerdict(node.disabled, false);
}

/**
 * The nodes a value covers in the cascading selections, by antd's check conduction (rc-tree's
 * conductCheck), so the hook and the widgets agree: the value's nodes; the enabled children of
 * a covered enabled node, and so on down (a disabled node is never covered through a checked
 * ancestor, nor is its subtree through it); and an enabled node all of whose enabled children
 * are covered, if it has any (a parent whose children are all disabled, or a disabled parent,
 * is never covered through its children). A disabled node in the value covers itself only.
 */
function cascade<T extends string>(nodes: TreeNode<T>[], value: T[]): Set<T> {
  const listed = new Set(value);
  const covered = new Set<T>();
  const walk = (node: TreeNode<T>, inherited: boolean): boolean => {
    const enabled = nodeEnabled(node);
    const self = listed.has(node.value) || (inherited && enabled);
    const children = (node.children ?? []).map((child) => ({ enabled: nodeEnabled(child), covered: walk(child, self && enabled) }));
    const counted = children.filter((child) => child.enabled);
    const isCovered = self || (enabled && counted.length > 0 && counted.every((child) => child.covered));
    if (isCovered) covered.add(node.value);
    return isCovered;
  };
  for (const node of nodes) walk(node, false);
  return covered;
}

/**
 * The covered nodes the value names under `selection` (see TreeSelection), in pre-order, by
 * rc-tree-select's formatStrategyValues (for `'leaves'`, a stricter form of it), so that the
 * named nodes cover exactly what `covered` does (`cascade` of them gives it back) also where
 * disabled nodes break the cascade:
 * - `'topmost'`: a covered node unless its parent is covered and neither of the two is
 *   disabled (only then does the parent cover it);
 * - `'leaves'`: the covered leaves, and a covered node with children that is disabled, has
 *   no enabled child, or has an enabled child not covered (its children would not cover it);
 * - `'all'`: every covered node.
 */
function namedNodes<T extends string>(order: TreeNode<T>[], parent: Map<T, T>, covered: Set<T>, selection: TreeSelection): T[] {
  const enabled = new Map(order.map((node) => [node.value, nodeEnabled(node)]));
  const named = order.filter((node) => {
    if (!covered.has(node.value)) return false;
    if (selection === 'topmost') {
      const up = parent.get(node.value);
      return up === undefined || !covered.has(up) || !enabled.get(node.value) || !enabled.get(up);
    }
    if (selection === 'leaves') {
      if (!hasChildren(node) || !enabled.get(node.value)) return true;
      const counted = node.children!.filter((child) => enabled.get(child.value));
      return counted.length === 0 || !counted.every((child) => covered.has(child.value));
    }
    return true;
  });
  return named.map((node) => node.value);
}

/**
 * A tree field's value in its canonical form under `selection` (see TreeSelection): the
 * nodes it names in tree pre-order, followed by the values that name no node, without
 * duplicates. With `'topmost'`, `['A1', 'A']` becomes `['A']`, and a node's children all
 * listed become the node.
 */
export function normalizeTreeValue<T extends string>(nodes: TreeNode<T>[], value: T[], selection: TreeSelection): T[] {
  const { order, parent } = indexTree(nodes);
  const covered = selection === 'independent' ? new Set(value) : cascade(nodes, value);
  const named = selection === 'independent'
    ? order.filter((node) => covered.has(node.value)).map((node) => node.value)
    : namedNodes(order, parent, covered, selection);
  return [...named, ...unknownValues(order, value)];
}

/**
 * Every node a tree field's value stands for, in pre-order (what an item filed under some
 * node matches against): in the cascading selections the covered nodes (the value's nodes,
 * their enabled descendants, and every enabled node all of whose enabled children are
 * covered; see `cascade`); with `'independent'` the value's nodes themselves. Values that
 * name no node follow, as in normalizeTreeValue. A node disabled when the value was stored
 * and enabled now is covered from then on (with `'topmost'`, a stored parent covers it).
 */
export function coveredNodes<T extends string>(nodes: TreeNode<T>[], value: T[], selection: TreeSelection = 'topmost'): T[] {
  return normalizeTreeValue(nodes, value, selection === 'independent' ? 'independent' : 'all');
}

/**
 * The value after flipping `node`, normalized, as antd's Tree flips a checkbox. In the
 * cascading selections a covered node is removed with the descendants it covers through
 * enabled nodes and with its enabled ancestors up to the first disabled one (they no longer
 * have all their enabled children); an uncovered one is added, covering its subtree as
 * `cascade` says. With `'independent'` the node alone is added or removed. A `node` that is
 * not one of the nodes changes nothing. Whether `node` itself may be flipped is the caller's
 * to decide (useManyOfTreeField refuses a disabled one).
 */
export function toggleTreeValue<T extends string>(nodes: TreeNode<T>[], value: T[], node: T, selection: TreeSelection): T[] {
  const { order, parent } = indexTree(nodes);
  const target = order.find((n) => n.value === node);
  if (!target) return normalizeTreeValue(nodes, value, selection);
  if (selection === 'independent') {
    return normalizeTreeValue(nodes, value.includes(node) ? value.filter((v) => v !== node) : [...value, node], selection);
  }
  const covered = cascade(nodes, value);
  if (covered.has(node)) {
    const uncover = (n: TreeNode<T>) => {
      covered.delete(n.value);
      for (const child of n.children ?? []) if (nodeEnabled(child)) uncover(child);
    };
    uncover(target);
    const byValue = new Map(order.map((n) => [n.value, n]));
    for (let up = parent.get(node); up !== undefined && nodeEnabled(byValue.get(up)!); up = parent.get(up)) covered.delete(up);
  } else {
    covered.add(node);
  }
  return normalizeTreeValue(nodes, [...covered, ...unknownValues(order, value)], selection);
}

/** The nodes a tree widget opens at first under `expand` (see TreeExpand), in pre-order. */
export function expandedTreeKeys<T extends string>(nodes: TreeNode<T>[], value: T[], expand: TreeExpand): T[] {
  if (expand === 'none') return [];
  if (expand === 'top') return nodes.filter(hasChildren).map((node) => node.value);
  const { order, parent } = indexTree(nodes);
  if (expand === 'all') return order.filter(hasChildren).map((node) => node.value);
  const ancestors = new Set<T>();
  for (const v of value) {
    for (let up = parent.get(v); up !== undefined; up = parent.get(up)) ancestors.add(up);
  }
  return order.filter((node) => ancestors.has(node.value)).map((node) => node.value);
}

/**
 * The nodes matching a search (Taskmaster's category search), by antd TreeSelect's rule, so a
 * dropdown and a drawer over the same nodes agree: a node matches if its label (else its
 * value) contains the query, ignoring accents, case and the query's surrounding spaces. A
 * matching node stays with its whole subtree; any other node stays if one of its descendants
 * matches, keeping only the children that stay. A node that stays with no children has
 * `children` undefined, not an empty list. Generic over the node's shape, so the widgets can
 * filter resolved node controls; the nodes given are not changed. An empty query returns
 * them as they are.
 */
export function filterTree<N extends { label?: string; value: string; children?: N[] }>(nodes: N[], query: string): N[] {
  const q = normalizeText(query.trim());
  if (!q) return nodes;
  /** The nodes of `list` that stay; `all` when an ancestor matched, so every node does. */
  const keep = (list: N[], all: boolean): N[] => list.flatMap((node) => {
    const matches = all || normalizeText(node.label ?? node.value).includes(q);
    const children = keep(node.children ?? [], matches);
    if (!matches && children.length === 0) return [];
    if (node.children === undefined) return [node];
    return [{ ...node, children: children.length > 0 ? children : undefined }];
  });
  return keep(nodes, false);
}

/**
 * Which nodes the one-of tree field may choose: `'any'` node, or only `'leaves'` (a node with
 * no children).
 */
export type TreeChoose = 'any' | 'leaves';

/**
 * Whether the one-of tree field may choose `node` under `choose` (see TreeChoose): choosable
 * (its `choosable` is not `false`), enabled (as nodeEnabled resolves it), and, under `'leaves'`,
 * has no children.
 */
export function canChooseNode(node: TreeNode, choose: TreeChoose): boolean {
  if (node.choosable === false) return false;
  if (!nodeEnabled(node)) return false;
  return choose !== 'leaves' || !hasChildren(node);
}

/** The values canChooseNode accepts, in tree pre-order. */
export function choosableValues<T extends string>(nodes: TreeNode<T>[], choose: TreeChoose): T[] {
  const { order } = indexTree(nodes);
  return order.filter((node) => canChooseNode(node, choose)).map((node) => node.value);
}

/** The values from the root down to `value` inclusive, in tree order; `[]` when no node has it. */
export function treePath<T extends string>(nodes: TreeNode<T>[], value: T): T[] {
  const { order, parent } = indexTree(nodes);
  if (!order.some((node) => node.value === value)) return [];
  const path: T[] = [value];
  for (let up = parent.get(value); up !== undefined; up = parent.get(up)) path.unshift(up);
  return path;
}
