import { Empty, Input, Spin, Tree } from 'antd';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  filterTree, useSpinnerKey, useVultusComponents, type OneOfTreeFieldControls, type OneOfTreeNodeControls,
} from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { useVultusTexts } from './texts.js';
import { collectValues, openOrder, treeData, TreeSwitcherIcon, type FieldTreeDataNode } from './treeData.js';
import { useOneOfTreeRequest } from './useOneOfTreeRequest.js';
import { withTooltip } from './WithReason.js';

export interface OneOfTreeListProps<T extends string> {
  field: OneOfTreeFieldControls<T>;
  /** A search box above the tree, filtering its nodes by label as ManyOfTreeChecklist's; default off. */
  search?: boolean;
  /** The list's style; its width and layout keys (flex, margins) go to the tooltip anchor around it (see withTooltip). */
  style?: CSSProperties;
}

/** OneOfTreeList's props for vultus-antd's own widgets only: not in OneOfTreeListProps, not exported. */
interface InternalOneOfTreeListProps {
  /**
   * @internal Leaves `data-field-id` and `data-value` off the root: the list is
   * part of another widget of the same field (OneOfTreePicker's drawer), whose
   * own root carries them, so the field's id stays unique in the document. The
   * rows keep their `data-value`.
   */
  nested?: boolean;
  /**
   * @internal Called after a click (or the keyboard) chose a row: the request
   * was taken, or the row is the value already. OneOfTreePicker's drawer closes
   * on it. Not after a folder's click, nor after a click left to the browser.
   */
  onChosen?: () => void;
}

/**
 * A row of the list as antd's Tree takes it: a node's tree data, or the optional field's
 * empty-value row (key `''`), with its `data-value` (rc-tree puts data attributes on the row).
 */
type ListDataNode<T extends string> = Omit<FieldTreeDataNode<T | ''>, 'children'> & {
  'data-value': T | '';
  children?: ListDataNode<T>[];
};

/**
 * A row's title as a link to `href` (what requesting the row's value amounts to, a URL). A
 * plain click stays on the page: the link's default is prevented and the click goes on to the
 * tree, whose selection requests the value (one request). A click with Ctrl, Cmd, Shift or Alt
 * is the browser's (a new tab or window, which reads the value from its URL): it stops at the
 * link, so nothing is requested. The middle button fires no click, only the browser's
 * auxclick. The link is out of the tab order (the tree is one tab stop, its keyboard choosing)
 * and in the tree's text colour.
 */
function rowLink(href: string, title: ReactNode): ReactNode {
  return (
    <a
      href={href}
      tabIndex={-1}
      style={{ color: 'inherit' }}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) e.stopPropagation();
        else e.preventDefault();
      }}
    >
      {title}
    </a>
  );
}

/**
 * treeData's rows as the list shows them: each with its `data-value`, an ancestor of the value
 * (`onPath`) in strong text, and a node that can be chosen a link where `hrefFor` gives one.
 */
function listRows<T extends string>(
  rows: FieldTreeDataNode<T>[],
  byValue: Map<T, OneOfTreeNodeControls<T>>,
  hrefFor: ((value: T) => string | undefined) | undefined,
): ListDataNode<T>[] {
  return rows.map((row) => {
    const node = byValue.get(row.value)!;
    const title = node.onPath ? <strong>{row.title}</strong> : row.title;
    const href = node.choosable ? hrefFor?.(row.value) : undefined;
    return {
      ...row,
      title: typeof href === 'string' ? rowLink(href, title) : title,
      'data-value': row.value,
      children: row.children && listRows(row.children, byValue, hrefFor),
    };
  });
}

/**
 * A one-of tree field (useOneOfTreeField) as an always-open tree: antd's Tree, no
 * checkboxes, each row across the list's width (`blockNode`). A sidebar, a table of contents.
 * Each node shows its label (ChoiceLabel; dimmed in the description colour) and its note in
 * brackets, "Kör (3)", with its own tooltip (choiceTooltip: a disabled node's reason first,
 * then its description) while the field is enabled; a disabled node is greyed and cannot be
 * chosen. A disabled field shows its reason over the list instead (fieldTooltip). The list
 * sits in the stable tooltip anchor (`vultus-tooltip-anchor`, a block), which takes the
 * width and layout keys of `style`.
 *
 * The current node shows selected, and its ancestors (`onPath`) in strong text; a value
 * naming no node selects nothing. Clicking a node that can be chosen (`choosable`) requests
 * it, through the field's confirmation (useOneOfTreeRequest), and opens it if it has children
 * (that click never closes it); clicking a node that cannot (a folder, a node with children
 * under `choose: 'leaves'`) opens or closes it. The keyboard is antd Tree's: the arrows move
 * and open or close; Enter or Space chooses the active row as a click does (opening a node
 * with children), and Enter opens or closes a folder. An `optional` field has a first row, the
 * definition's `placeholder` (else `texts.none`), that requests `''` and shows selected while
 * the value is empty.
 *
 * Expansion starts from `field.expandedKeys` (the field's `expand`); the user opens and closes
 * nodes. The list follows the value: when it changes (previous / next buttons, the URL), its
 * ancestors open, the user's own expansion kept, and its row scrolls into view (`'nearest'`).
 *
 * Links: where `field.hrefFor` gives an href for a node that can be chosen (a stored field over
 * a URL store), its title is a link (`<a href>`), while the field is enabled and no commit is
 * pending (otherwise plain text). A plain click requests the node as any click does, the
 * browser not following the link; a click with Ctrl, Cmd, Shift or Alt, or the middle button,
 * is left to the browser and requests nothing. The optional row links to `''` likewise.
 *
 * `search` adds ManyOfTreeChecklist's search box (placeholder `texts.search`, named
 * "<search> <label>"): the nodes filterTree keeps, accent- and case-insensitive (the matches,
 * their ancestors, a match's whole subtree), every kept node open (the user may still close
 * one; any change to the query opens them all again), the expansion from before coming back
 * after the search. The other nodes and the optional row are only hidden: a search hiding the
 * current node keeps the value, and the keyboard never lands on a hidden row (the active row
 * moves on to the next shown one the way the key went). No match shows antd's empty notice.
 * The search only filters the view, so it stays usable while the field is disabled.
 *
 * The field's label is the tree's accessible name; a pending commit disables the tree (and
 * shows the lent Spinner, or antd's own, by the search box). Tooltips are held back while a
 * confirmation is asking.
 */
export function OneOfTreeList<T extends string>({
  field, search = false, style, nested = false, onChosen,
}: OneOfTreeListProps<T> & InternalOneOfTreeListProps) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useOneOfTreeRequest(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<T[]>(field.expandedKeys);
  /** The user's own expansion under the current query; null opens every kept node. */
  const [searchExpanded, setSearchExpanded] = useState<T[] | null>(null);
  /** The keyboard's active row (rc-tree's `activeKey`), always a shown one. */
  const [active, setActive] = useState<T | '' | null>(null);
  /** Which way the last key moves the active row: 1 down (and on focus), -1 up. */
  const travel = useRef<1 | -1>(1);
  const root = useRef<HTMLDivElement>(null);

  // Following the value: when it changes, its ancestors join the expansion, set while
  // rendering so the tree never shows the new value under a closed node...
  const [followed, setFollowed] = useState(field.value);
  if (followed !== field.value) {
    setFollowed(field.value);
    const ancestors = field.path.slice(0, -1).map((node) => node.value);
    setExpanded((keys) => [...keys, ...ancestors.filter((key) => !keys.includes(key))]);
  }
  // ...and its row scrolls into view once shown (not on mount: the page is the reader's).
  const scrolledTo = useRef(field.value);
  useEffect(() => {
    if (scrolledTo.current === field.value) return;
    const value = field.value;
    scrolledTo.current = value;
    // After this commit's work: rc-tree adds the rows an expansion shows in a layout effect of
    // its own, re-rendering only once this effect has run.
    queueMicrotask(() => {
      const rows = root.current?.querySelectorAll<HTMLElement>('[role="treeitem"][data-value]') ?? [];
      Array.from(rows).find((row) => row.dataset.value === value)?.scrollIntoView?.({ block: 'nearest' });
    });
  }, [field.value]);

  const kept = useMemo(
    () => (search && query.trim() !== '' ? collectValues(filterTree(field.nodes, query)) : undefined),
    [search, field.nodes, query],
  );
  const linking = field.enabled && !field.pending;
  // The same tree data while the field and the search stay the same: a re-render of its own
  // (the keyboard's active row) would otherwise hand rc-tree new data, cutting short a node's
  // opening or closing.
  const data = useMemo(() => {
    const hrefFor = linking ? field.hrefFor : undefined;
    const rows = listRows(treeData(field.nodes, {
      noteStyle: 'brackets', tooltips: field.enabled, holdTooltips: asking, shown: kept?.all,
    }), field.byValue, hrefFor);
    if (!field.optional) return rows;
    const label = field.placeholder || texts.none;
    const href = hrefFor?.('');
    const title = <span>{label}</span>;
    const none: ListDataNode<T> = {
      key: '', value: '', label, disabled: false, 'data-value': '',
      title: typeof href === 'string' ? rowLink(href, title) : title,
      style: kept ? { display: 'none' } : undefined,
    };
    return [none, ...rows];
  }, [field.nodes, field.byValue, field.enabled, field.optional, field.placeholder, field.hrefFor, linking, asking, kept, texts.none]);
  if (!field.visible) return null;

  const disabled = !field.enabled || field.pending;
  const expandedKeys = !kept ? expanded : searchExpanded ?? kept.parents;
  const setExpandedKeys = (keys: T[]) => (kept ? setSearchExpanded(keys) : setExpanded(keys));
  const selectedKeys: (T | '')[] = field.current ? [field.current.value] : field.optional && field.value === '' ? [''] : [];
  /** Whether a row is shown: every row but while searching, when the kept nodes are (the optional row is not). */
  const isShown = (key: T | '') => !kept || (key !== '' && kept.all.has(key));

  /** A row chosen (a click, the keyboard): requests its value, opening a node with children. */
  const choose = (key: T | '') => {
    const node = key === '' ? undefined : field.byValue.get(key);
    if (node?.children?.length && !expandedKeys.includes(node.value)) setExpandedKeys([...expandedKeys, node.value]);
    if (request(key) || key === field.value) onChosen?.();
  };

  // rc-tree's keyboard walks every row in its list, hidden or not (focus activates the
  // selected or the first): an active row the search hides is moved on to the next shown one
  // the way the key went.
  const activate = (key: T | '' | null) => {
    if (key === null || isShown(key)) {
      setActive(key);
      return;
    }
    const order: (T | '')[] = [...(field.optional ? ['' as const] : []), ...openOrder(field.nodes, new Set(expandedKeys))];
    const from = order.indexOf(key);
    let next: T | '' | null = null;
    for (let step = 1; step < order.length && next === null; step += 1) {
      const candidate = order[(from + travel.current * step + order.length) % order.length];
      if (isShown(candidate)) next = candidate;
    }
    setActive(next);
  };

  const tree = (
    <Tree<ListDataNode<T>>
      blockNode
      switcherIcon={<TreeSwitcherIcon />}
      disabled={disabled}
      treeData={data}
      selectedKeys={selectedKeys}
      expandedKeys={expandedKeys}
      onExpand={(keys) => setExpandedKeys(keys as T[])}
      // A click on a row that can be chosen, the row selected or not, and Enter or Space on one.
      onSelect={(_, { node }) => choose(node.key as T | '')}
      // A click on any row, before the selection: a node that cannot be chosen opens or closes.
      onClick={(_, { key }) => {
        const node = field.byValue.get(key as T);
        if (!node || node.choosable || !node.children?.length) return;
        setExpandedKeys(expandedKeys.includes(node.value)
          ? expandedKeys.filter((k) => k !== node.value)
          : [...expandedKeys, node.value]);
      }}
      activeKey={active !== null && isShown(active) ? active : null}
      onActiveChange={(key) => activate((key ?? null) as T | '' | null)}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
    />
  );
  const control = (
    <div
      ref={root}
      data-field-id={nested ? undefined : field.id}
      data-value={nested ? undefined : field.value}
      style={style}
      onFocusCapture={() => { travel.current = 1; }}
      onKeyDownCapture={(e) => {
        travel.current = e.key === 'ArrowUp' || e.key === 'End' ? -1 : 1;
        // Enter on the tree chooses its active row as a click does: rc-tree's own Enter would
        // open or close a node with children instead, and skip the row already chosen. A
        // folder's Enter stays rc-tree's (it opens or closes).
        const choosable = active === '' || (active !== null && !!field.byValue.get(active)?.choosable);
        if (e.key === 'Enter' && !disabled && choosable && (e.target as Element).getAttribute('role') === 'tree') {
          e.preventDefault();
          e.stopPropagation();
          choose(active!);
        }
      }}
    >
      {search && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Input
            allowClear
            placeholder={texts.search}
            aria-label={[texts.search, field.label].filter(Boolean).join(' ')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchExpanded(null);
            }}
          />
          {field.pending && (Spinner
            ? <Spinner spinnerKey={spinnerKey} size="small" />
            : <Spin size="small" />)}
        </div>
      )}
      {kept && kept.all.size === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : tree}
    </div>
  );
  // The anchor is always there (stable), so the tree keeps its identity, and the keyboard
  // focus, as the field turns disabled and back; the field's own tooltip shows only then (the
  // rows have theirs).
  return wrap(withTooltip(field.enabled ? undefined : fieldTooltip(tipField, texts), !field.enabled, control, {
    open: asking ? false : undefined,
    block: true,
    stable: true,
    style,
  }));
}
