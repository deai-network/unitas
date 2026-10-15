import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { resolveChoice } from './choices.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import {
  coveredNodes, expandedTreeKeys, normalizeTreeValue, toggleTreeValue,
  type TreeExpand, type TreeNode, type TreeNodeControls, type TreeSelection,
} from './tree.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

export type TreeOwnOptions<T extends string = string, Ctx = any> = {
  /** The roots, each with its children; static or derived (a function, of the field context if it declares a parameter). */
  nodes: ValueOrFn<TreeNode<T>[], Ctx>;
  /** What the value lists; default `'topmost'` (see TreeSelection). */
  selection?: TreeSelection;
  /** Which nodes a widget opens at first; default `'top'` (see TreeExpand). */
  expand?: TreeExpand;
};

export type TreeFieldOptions<T extends string = string, RouteId extends string = string, Ctx = any> =
  FieldOptions<T[], T[], RouteId, Ctx> & TreeOwnOptions<T, Ctx>;

export interface TreeFieldControls<T extends string = string> extends FieldControls<T[], T[]> {
  /** The roots as the widgets get them, each with its children. */
  nodes: TreeNodeControls<T>[];
  selection: TreeSelection;
  /** The nodes a widget opens at first (from `expand`). */
  expandedKeys: T[];
  /** Every node, by its value. */
  byValue: Map<T, TreeNodeControls<T>>;
  /** Checks or unchecks a node (with its subtree, in the cascading selections); ignored (with a warning) for an unknown or disabled node. */
  toggle(value: T): void;
}

/** The implicit initial value for a tree field: `initialValue` resolved, else the empty list. */
export function treeInitialValue<T extends string>(
  opts: { initialValue?: ValueOrFn<T[]> },
  ctx: FieldCtx,
  id: string,
): T[] {
  return resolveIn<T[]>(opts.initialValue, [], ctx, `Field '${id}': option 'initialValue'`);
}

function sameList<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * A field whose value is a set of tree nodes (Praeceptor's category filter), with antd
 * TreeSelect's semantics: in the cascading selections a checked node stands for its subtree
 * (its enabled part: disabled nodes follow antd's check conduction, so the widgets show what
 * the value covers), and `selection` says which nodes the value lists (see TreeSelection). The value is shown
 * and requested normalized (normalizeTreeValue): in tree pre-order, values that name no
 * node (a stored value naming a removed node) kept at the end. `setValue` does not police
 * disabled nodes (the widgets disable them); `toggle` refuses a disabled or unknown node with
 * a warning, as useManyOfField does.
 */
export function useTreeField<T extends string = string, RouteId extends string = string, Ctx = any>(
  opts: TreeFieldOptions<T, RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): TreeFieldControls<T> {
  const ctx = useFieldContext();
  const nodes = resolveIn<TreeNode<T>[]>(opts.nodes, [], ctx, `Field '${opts.id}': option 'nodes'`);
  const selection = opts.selection ?? 'topmost';

  const inside = !opts.onChange && !opts.commit;
  const initialValue = () => treeInitialValue<T>(opts, ctx, opts.id);
  const field = useFieldCore<T[], T[], RouteId, Ctx>('tree', inside ? { ...opts, initialValue } : opts, registry);

  // The same list object while it is already normalized, so the value is stable across renders.
  const normalized = normalizeTreeValue(nodes, field.value, selection);
  const value = sameList(normalized, field.value) ? field.value : normalized;

  const checked = new Set(coveredNodes(nodes, value, selection));
  const byValue = new Map<T, TreeNodeControls<T>>();
  const control = (node: TreeNode<T>): TreeNodeControls<T> => {
    const controls: TreeNodeControls<T> = { ...resolveChoice(opts.id, node), children: undefined, checked: checked.has(node.value) };
    byValue.set(node.value, controls);
    if (node.children) controls.children = node.children.map(control);
    return controls;
  };
  const nodeControls = nodes.map(control);

  const setValue = (next: T[]) => field.setValue(normalizeTreeValue(nodes, next, selection));

  const toggle = (v: T) => {
    const node = byValue.get(v);
    if (!node) {
      console.warn(`Field '${opts.id}': '${v}' is not one of its nodes`);
      return;
    }
    if (!node.enabled) {
      console.warn(`Field '${opts.id}': node '${v}' is disabled — ${node.whyDisabled ?? '(no reason)'}`);
      return;
    }
    field.setValue(toggleTreeValue(nodes, value, v, selection));
  };

  return {
    ...field,
    value,
    setValue,
    nodes: nodeControls,
    selection,
    expandedKeys: expandedTreeKeys(nodes, value, opts.expand ?? 'top'),
    byValue,
    toggle,
  };
}
