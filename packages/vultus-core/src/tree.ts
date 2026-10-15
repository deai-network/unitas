import type { OneOfChoice, OneOfChoiceControls } from './choices.js';
import { normalizeText } from './normalizeText.js';

/** A node of a tree field (Praeceptor's categories): a choice with children. */
export interface TreeNode<T extends string = string> extends OneOfChoice<T> {
  children?: TreeNode<T>[];
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
 * a node all of whose children are covered is covered too; they differ only in which of the
 * covered nodes the value names:
 * - `'topmost'` (`SHOW_PARENT`, the default): the covered nodes whose parent is not covered;
 * - `'all'` (`SHOW_ALL`): every covered node;
 * - `'leaves'` (`SHOW_CHILD`): the covered leaves.
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

/** The nodes a value covers in the cascading selections: the value's nodes, their descendants, and every node all of whose children are covered. */
function cascade<T extends string>(nodes: TreeNode<T>[], value: T[]): Set<T> {
  const listed = new Set(value);
  const covered = new Set<T>();
  const walk = (node: TreeNode<T>, inherited: boolean): boolean => {
    const self = inherited || listed.has(node.value);
    const children = (node.children ?? []).map((child) => walk(child, self));
    const isCovered = self || (children.length > 0 && children.every(Boolean));
    if (isCovered) covered.add(node.value);
    return isCovered;
  };
  for (const node of nodes) walk(node, false);
  return covered;
}

/** The covered nodes the value names under `selection` (see TreeSelection), in pre-order. */
function namedNodes<T extends string>(order: TreeNode<T>[], parent: Map<T, T>, covered: Set<T>, selection: TreeSelection): T[] {
  const named = order.filter((node) => {
    if (!covered.has(node.value)) return false;
    if (selection === 'leaves') return !hasChildren(node);
    if (selection === 'topmost') {
      const up = parent.get(node.value);
      return up === undefined || !covered.has(up);
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
 * their descendants, and every node all of whose children are covered); with
 * `'independent'` the value's nodes themselves. Values that name no node follow, as in
 * normalizeTreeValue.
 */
export function coveredNodes<T extends string>(nodes: TreeNode<T>[], value: T[], selection: TreeSelection = 'topmost'): T[] {
  return normalizeTreeValue(nodes, value, selection === 'independent' ? 'independent' : 'all');
}

/**
 * The value after flipping `node`, normalized. In the cascading selections a covered node
 * is removed with its descendants and its ancestors (they no longer have all their
 * children), and an uncovered one is added with its descendants; with `'independent'` the
 * node alone is added or removed. A `node` that is not one of the nodes changes nothing.
 */
export function toggleTreeValue<T extends string>(nodes: TreeNode<T>[], value: T[], node: T, selection: TreeSelection): T[] {
  const { order, parent } = indexTree(nodes);
  const target = order.find((n) => n.value === node);
  if (!target) return normalizeTreeValue(nodes, value, selection);
  if (selection === 'independent') {
    return normalizeTreeValue(nodes, value.includes(node) ? value.filter((v) => v !== node) : [...value, node], selection);
  }
  const covered = cascade(nodes, value);
  const subtree = indexTree([target]).order.map((n) => n.value);
  if (covered.has(node)) {
    for (const v of subtree) covered.delete(v);
    for (let up = parent.get(node); up !== undefined; up = parent.get(up)) covered.delete(up);
  } else {
    for (const v of subtree) covered.add(v);
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
