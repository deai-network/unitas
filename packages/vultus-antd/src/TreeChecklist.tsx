import { Input, Spin, Tree } from 'antd';
import { useState } from 'react';
import {
  filterTree, normalizeTreeValue, useSpinnerKey, useVultusComponents,
  type TreeFieldControls, type TreeNodeControls,
} from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useVultusTexts } from './texts.js';
import { treeData, TreeSwitcherIcon } from './treeData.js';
import { useTreeRequest } from './useTreeRequest.js';
import { withTooltip } from './WithReason.js';

export interface TreeChecklistProps<T extends string> {
  field: TreeFieldControls<T>;
}

/** The values of `nodes` and their descendants, and of those that have children. */
function collect<T extends string>(nodes: TreeNodeControls<T>[]): { all: Set<T>; parents: T[] } {
  const all = new Set<T>();
  const parents: T[] = [];
  const walk = (list: TreeNodeControls<T>[]) => {
    for (const node of list) {
      all.add(node.value);
      if (node.children?.length) {
        parents.push(node.value);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return { all, parents };
}

/**
 * A tree field (useTreeField) as moxb's always-open checkable tree: antd's
 * Tree, `checkable`, under a search box. Each node shows its label
 * (ChoiceLabel; dimmed in the description colour) and its note in brackets,
 * "Kombinatorika (4)", with its own tooltip (choiceTooltip: a disabled node's
 * reason first, then its description) while the field is enabled; a disabled
 * field shows its reason over the tree instead (fieldTooltip).
 *
 * Checking uses antd's own conduction (a checked node checks its subtree, a
 * node all of whose children are checked is checked): the tree gets the
 * value as its checked keys and reports the checked nodes, which are
 * requested normalized to the field's `selection` (so `'topmost'` requests a
 * checked parent alone, and unchecking a child of a checked parent requests
 * its siblings). `selection: 'independent'` turns conduction off
 * (`checkStrictly`). Values naming no node are kept at the end of the request
 * (as the hook keeps them) without being handed to antd. antd does not
 * conduct into a disabled node: a checked parent does not show its disabled
 * child checked, and a parent whose enabled children are all checked shows
 * checked, while the hook's coverage (coveredNodes) counts the disabled child
 * in as the cascading selections say.
 *
 * The search box (placeholder `texts.search`) keeps the nodes filterTree
 * keeps: the matches (accent- and case-insensitive), their ancestors, and a
 * match's whole subtree; every kept node is open while searching (the user
 * may still close one; a new query opens them all again), and clearing the
 * search brings back the expansion from before. The other nodes are only
 * hidden, so checking while searching keeps the selections the search hides
 * and conducts over the whole tree, as TreeSelect's search does. The search
 * only filters the view, so it stays usable while the field is disabled.
 *
 * Expansion starts from `field.expandedKeys` (the field's `expand`); the user
 * opens and closes nodes. Every request goes through the field's
 * confirmation (useTreeRequest), during which the tooltips are held back. The
 * field's label is the tree's accessible name; a pending commit disables the
 * tree and shows the lent Spinner (or antd's own) next to the search box.
 */
export function TreeChecklist<T extends string>({ field }: TreeChecklistProps<T>) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useTreeRequest(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<T[]>(field.expandedKeys);
  /** The user's own expansion while searching, for the query it was made under. */
  const [searchExpanded, setSearchExpanded] = useState<{ query: string; keys: T[] } | null>(null);
  if (!field.visible) return null;

  const disabled = !field.enabled || field.pending;
  const strict = field.selection === 'independent';
  const searching = query.trim() !== '';
  const kept = searching ? collect(filterTree(field.nodes, query)) : undefined;
  const expandedKeys = !kept ? expanded
    : searchExpanded?.query === query ? searchExpanded.keys : kept.parents;
  const known = field.value.filter((v) => field.byValue.has(v));
  const unknown = field.value.filter((v) => !field.byValue.has(v));

  const tree = (
    <Tree
      checkable
      selectable={false}
      switcherIcon={<TreeSwitcherIcon />}
      checkStrictly={strict}
      disabled={disabled}
      treeData={treeData(field.nodes, {
        noteStyle: 'brackets', tooltips: field.enabled, holdTooltips: asking, shown: kept?.all,
      })}
      checkedKeys={strict ? { checked: known, halfChecked: [] } : known}
      expandedKeys={expandedKeys}
      onExpand={(keys) => {
        if (searching) setSearchExpanded({ query, keys: keys as T[] });
        else setExpanded(keys as T[]);
      }}
      onCheck={(checked) => {
        const keys = (Array.isArray(checked) ? checked : checked.checked) as T[];
        request(normalizeTreeValue(field.nodes, [...keys, ...unknown], field.selection));
      }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
    />
  );
  return wrap(
    <div data-field-id={field.id} data-value={field.value.join(',')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Input allowClear placeholder={texts.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        {field.pending && (Spinner
          ? <Spinner spinnerKey={spinnerKey} size="small" />
          : <Spin size="small" />)}
      </div>
      {field.enabled ? tree : withTooltip(fieldTooltip(field, texts), true, tree, { block: true, open: asking ? false : undefined })}
    </div>,
  );
}
