import { useState } from 'react';
import type { OneOfTreeNodeControls } from 'vultus-core';

/** A one-of tree node's own fields that its row shows (or may come to show): compared by sameShown. */
export const SHOWN_NODE_FIELDS = [
  'value', 'label', 'description', 'icon', 'enabled', 'whyDisabled', 'variant', 'group', 'note', 'dimmed', 'choosable',
] as const satisfies readonly (keyof OneOfTreeNodeControls)[];

/**
 * A node's fields sameShown does not compare as they are: `children` it compares node by node;
 * `current` and `onPath` follow the value, and the rows take them from elsewhere (OneOfTreeList's
 * `selectedKeys` and its path context).
 */
export const NODE_FIELDS_ELSEWHERE = ['children', 'current', 'onPath'] as const satisfies readonly (keyof OneOfTreeNodeControls)[];

/**
 * A compile-time check: every field of a node is in one of the two lists, so a field vultus-core
 * adds fails `tsc` here until it is placed (compared, or taken from elsewhere).
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type EveryNodeFieldIsPlaced = Assert<Same<
  keyof OneOfTreeNodeControls,
  (typeof SHOWN_NODE_FIELDS)[number] | (typeof NODE_FIELDS_ELSEWHERE)[number]
>>;

/**
 * Whether two lists of nodes show the same: every node's SHOWN_NODE_FIELDS, and its children
 * likewise, in order. `current` and `onPath` are not compared.
 */
export function sameShown<T extends string>(a: OneOfTreeNodeControls<T>[], b: OneOfTreeNodeControls<T>[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (!SHOWN_NODE_FIELDS.every((key) => x[key] === y[key])) return false;
    return x.children === undefined || y.children === undefined
      ? x.children === y.children
      : sameShown(x.children, y.children);
  });
}

/**
 * `nodes` (a one-of tree field's), or the list given before while it shows the same
 * (sameShown). vultus-core builds a field's nodes afresh on every render, a new value marking
 * other nodes `current` and `onPath`; a widget keyed on the list this returns is rebuilt only
 * when a row would show something else. Read only the SHOWN_NODE_FIELDS (and `children`) of
 * what it returns: `current` and `onPath` may be stale.
 */
export function useShownNodes<T extends string>(nodes: OneOfTreeNodeControls<T>[]): OneOfTreeNodeControls<T>[] {
  const [shown, setShown] = useState(nodes);
  if (shown !== nodes && !sameShown(shown, nodes)) {
    // Derived state: React renders the component again at once, with the new list.
    setShown(nodes);
    return nodes;
  }
  return shown;
}
