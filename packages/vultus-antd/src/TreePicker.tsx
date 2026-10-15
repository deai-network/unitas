import { TreeSelect, type TreeSelectProps } from 'antd';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  normalizeText, normalizeTreeValue, useSpinnerKey, useVultusComponents,
  type TreeFieldControls, type TreeSelection,
} from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useVultusTexts } from './texts.js';
import { treeData, TreeSwitcherIcon } from './treeData.js';
import { useTreeRequest } from './useTreeRequest.js';
import { withTooltip } from './WithReason.js';

export interface TreePickerProps<T extends string> {
  field: TreeFieldControls<T>;
  size?: TreeSelectProps['size'];
  style?: CSSProperties;
  /** How high the open tree grows before it scrolls, in pixels (antd's `listHeight`); default 520, as Taskmaster's. */
  listHeight?: number;
  /** The open tree's width in pixels, or `true` to match the field's (antd's `popupMatchSelectWidth`); default 480, as Taskmaster's. */
  popupMatchSelectWidth?: boolean | number;
}

/**
 * Which of the checked nodes antd lists (as tags, and in what it reports) for
 * each selection; the hook normalizes the request to the selection anyway.
 * `independent` checks nodes one by one (`treeCheckStrictly`), every checked
 * node a tag of its own (antd's default there would hide a parent all of
 * whose children are checked).
 */
const STRATEGY: Record<TreeSelection, TreeSelectProps['showCheckedStrategy']> = {
  topmost: TreeSelect.SHOW_PARENT,
  all: TreeSelect.SHOW_ALL,
  leaves: TreeSelect.SHOW_CHILD,
  independent: TreeSelect.SHOW_ALL,
};

/** Whether a node's label holds the search, accent- and case-insensitive, ignoring the search's surrounding spaces (as vultus-core's filterTree). */
function labelMatches(search: string, node: Record<string, unknown>): boolean {
  return normalizeText(String(node.label ?? '')).includes(normalizeText(search.trim()));
}

/**
 * A tree field (useTreeField) as antd's TreeSelect, `treeCheckable`: the
 * desktop form of Taskmaster's category filter. Closed, the field shows the
 * value as tags, by label, as many as fit, the rest collapsing to "+ N ..."
 * (`maxTagCount="responsive"`), or `field.placeholder` while empty;
 * `allowClear` clears everything at once, requesting `[]`. Open, the tree
 * starts from `field.expandedKeys` (the field's `expand`), and each node shows
 * its label (ChoiceLabel: in the description colour while dimmed) with its
 * note right-aligned (ChoiceRow) and its own tooltip to the side
 * (choiceTooltip: a disabled node's reason first, then its description); a
 * disabled node cannot be checked. The tree is `listHeight` high at most and
 * `popupMatchSelectWidth` wide (520 and 480, as Taskmaster's).
 *
 * Checking uses antd's own conduction (a checked node checks its subtree, a
 * node all of whose children are checked is checked), shown by the
 * selection's strategy (`topmost` SHOW_PARENT, `all` SHOW_ALL, `leaves`
 * SHOW_CHILD); `independent` turns conduction off (`treeCheckStrictly`, whose
 * labelled values are mapped to and from the field's plain ones). Each change
 * (checking, removing a tag) requests the new list normalized to the field's
 * `selection`, through the field's confirmation (useTreeRequest), so the
 * confirmation sees the list the field would hold. Values naming no node are
 * not handed to antd (no tag) and are kept at the end of a request, except
 * clearing's.
 *
 * The search box filters by label, accent- and case-insensitive
 * (normalizeText), keeping antd's rule, which vultus-core's filterTree
 * follows: a match with its whole subtree, and its ancestors, every kept node
 * open. The closed field's tooltip (fieldTooltip: disabled, its reason first)
 * is held back while the tree is open or a confirmation is asking, as are the
 * nodes'. The field's label is the accessible name; a pending commit disables
 * the field and shows the lent Spinner as its suffix icon (else antd's
 * loading icon).
 */
export function TreePicker<T extends string>({
  field, size, style, listHeight = 520, popupMatchSelectWidth = 480,
}: TreePickerProps<T>) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useTreeRequest(field);
  const [open, setOpen] = useState(false);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  /** Set by the clear icon, just before antd reports the emptied list (which would otherwise keep the values naming no node). */
  const clearing = useRef(false);
  // The same tree data while the field stays the same, not new on each
  // re-render of its own (the tree opening or closing): antd rebuilds its
  // tree from new data.
  const data = useMemo(() => treeData(field.nodes, {
    noteStyle: 'aside', tooltips: field.enabled, holdTooltips: asking, tooltipPlacement: 'right',
  }), [field.nodes, field.enabled, asking]);
  if (!field.visible) return null;

  const strict = field.selection === 'independent';
  const known = field.value.filter((v) => field.byValue.has(v));
  const unknown = field.value.filter((v) => !field.byValue.has(v));

  const select = (
    <TreeSelect
      treeData={data}
      value={strict ? known.map((v) => ({ value: v, label: field.byValue.get(v)!.label })) : known}
      onChange={(next: (T | { value: T })[]) => {
        if (clearing.current) {
          clearing.current = false;
          request([]);
          return;
        }
        const keys = next.map((v) => (typeof v === 'object' ? v.value : v));
        request(normalizeTreeValue(field.nodes, [...keys, ...unknown], field.selection));
      }}
      onClear={() => { clearing.current = true; }}
      treeCheckable
      treeCheckStrictly={strict}
      showCheckedStrategy={STRATEGY[field.selection]}
      treeNodeLabelProp="label"
      // `treeNodeFilterProp` only drives antd's highlight of the matches,
      // which ignores case but not accents; the filtering is labelMatches'.
      showSearch={{ filterTreeNode: labelMatches, treeNodeFilterProp: 'label' }}
      treeDefaultExpandedKeys={field.expandedKeys}
      switcherIcon={<TreeSwitcherIcon />}
      allowClear
      maxTagCount="responsive"
      placeholder={field.placeholder}
      listHeight={listHeight}
      popupMatchSelectWidth={popupMatchSelectWidth}
      size={size}
      style={{ minWidth: 200, ...style }}
      loading={field.pending}
      // See OneOfSelect: `suffixIcon` is the one loading-related prop antd
      // strips before forwarding the rest to @rc-component/select.
      suffixIcon={Spinner && field.pending ? <Spinner spinnerKey={spinnerKey} size="small" /> : undefined}
      disabled={!field.enabled || field.pending}
      onOpenChange={setOpen}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value.join(',')}
    />
  );
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, select, { open: open || asking ? false : undefined }));
}
