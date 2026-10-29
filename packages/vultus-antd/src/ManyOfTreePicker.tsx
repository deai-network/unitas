import { Button, Drawer, TreeSelect, type TreeSelectProps } from 'antd';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  normalizeTreeValue, toggleTreeValue, useSpinnerKey, useVultusComponents,
  type ManyOfTreeFieldControls, type TreeSelection,
} from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { firstWords } from './firstWords.js';
import { isLocked, useLockedSelectLook } from './pendingLock.js';
import { useVultusTexts } from './texts.js';
import { ManyOfTreeChecklist } from './ManyOfTreeChecklist.js';
import { labelMatches, treeData, TreeSwitcherIcon } from './treeData.js';
import { useManyOfTreeRequest } from './useManyOfTreeRequest.js';
import { withTooltip } from './WithReason.js';

export interface ManyOfTreePickerProps<T extends string> {
  field: ManyOfTreeFieldControls<T>;
  size?: TreeSelectProps['size'];
  style?: CSSProperties;
  /** How high the open tree grows before it scrolls, in pixels (antd's `listHeight`); default 520, as Taskmaster's. */
  listHeight?: number;
  /** The open tree's width in pixels, or `true` to match the field's (antd's `popupMatchSelectWidth`); default 480, as Taskmaster's. */
  popupMatchSelectWidth?: boolean | number;
  /**
   * Where the tree opens: `'dropdown'` (default) under the field, with its
   * search; `'drawer'` in a panel from the bottom of the screen instead, for
   * a phone (Taskmaster's): a ManyOfTreeChecklist of the field (its search box,
   * notes in brackets) under the field's label and a Done button
   * (`texts.done`). The app decides when (on a narrow screen).
   */
  panel?: 'dropdown' | 'drawer';
  /**
   * How the closed field shows the value: `'tags'` (default), as many as
   * fit; `'firstWords'`, one line of each selected node's first words
   * ("Osztók, legnagyobb…, Feltételes…", firstWords), for a phone.
   */
  summary?: 'tags' | 'firstWords';
}

/** About how many characters of each selected label the first-words summary shows: fewer when it lists more than one. */
const SUMMARY_CHARS = { one: 40, each: 16 };

/** The parts of the closed field that act on their own (clearing, removing a tag): a tap on them does not open the drawer. */
const OWN_ACTIONS = '.ant-select-clear, .ant-select-selection-item-remove';

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

/**
 * A many-of tree field (useManyOfTreeField) as antd's TreeSelect, `treeCheckable`: the
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
 * Checking uses antd's own conduction (a checked node checks its enabled
 * subtree, a node all of whose enabled children are checked is checked — the
 * hook's coverage follows the same rule), shown by the
 * selection's strategy (`topmost` SHOW_PARENT, `all` SHOW_ALL, `leaves`
 * SHOW_CHILD); `independent` turns conduction off (`treeCheckStrictly`, whose
 * labelled values are mapped to and from the field's plain ones). Each change
 * (checking, removing a tag) requests the new list normalized to the field's
 * `selection`, through the field's confirmation (useManyOfTreeRequest), so the
 * confirmation sees the list the field would hold: in the cascading
 * selections, the field's value with the node clicked (or whose tag was
 * removed) toggled (toggleTreeValue), not antd's list, which its
 * showCheckedStrategy cuts (SHOW_CHILD drops a checked disabled parent). Values naming no node are
 * not handed to antd (no tag) and are kept at the end of a request, except
 * clearing's.
 *
 * The search box filters by label, accent- and case-insensitive
 * (normalizeText), keeping antd's rule, which vultus-core's filterTree
 * follows: a match with its whole subtree, and its ancestors, every kept node
 * open. The search stays after a check (antd would clear it), so several
 * matches can be checked in a row. The closed field's tooltip (fieldTooltip:
 * disabled, its reason first) is held back while the tree is open or a
 * confirmation is asking, as are the nodes'. The field's label is the
 * accessible name; while the field is pending (a check that commits, or its
 * `pending` option says the app is busy) it shows the lent Spinner as its
 * suffix icon (else antd's loading icon) and is locked (isLocked: it keeps
 * the keyboard focus and is said unavailable; its tree closes and opens for
 * nothing until pending ends; a removal or a clear changes nothing: no clear
 * icon, no remove icon on the tags). The search stays across pending (the
 * focus does, so antd's clearing as it leaves does not come), typing into it
 * changing nothing; the tree opened again shows it.
 *
 * On a phone (Taskmaster's): `panel="drawer"` keeps the closed field to
 * showing the choice (no dropdown, no search in it); a tap on it (or Enter
 * or Space while it has focus), except on its clear and remove icons, opens
 * an antd Drawer from the bottom, 88% high, titled with the field's
 * label, Done (`texts.done`) closing it, holding a ManyOfTreeChecklist of the same
 * field: its search box, notes in brackets, each check requested at once
 * through the field's confirmation. A disabled or pending field does not open
 * it; one open as a check commits stays open, its checklist locked.
 * `summary="firstWords"` shows no tags but one line: each selected node's
 * first words (firstWords: about 16 characters each when more than one is
 * selected, else 40, never ending on one of `texts.joiningWords`), joined
 * with ", ".
 */
export function ManyOfTreePicker<T extends string>({
  field, size, style, listHeight = 520, popupMatchSelectWidth = 480, panel = 'dropdown', summary = 'tags',
}: ManyOfTreePickerProps<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useManyOfTreeRequest(field);
  const [open, setOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** The dropdown's search, held here so that typing while locked changes nothing. */
  const [query, setQuery] = useState('');
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const locked = isLocked(field);
  const lockedLook = useLockedSelectLook(locked);
  /** Set by the clear icon, just before antd reports the emptied list (which would otherwise keep the values naming no node). */
  const clearing = useRef(false);
  // The same tree data while the field stays the same, not new on each
  // re-render of its own (the tree opening or closing): antd rebuilds its
  // tree from new data.
  const data = useMemo(() => treeData(field.nodes, {
    noteStyle: 'aside', tooltips: field.enabled, holdTooltips: asking, tooltipPlacement: 'right',
  }), [field.nodes, field.enabled, asking]);
  if (!field.visible) return null;
  // Locked, the tree is closed (`open: false`), which antd does not report.
  if (locked && open) setOpen(false);

  const strict = field.selection === 'independent';
  const known = field.value.filter((v) => field.byValue.has(v));
  const unknown = field.value.filter((v) => !field.byValue.has(v));
  const openDrawer = () => { if (field.enabled && !locked) setDrawerOpen(true); };
  const opening: Partial<TreeSelectProps> = panel === 'drawer'
    ? {
      open: false,
      showSearch: false,
      onOpenChange: (next) => { if (next) openDrawer(); },
      // A focused select may report no new opening on a second tap (as
      // Taskmaster found): any tap opens the drawer, except on the field's
      // own actions.
      onClick: (e) => { if (!(e.target as HTMLElement).closest(OWN_ACTIONS)) openDrawer(); },
    }
    : {
      // Locked, the tree stays closed; antd's own state comes back closed when pending ends.
      open: locked ? false : undefined,
      // `treeNodeFilterProp` only drives antd's highlight of the matches,
      // which ignores case but not accents; the filtering is labelMatches'.
      // antd reports every change of the search (`autoClearSearchValue` off,
      // it clears none on its own): locked, typing changes nothing, while its
      // clearing as the focus leaves still comes through.
      showSearch: {
        filterTreeNode: labelMatches,
        treeNodeFilterProp: 'label',
        autoClearSearchValue: false,
        searchValue: query,
        onSearch: (next) => { if (!locked || next === '') setQuery(next); },
      },
      onOpenChange: (next) => { if (!locked) setOpen(next); },
    };

  const select = (
    <TreeSelect
      treeData={data}
      value={strict ? known.map((v) => ({ value: v, label: field.byValue.get(v)!.label })) : known}
      onChange={(next: (T | { value: T })[], _labels, extra) => {
        if (clearing.current) {
          clearing.current = false;
          request([]);
          return;
        }
        // In the cascading selections the click (or a tag's removal) flips the node it was on,
        // as the hook's toggle does: antd's list is cut by its showCheckedStrategy, which under
        // SHOW_CHILD drops a checked disabled parent, so it may not cover what the field does.
        const trigger = extra?.triggerValue as T | { value: T } | undefined;
        const node = typeof trigger === 'object' && trigger !== null ? trigger.value : trigger;
        if (!strict && node !== undefined && field.byValue.has(node)) {
          if (field.byValue.get(node)!.enabled) request(toggleTreeValue(field.nodes, field.value, node, field.selection));
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
      {...opening}
      treeDefaultExpandedKeys={field.expandedKeys}
      switcherIcon={<TreeSwitcherIcon />}
      allowClear={!locked}
      maxTagCount={summary === 'firstWords' ? 0 : 'responsive'}
      maxTagPlaceholder={summary === 'firstWords'
        ? (omitted) => omitted.map((o) => firstWords(
          String(o.label), omitted.length > 1 ? SUMMARY_CHARS.each : SUMMARY_CHARS.one, texts.joiningWords,
        )).join(', ')
        : undefined}
      placeholder={field.placeholder}
      listHeight={listHeight}
      popupMatchSelectWidth={popupMatchSelectWidth}
      size={size}
      style={{ minWidth: 200, ...style, ...lockedLook.style }}
      styles={lockedLook.styles}
      loading={field.pending}
      // See OneOfSelect: `suffixIcon` is the one loading-related prop antd
      // strips before forwarding the rest to @rc-component/select.
      suffixIcon={Spinner && field.pending ? <Spinner spinnerKey={spinnerKey} size="small" /> : undefined}
      disabled={!field.enabled}
      aria-disabled={locked || undefined}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value.join(',')}
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
        extra={<Button type="primary" onClick={() => setDrawerOpen(false)}>{texts.done}</Button>}
      >
        {/* Nested: the select's root alone carries the field's data-field-id and data-value. */}
        <ManyOfTreeChecklist field={field} nested />
      </Drawer>
    </>
  );
}
