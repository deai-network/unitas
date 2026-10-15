import { Drawer, TreeSelect, type TreeSelectProps } from 'antd';
import { useMemo, useRef, useState, type CSSProperties, type Key } from 'react';
import {
  useSpinnerKey, useVultusComponents, type OneOfTreeFieldControls, type OneOfTreeNodeControls,
} from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { OneOfTreeList } from './OneOfTreeList.js';
import { useVultusTexts } from './texts.js';
import { labelMatches, treeData, TreeSwitcherIcon, type FieldTreeDataNode } from './treeData.js';
import { useOneOfTreeRequest } from './useOneOfTreeRequest.js';
import { withTooltip } from './WithReason.js';

export interface OneOfTreePickerProps<T extends string> {
  field: OneOfTreeFieldControls<T>;
  size?: TreeSelectProps['size'];
  style?: CSSProperties;
  /** How high the open tree grows before it scrolls, in pixels (antd's `listHeight`); default 520, as ManyOfTreePicker's. */
  listHeight?: number;
  /** The open tree's width in pixels, or `true` to match the field's (antd's `popupMatchSelectWidth`); default 480, as ManyOfTreePicker's. */
  popupMatchSelectWidth?: boolean | number;
  /**
   * How the closed field shows the value: `'label'` (default), the chosen
   * node's label; `'path'`, the labels from its root down to it, joined by
   * `texts.pathSeparator` ("Geometria › Síkgeometria › Kör").
   */
  summary?: 'label' | 'path';
  /**
   * Where the tree opens: `'dropdown'` (default) under the field, with its
   * search; `'drawer'` in a panel from the bottom of the screen instead, for
   * a phone: an `OneOfTreeList` of the field (its search box) under the
   * field's label, no Done button (choosing closes it). The app decides when
   * (on a narrow screen).
   */
  panel?: 'dropdown' | 'drawer';
}

/** A tree data node with its `path`: the labels from its root down to it, joined. */
type PathTreeDataNode<T extends string> = FieldTreeDataNode<T> & { path: string; children?: PathTreeDataNode<T>[] };

/**
 * The tree data with each node's path ("Geometria › Síkgeometria › Kör", joined by
 * `separator`): what the closed field shows under `summary="path"` (TreeSelect's
 * `treeNodeLabelProp`), the search still matching the label alone.
 */
function withPaths<T extends string>(nodes: FieldTreeDataNode<T>[], separator: string, above?: string): PathTreeDataNode<T>[] {
  return nodes.map((node) => {
    const path = above === undefined ? node.label : `${above}${separator}${node.label}`;
    return { ...node, path, children: node.children && withPaths(node.children, separator, path) };
  });
}

/** The values of the nodes that have children, in pre-order. */
function parentValues<T extends string>(nodes: OneOfTreeNodeControls<T>[]): T[] {
  return nodes.flatMap((node) => (node.children?.length ? [node.value, ...parentValues(node.children)] : []));
}

/** The parts of the closed field that act on their own (clearing): a tap on them does not open the drawer. */
const OWN_ACTIONS = '.ant-select-clear';

/**
 * A one-of tree field (useOneOfTreeField) as antd's TreeSelect, single: a
 * category picker. Closed, the field shows the chosen node's label, or with
 * `summary="path"` its path ("Geometria › Síkgeometria › Kör",
 * `texts.pathSeparator`); while no node is chosen (the value is empty, or
 * names no node) it shows `field.placeholder`, never the raw value. An
 * `optional` field has a clear button, requesting `''`. Open, the tree starts
 * from `field.expandedKeys` (the field's `expand`); each time it opens, the
 * chosen node's ancestors open too (the user's own expansion kept), so it
 * shows the value however that changed meanwhile. Each node shows its
 * label (ChoiceLabel: in the description colour while dimmed) with its note
 * right-aligned (ChoiceRow) and its own tooltip to the side (choiceTooltip: a
 * disabled node's reason first, then its description). The tree is
 * `listHeight` high at most and `popupMatchSelectWidth` wide (520 and 480, as
 * ManyOfTreePicker's).
 *
 * Clicking a node that can be chosen (`choosable`) requests it, through the
 * field's confirmation (useOneOfTreeRequest), and closes the tree; a node
 * that cannot (a folder, a node with children under `choose: 'leaves'`) is
 * not selectable: a click opens or closes it (`treeExpandAction="click"`).
 * Choosing a node with children leaves it open or closed as it was. A
 * disabled node cannot be chosen.
 *
 * The search box filters by label, accent- and case-insensitive
 * (normalizeText), keeping antd's rule, which vultus-core's filterTree
 * follows: a match with its whole subtree, and its ancestors, every kept node
 * open (the user may still close one; any change to the search opens them all
 * again), the expansion from before coming back after the search. The nodes
 * it drops are not in the tree, so the keyboard (arrows, Enter choosing a
 * node that can be chosen) moves over the shown ones only; a search hiding
 * the chosen node keeps the value, shown again when the tree closes. The
 * closed field's tooltip (fieldTooltip: disabled, its reason first) is held
 * back while the tree is open or a confirmation is asking, as are the nodes'.
 * The field's label is the accessible name; a pending commit disables the
 * field and shows the lent Spinner as its suffix icon (else antd's loading
 * icon).
 *
 * On a phone: `panel="drawer"` keeps the closed field to showing the choice
 * (no dropdown, no search in it); a tap on it (or Enter while it has focus),
 * except on its clear icon, opens an antd Drawer from the bottom, 88% high,
 * titled with the field's label, holding an `OneOfTreeList` of the same
 * field (`nested`: the list carries no `data-field-id` or `data-value` of
 * its own, the closed field's root being the only carrier), its search box
 * included. A disabled or pending field does not open it.
 *
 * The drawer closes when the field's value becomes the node chosen in it (a
 * choice with no confirmation, or a confirmed one), or when the node chosen
 * is the one already current (`onChosen`'s value then equals `field.value`:
 * `request` refuses it as equal, so nothing is requested, but the user's
 * intent is clear); it does not close merely because a request was taken,
 * so a popconfirm or modal confirmation opened from the list's choice stays
 * visible, and a Cancel keeps the drawer open. There is no Done button.
 */
export function OneOfTreePicker<T extends string>({
  field, size, style, listHeight = 520, popupMatchSelectWidth = 480, summary = 'label', panel = 'dropdown',
}: OneOfTreePickerProps<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useOneOfTreeRequest(field);
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<T[]>(field.expandedKeys);
  /** The user's own expansion under the current search; null opens every node. */
  const [searchExpanded, setSearchExpanded] = useState<T[] | null>(null);
  /**
   * The node the click being handled opened or closed, and the expansion before it: a click on
   * a node with children that chooses it toggles it too (`treeExpandAction`), which choosing
   * undoes.
   */
  const toggled = useRef<{ key: T; before: T[] } | null>(null);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  // The same tree data while the field stays the same, not new on each
  // re-render of its own (the tree opening or closing): antd rebuilds its
  // tree from new data.
  const data = useMemo(() => {
    const nodes = treeData(field.nodes, {
      noteStyle: 'aside', tooltips: field.enabled, holdTooltips: asking, tooltipPlacement: 'right',
    });
    return summary === 'path' ? withPaths(nodes, texts.pathSeparator) : nodes;
  }, [field.nodes, field.enabled, asking, summary, texts.pathSeparator]);
  const parents = useMemo(() => parentValues(field.nodes), [field.nodes]);
  // Closes the drawer when the value becomes the node chosen in it (this render's, or a later
  // one, under a confirmation that commits): not on a request merely taken (see `chosen` below),
  // so a popconfirm or modal confirmation stays visible, and a Cancel keeps the drawer open.
  const [trackedValue, setTrackedValue] = useState(field.value);
  if (trackedValue !== field.value) {
    setTrackedValue(field.value);
    if (drawerOpen) setDrawerOpen(false);
  }
  if (!field.visible) return null;

  const disabled = !field.enabled || field.pending;
  const openDrawer = () => { if (!disabled) setDrawerOpen(true); };
  /**
   * The drawer list's `onChosen`: `value` is the row chosen, whether or not the request was
   * taken. `value === field.value` means the already-current node was chosen (`request` refused
   * it as equal, so nothing was requested): the user's intent is clear, so this closes the
   * drawer directly. Otherwise the request was taken, either applied at once or (a confirmation
   * open) not yet; either way `trackedValue` above closes the drawer once the value actually
   * changes, so this does nothing then, leaving a popconfirm or modal confirmation visible until
   * it is answered.
   */
  const chosen = (value: T | '') => { if (value === field.value) setDrawerOpen(false); };

  // antd filters while the search is not empty; it opens every node then, as here.
  const searching = query !== '';
  const expandedKeys = searching ? searchExpanded ?? parents : expanded;
  const setExpandedKeys = searching ? setSearchExpanded : setExpanded;
  const opening: Partial<TreeSelectProps> = panel === 'drawer'
    ? {
      open: false,
      showSearch: false,
      onOpenChange: (next) => { if (next) openDrawer(); },
      // A focused select may report no new opening on a second tap (as
      // ManyOfTreePicker found): any tap opens the drawer, except on the field's own clear icon.
      onClick: (e) => { if (!(e.target as HTMLElement).closest(OWN_ACTIONS)) openDrawer(); },
    }
    : {
      // `treeNodeFilterProp` only drives antd's highlight of the matches,
      // which ignores case but not accents; the filtering is labelMatches'.
      // The search is held here (antd clears it as the tree closes), so the
      // expansion knows it.
      showSearch: {
        filterTreeNode: labelMatches,
        treeNodeFilterProp: 'label',
        searchValue: query,
        onSearch: (next) => {
          setQuery(next);
          setSearchExpanded(null);
        },
      },
      onOpenChange: (next) => {
        setOpen(next);
        if (!next) return;
        const ancestors = field.path.slice(0, -1).map((node) => node.value);
        setExpanded((keys) => [...keys, ...ancestors.filter((key) => !keys.includes(key))]);
      },
    };

  const select = (
    <TreeSelect
      treeData={data}
      // `null` while no node is chosen (the value is empty, or names no node): the placeholder
      // shows, not the raw value.
      value={field.current ? field.current.value : null}
      // A choice, or clearing (no value).
      onChange={(next: T | null | undefined) => {
        if (toggled.current && toggled.current.key === next) setExpandedKeys(toggled.current.before);
        request(next ?? '');
      }}
      {...opening}
      treeNodeLabelProp={summary === 'path' ? 'path' : 'label'}
      treeExpandedKeys={expandedKeys}
      onTreeExpand={(keys: Key[]) => {
        const next = keys as T[];
        const changed = [
          ...next.filter((key) => !expandedKeys.includes(key)),
          ...expandedKeys.filter((key) => !next.includes(key)),
        ];
        toggled.current = changed.length === 1 ? { key: changed[0], before: expandedKeys } : null;
        // Only for the click being handled: a choice made later (Enter) finds none.
        queueMicrotask(() => { toggled.current = null; });
        setExpandedKeys(next);
      }}
      treeExpandAction="click"
      switcherIcon={<TreeSwitcherIcon />}
      allowClear={field.optional}
      placeholder={field.placeholder}
      listHeight={listHeight}
      popupMatchSelectWidth={popupMatchSelectWidth}
      size={size}
      style={{ minWidth: 200, ...style }}
      loading={field.pending}
      // See OneOfSelect: `suffixIcon` is the one loading-related prop antd
      // strips before forwarding the rest to @rc-component/select.
      suffixIcon={Spinner && field.pending ? <Spinner spinnerKey={spinnerKey} size="small" /> : undefined}
      disabled={disabled}
      // As OneOfSelect's: an empty title keeps antd from putting the label in a native tooltip on
      // the closed select, where it would compete with ours.
      title=""
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value}
    />
  );
  const closed = wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, select, {
    open: open || drawerOpen || asking ? false : undefined,
    // Without a width the span is a block, so the select fills a form item (antd's ant-select-in-form-item); elsewhere it keeps its natural width.
    style,
    block: style?.width === undefined,
    stable: true,
  }));
  if (panel !== 'drawer') return closed;
  return (
    <>
      {closed}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="bottom"
        size="88%"
        title={field.label || undefined}
      >
        {/* Nested: the select's root alone carries the field's data-field-id and data-value. */}
        <OneOfTreeList field={field} search nested onChosen={chosen} />
      </Drawer>
    </>
  );
}
