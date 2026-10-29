import { Empty, Tree } from 'antd';
import { useMemo, useRef, useState } from 'react';
import {
  coveredNodes, filterTree, normalizeTreeValue, type ManyOfTreeFieldControls, type TreeSelection,
} from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedTreeStyles } from './pendingLock.js';
import { useVultusTexts } from './texts.js';
import { collectValues, nextShown, openOrder, treeData, TreeSearchBox, TreeSwitcherIcon } from './treeData.js';
import { useManyOfTreeRequest } from './useManyOfTreeRequest.js';
import { withTooltip } from './WithReason.js';

export interface ManyOfTreeChecklistProps<T extends string> {
  field: ManyOfTreeFieldControls<T>;
}

/** ManyOfTreeChecklist's props for vultus-antd's own widgets only: not in ManyOfTreeChecklistProps, not exported. */
interface InternalManyOfTreeChecklistProps {
  /**
   * @internal Leaves `data-field-id` and `data-value` off the root: the
   * checklist is part of another widget of the same field (ManyOfTreePicker's
   * drawer), whose own root carries them, so the field's id stays unique in
   * the document.
   */
  nested?: boolean;
}

/**
 * A locked checklist's tree data: every node's checkbox disabled (`disableCheckbox`), the node
 * itself not. antd takes no check on it (a click, Space, Enter) and gives the checkbox its own
 * disabled look, the checkmark included (the checkbox's `::after`, which no `styles` entry
 * reaches; a tree's checkbox takes no `classNames` either), while the row keeps its
 * `aria-checked`. antd leaves such nodes out of its conduction, so the tree is then handed what
 * it showed (shownChecks).
 */
function lockChecks<N extends { children?: N[] }>(nodes: N[]): N[] {
  return nodes.map((node) => ({ ...node, disableCheckbox: true, children: node.children && lockChecks(node.children) }));
}

/**
 * The nodes antd's Tree shows checked and half-checked for `value` by its own conduction: the
 * covered ones (coveredNodes, which follows antd's rule), and every enabled node not covered
 * one of whose enabled children is checked or half-checked (a disabled node is never
 * half-checked, nor counts for its parent). A tree handed them as they are (`checkStrictly`)
 * shows what a conducting one does, whichever of its nodes it takes no check on.
 */
function shownChecks<T extends string>(
  nodes: ManyOfTreeFieldControls<T>['nodes'], value: T[], selection: TreeSelection,
): { checked: T[]; halfChecked: T[] } {
  const checked = new Set(coveredNodes(nodes, value, selection));
  const halfChecked: T[] = [];
  /** Whether `node` is checked or half-checked. */
  const walk = (node: ManyOfTreeFieldControls<T>['nodes'][number]): boolean => {
    let below = false;
    for (const child of node.children ?? []) if (walk(child) && child.enabled) below = true;
    const half = below && node.enabled && !checked.has(node.value);
    if (half) halfChecked.push(node.value);
    return half || checked.has(node.value);
  };
  nodes.forEach(walk);
  return { checked: [...checked], halfChecked };
}

/**
 * A many-of tree field (useManyOfTreeField) as moxb's always-open checkable tree: antd's
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
 * (as the hook keeps them) without being handed to antd. Disabled nodes: antd
 * does not conduct into one (a checked parent does not show its disabled
 * child checked), and a parent whose enabled children are all checked shows
 * checked; the hook's coverage (vultus-core's coveredNodes) follows the same
 * rule, so the tree and the field's value agree.
 *
 * The search box (placeholder `texts.search`, named "<search> <label>")
 * keeps the nodes filterTree keeps: the matches (accent- and
 * case-insensitive), their ancestors, and a match's whole subtree; every kept
 * node is open while searching (the user may still close one; any change to
 * the query opens them all again), and clearing the search brings back the
 * expansion from before. No match shows antd's empty notice instead of the
 * tree. The other nodes are only hidden, so checking while searching keeps
 * the selections the search hides and conducts over the whole tree, as
 * TreeSelect's search does; the keyboard never lands on a hidden node (the
 * active node moves on to the next shown one the way the key went). The
 * search only filters the view, so it stays usable while the field is
 * disabled.
 *
 * Expansion starts from `field.expandedKeys` (the field's `expand`); the user
 * opens and closes nodes. Every request goes through the field's
 * confirmation (useManyOfTreeRequest), during which the tooltips are held back. The
 * field's label is the tree's accessible name. While the field is pending (a
 * check that commits, or its `pending` option says the app is busy) the tree
 * is locked (isLocked): it keeps its tab stop and the keyboard focus, is said
 * unavailable, and its checkboxes are disabled (lockChecks: they check
 * nothing, a click or Space alike) and its titles look disabled
 * (useLockedTreeStyles), while every node shows checked, half-checked or not
 * as before (shownChecks), each row saying so to a screen reader
 * (`aria-checked`), and the arrows still move and open or close nodes; the
 * lent Spinner (or antd's own) shows next to the search box, in its place
 * kept for it idle too (TreeSearchBox), so the box keeps its width.
 */
export function ManyOfTreeChecklist<T extends string>({ field, nested = false }: ManyOfTreeChecklistProps<T> & InternalManyOfTreeChecklistProps) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useManyOfTreeRequest(field);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<T[]>(field.expandedKeys);
  /** The user's own expansion under the current query; null opens every kept node. */
  const [searchExpanded, setSearchExpanded] = useState<T[] | null>(null);
  /** The keyboard's active node (rc-tree's `activeKey`), always a shown one. */
  const [active, setActive] = useState<T | null>(null);
  /** Which way the last key moves the active node: 1 down (and on focus), -1 up. */
  const travel = useRef<1 | -1>(1);
  // The same tree data while the field and the search stay the same: a
  // re-render of its own (the keyboard's active node) would otherwise hand
  // rc-tree new data, cutting short a node's opening or closing.
  const kept = useMemo(() => (query.trim() !== '' ? collectValues(filterTree(field.nodes, query)) : undefined), [field.nodes, query]);
  const locked = isLocked(field);
  const data = useMemo(() => {
    const rows = treeData(field.nodes, {
      noteStyle: 'brackets', tooltips: field.enabled, holdTooltips: asking, shown: kept?.all,
    });
    return locked ? lockChecks(rows) : rows;
  }, [field.nodes, field.enabled, asking, kept, locked]);
  const lockedStyles = useLockedTreeStyles(locked);
  if (!field.visible) return null;

  const strict = field.selection === 'independent';
  const expandedKeys = !kept ? expanded : searchExpanded ?? kept.parents;
  const known = field.value.filter((v) => field.byValue.has(v));
  const unknown = field.value.filter((v) => !field.byValue.has(v));

  // rc-tree's keyboard walks every node in its list, hidden or not (focus
  // activates the first, Space checks the active one): an active node the
  // search hides is moved on to the next shown one the way the key went.
  const activate = (key: T | null) => {
    if (key === null || !kept || kept.all.has(key)) {
      setActive(key);
      return;
    }
    setActive(nextShown(openOrder(field.nodes, new Set(expandedKeys)), key, travel.current, (k) => kept.all.has(k)));
  };

  const tree = (
    <Tree
      checkable
      selectable={false}
      switcherIcon={<TreeSwitcherIcon />}
      // Locked, the checkboxes are disabled (lockChecks), which antd leaves out of its
      // conduction: the tree is handed what it showed (shownChecks), to show as it is.
      checkStrictly={strict || locked}
      // Locked, only the checkboxes are, the titles looking disabled (useLockedTreeStyles):
      // the tree keeps its tab stop and each row its checked state.
      disabled={!field.enabled}
      aria-disabled={locked || undefined}
      styles={lockedStyles}
      treeData={data}
      checkedKeys={strict
        ? { checked: known, halfChecked: [] }
        : locked ? shownChecks(field.nodes, known, field.selection) : known}
      expandedKeys={expandedKeys}
      onExpand={(keys) => {
        if (kept) setSearchExpanded(keys as T[]);
        else setExpanded(keys as T[]);
      }}
      activeKey={active !== null && (!kept || kept.all.has(active)) ? active : null}
      onActiveChange={(key) => activate((key ?? null) as T | null)}
      onCheck={(checked) => {
        const keys = (Array.isArray(checked) ? checked : checked.checked) as T[];
        request(normalizeTreeValue(field.nodes, [...keys, ...unknown], field.selection));
      }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
    />
  );
  const control = field.enabled ? tree : withTooltip(fieldTooltip(tipField, texts), true, tree, { block: true, open: asking ? false : undefined });
  return wrap(
    <div
      data-field-id={nested ? undefined : field.id}
      data-value={nested ? undefined : field.value.join(',')}
      onFocusCapture={() => { travel.current = 1; }}
      onKeyDownCapture={(e) => {
        travel.current = e.key === 'ArrowUp' || e.key === 'End' ? -1 : 1;
        // Locked, Space on the tree checks nothing (the checkboxes are disabled), nor scrolls
        // the page, as antd lets it do on a node it will not check.
        if (locked && e.key === ' ' && (e.target as Element).closest('[role="tree"]')) e.preventDefault();
      }}
    >
      <TreeSearchBox
        field={field}
        query={query}
        onSearch={(next) => {
          setQuery(next);
          setSearchExpanded(null);
        }}
      />
      {kept && kept.all.size === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : control}
    </div>,
  );
}
