import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { resolveChoice, type OneOfChoiceControls } from './choices.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import {
  canChooseNode, choosableValues, expandedTreeKeys, treePath,
  type TreeChoose, type TreeExpand, type TreeNode,
} from './tree.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

export type OneOfTreeOwnOptions<T extends string = string, Ctx = any> = {
  /** The roots, each with its children; static or derived (a function, of the field context if it declares a parameter). */
  nodes: ValueOrFn<TreeNode<T>[], Ctx>;
  /** Which nodes may be chosen; default 'any' (see TreeChoose). */
  choose?: TreeChoose;
  /** Whether the value may be empty (''), nothing chosen; default false (as oneOf, never empty). */
  optional?: boolean;
  /** Which nodes a widget opens at first; default 'selected' (the value's ancestors; see TreeExpand). */
  expand?: TreeExpand;
};

export type OneOfTreeFieldOptions<T extends string = string, RouteId extends string = string, Ctx = any> =
  FieldOptions<T | '', T | '', RouteId, Ctx> & OneOfTreeOwnOptions<T, Ctx>;

/** A tree node as the one-of tree's widgets get it: the resolved choice, its children likewise, and whether it may be chosen, is the value, or an ancestor of it. */
export interface OneOfTreeNodeControls<T extends string = string> extends OneOfChoiceControls<T> {
  children: OneOfTreeNodeControls<T>[] | undefined;
  /** Whether the field may choose this node under `choose` (see canChooseNode). */
  choosable: boolean;
  /** It is the value. */
  current: boolean;
  /** An ancestor of the value (not the value itself). */
  onPath: boolean;
}

export interface OneOfTreeFieldControls<T extends string = string> extends FieldControls<T | '', T | ''> {
  /** The roots as the widgets get them, each with its children. */
  nodes: OneOfTreeNodeControls<T>[];
  /** Every node, by its value. */
  byValue: Map<T, OneOfTreeNodeControls<T>>;
  /** The chosen node, or undefined (the value is empty, or names no node). */
  current: OneOfTreeNodeControls<T> | undefined;
  /** The nodes from the root down to `current`, inclusive; empty when there is none. */
  path: OneOfTreeNodeControls<T>[];
  /** The node that can be chosen just before `current` in tree pre-order; undefined at the start, and with no `current`. */
  previous: OneOfTreeNodeControls<T> | undefined;
  /** The node that can be chosen just after `current`; with no `current`, the first one. */
  next: OneOfTreeNodeControls<T> | undefined;
  optional: boolean;
  choose: TreeChoose;
  /** The nodes a widget opens at first (from `expand`). */
  expandedKeys: T[];
  /** Requests ''; refused (with a warning) unless `optional`, as `setValue('')` would be. */
  clear(): void;
}

/**
 * The implicit initial value for a one-of tree field: `initialValue` resolved through the field
 * context, else '' when `optional`, else the first node `canChooseNode` accepts in tree
 * pre-order, else '' (no node can be chosen; as oneOf's undefined choice).
 */
export function oneOfTreeInitialValue<T extends string>(
  opts: { initialValue?: ValueOrFn<T | ''>; nodes: ValueOrFn<TreeNode<T>[]>; choose?: TreeChoose; optional?: boolean },
  ctx: FieldCtx,
  id: string,
  nodes: TreeNode<T>[],
): T | '' {
  const resolved = resolveIn<T | '' | undefined>(opts.initialValue, undefined, ctx, `Field '${id}': option 'initialValue'`);
  if (resolved !== undefined) return resolved;
  if (opts.optional) return '';
  return choosableValues(nodes, opts.choose ?? 'any')[0] ?? '';
}

/**
 * A field whose value is a single tree node, or nothing (Praeceptor's category picker, a
 * table of contents): `choosable` (a per-node flag, default true; a folder) and the field's
 * `choose: 'any' | 'leaves'` together say which nodes `setValue` accepts (canChooseNode);
 * `optional` says whether '' (nothing chosen) is one of them too. `setValue` refuses, with a
 * warning (as useOneOfField refuses a disabled choice): a value naming no node, a node
 * `canChooseNode` rejects, and '' unless `optional`. `clear()` requests ''. The field's current
 * state is the chosen node's description, unless `valueDescriptions` words it differently (as
 * oneOf). `previous` / `next` are the neighbours of `current` in tree pre-order among the nodes
 * that can be chosen (`choosableValues`); with no `current`, `previous` is undefined and `next`
 * is the first. `expandedKeys` (from `expand`, default `'selected'`) are the value's ancestors,
 * so a table of contents opens where the reader is. Inside the field the value starts at
 * `oneOfTreeInitialValue`.
 */
export function useOneOfTreeField<T extends string = string, RouteId extends string = string, Ctx = any>(
  opts: OneOfTreeFieldOptions<T, RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): OneOfTreeFieldControls<T> {
  const ctx = useFieldContext();
  const nodes = resolveIn<TreeNode<T>[]>(opts.nodes, [], ctx, `Field '${opts.id}': option 'nodes'`);
  const choose = opts.choose ?? 'any';
  const optional = opts.optional ?? false;

  const inside = !opts.onChange && !opts.commit;
  const initialValue = () => oneOfTreeInitialValue<T>(opts, ctx, opts.id, nodes);
  const field = useFieldCore<T | '', T | '', RouteId, Ctx>('oneOfTree', inside ? { ...opts, initialValue } : opts, registry);

  const path = field.value ? new Set(treePath(nodes, field.value)) : new Set<T>();
  const byValue = new Map<T, OneOfTreeNodeControls<T>>();
  const control = (node: TreeNode<T>): OneOfTreeNodeControls<T> => {
    const controls: OneOfTreeNodeControls<T> = {
      ...resolveChoice(opts.id, node),
      children: undefined,
      choosable: canChooseNode(node, choose),
      current: node.value === field.value,
      onPath: path.has(node.value) && node.value !== field.value,
    };
    byValue.set(node.value, controls);
    if (node.children) controls.children = node.children.map(control);
    return controls;
  };
  const nodeControls = nodes.map(control);

  const current = field.value ? byValue.get(field.value) : undefined;
  const pathControls = field.value ? treePath(nodes, field.value).map((v) => byValue.get(v)!) : [];

  const order = choosableValues(nodes, choose);
  const index = current ? order.indexOf(current.value) : -1;
  const previous = index > 0 ? byValue.get(order[index - 1]) : undefined;
  const next = index < 0
    ? (order.length > 0 ? byValue.get(order[0]) : undefined)
    : (index + 1 < order.length ? byValue.get(order[index + 1]) : undefined);

  const setValue = (requested: T | '') => {
    if (requested === '') {
      if (!optional) {
        console.warn(`Field '${opts.id}': '' is refused — the field is not optional`);
        return;
      }
      field.setValue('');
      return;
    }
    const node = byValue.get(requested);
    if (!node) {
      console.warn(`Field '${opts.id}': '${requested}' is not one of its nodes`);
      return;
    }
    if (!node.choosable) {
      if (node.whyDisabled !== undefined) {
        console.warn(`Field '${opts.id}': node '${requested}' is disabled — ${node.whyDisabled}`);
      } else {
        console.warn(`Field '${opts.id}': node '${requested}' cannot be chosen`);
      }
      return;
    }
    field.setValue(requested);
  };

  return {
    ...field,
    valueDescription: field.valueDescription ?? current?.description,
    setValue,
    nodes: nodeControls,
    byValue,
    current,
    path: pathControls,
    previous,
    next,
    optional,
    choose,
    expandedKeys: expandedTreeKeys(nodes, field.value ? [field.value] : [], opts.expand ?? 'selected'),
    clear: () => setValue(''),
  };
}
