import { Empty, Tree } from 'antd';
import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent,
} from 'react';
import { filterTree, type OneOfTreeFieldControls, type OneOfTreeNodeControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedTreeStyles } from './pendingLock.js';
import { useVultusTexts } from './texts.js';
import {
  collectValues, nextShown, openOrder, treeData, TreeSearchBox, TreeSwitcherIcon, type FieldTreeDataNode,
} from './treeData.js';
import { useOneOfTreeRequest } from './useOneOfTreeRequest.js';
import { useShownNodes } from './useShownNodes.js';
import { withTooltip } from './WithReason.js';

export interface OneOfTreeListProps<T extends string> {
  field: OneOfTreeFieldControls<T>;
  /** A search box above the tree, filtering its nodes by label as ManyOfTreeChecklist's; default off. */
  search?: boolean;
  /** The list's style; its width and layout keys (flex, margins) go to the tooltip anchor around it (see withTooltip). */
  style?: CSSProperties;
}

/** OneOfTreeList's props for vultus-antd's own widgets only: not in OneOfTreeListProps, not exported. */
interface InternalOneOfTreeListProps<T extends string> {
  /**
   * @internal Leaves `data-field-id` and `data-value` off the root: the list is
   * part of another widget of the same field (OneOfTreePicker's drawer), whose
   * own root carries them, so the field's id stays unique in the document. The
   * rows keep their `data-value`.
   */
  nested?: boolean;
  /**
   * @internal Called with the row's value after a click (or the keyboard)
   * chose it: the request was taken, or the row is the value already
   * (`value === field.value` then — `request` refuses it as equal, so
   * nothing was requested). OneOfTreePicker's drawer uses the value to decide
   * whether to close without looking at the DOM for an open confirmation. Not
   * after a folder's click, nor after a click left to the browser.
   */
  onChosen?: (value: T | '') => void;
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
 * and in the tree's text colour; a click still focuses it, and Enter there is the tree's (see
 * OneOfTreeList's root), never the link's.
 *
 * `href` is the link as of the tree data's last build; the URL may have changed since without the
 * data being rebuilt (a new value, another query parameter, the path), so whenever the link may
 * be used — the pointer entering it, its focus, a button pressed on it (the middle one's
 * auxclick comes after), a touch or pen put down on it (a long press's "open in new tab" fires no
 * mouse event), its context menu ("open in new tab", "copy link"), a modified click before its
 * default — it takes `fresh()` (`field.hrefFor` asked again: a URL store answers from the URL as
 * it is then).
 *
 * While `locked` (the field's isLocked) the link stays, so one with the focus keeps it, and is
 * said unavailable; a click, modified or not, and the middle button's auxclick have their
 * default prevented, so neither follows it (no new tab either). Its context menu and a long
 * press still offer "open in new tab".
 */
function rowLink(href: string, title: ReactNode, fresh: () => string | undefined, locked: boolean): ReactNode {
  const refresh = (e: SyntheticEvent<HTMLAnchorElement>) => {
    const next = fresh();
    if (typeof next === 'string') e.currentTarget.href = next;
  };
  return (
    <a
      href={href}
      tabIndex={-1}
      style={{ color: 'inherit' }}
      aria-disabled={locked || undefined}
      onMouseEnter={refresh}
      onFocus={refresh}
      onMouseDown={refresh}
      onPointerDown={refresh}
      onTouchStart={refresh}
      onContextMenu={refresh}
      onClick={(e) => {
        if (!locked && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) {
          refresh(e);
          e.stopPropagation();
        } else e.preventDefault();
      }}
      onAuxClick={locked ? (e) => e.preventDefault() : undefined}
    >
      {title}
    </a>
  );
}

/**
 * The values of the value's ancestors (the nodes `onPath`), for the rows' titles. They come
 * through this context, not the tree data, so a new value alone leaves the data as it is: antd's
 * Tree then renders its rows once, where new data (or a new expansion) has rc-tree re-flatten
 * them and render every row four times over.
 */
const OnPathContext = createContext<ReadonlySet<string>>(new Set());

/** A row's title, in strong text while its node is an ancestor of the value (OnPathContext). */
function PathTitle({ value, children }: { value: string; children: ReactNode }) {
  return useContext(OnPathContext).has(value) ? <strong>{children}</strong> : <>{children}</>;
}

/**
 * treeData's rows (made from `nodes`, row for node) as the list shows them: each with its
 * `data-value`, its title strong while the node is an ancestor of the value (PathTitle), and a
 * node that can be chosen a link where `hrefFor` gives one (going nowhere while `locked`).
 */
function listRows<T extends string>(
  rows: FieldTreeDataNode<T>[],
  nodes: OneOfTreeNodeControls<T>[],
  hrefFor: ((value: T) => string | undefined) | undefined,
  locked: boolean,
): ListDataNode<T>[] {
  return rows.map((row, i) => {
    const node = nodes[i];
    const title = <PathTitle value={row.value}>{row.title}</PathTitle>;
    const href = node.choosable ? hrefFor?.(row.value) : undefined;
    return {
      ...row,
      title: typeof href === 'string' ? rowLink(href, title, () => hrefFor?.(row.value), locked) : title,
      'data-value': row.value,
      children: row.children && listRows(row.children, node.children ?? [], hrefFor, locked),
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
 * under `choose: 'leaves'`) opens or closes it. While the field is disabled the list can still
 * be browsed: a click on any node with children opens or closes it, and nothing is chosen.
 * The keyboard is antd Tree's: the arrows move and open or close; Enter or Space chooses the
 * active row as a click does (opening a node with children), and Enter opens or closes a
 * folder. Enter is the tree's even while a row's link has the focus (as after a click on it):
 * it acts on the active row, never following the link. An `optional` field has a first row, the
 * definition's `placeholder` (else `texts.none`), that requests `''` and shows selected while
 * the value is empty.
 *
 * Expansion starts from `field.expandedKeys` (the field's `expand`); the user opens and closes
 * nodes. The list follows the value: when it changes (previous / next buttons, the URL), its
 * ancestors open, the user's own expansion kept, and its row scrolls into view (`'nearest'`).
 *
 * Links: where `field.hrefFor` gives an href for a node that can be chosen (a stored field over
 * a URL store), its title is a link (`<a href>`), while the field is enabled (otherwise plain
 * text). A plain click requests the node as any click does, the browser not following the link;
 * a click with Ctrl, Cmd, Shift or Alt, or the middle button, is left to the browser and
 * requests nothing. While the field is locked (pending) a link stays, so a focused one keeps
 * the focus, but a click (modified or not) or the middle button follows nothing; its context
 * menu can still open it in a new tab. The optional row links to `''` likewise. A row's `href`
 * is the one the tree data was last built with (a new value alone does not rebuild it; see
 * Rendering). A link asks `field.hrefFor` again whenever it may be used (the pointer entering
 * it, its focus, a button, a touch or a pen put down on it, its context menu, a modified click),
 * so it follows the URL as it is then (a new value, another parameter of the query, the path).
 *
 * Rendering: a new value alone (a click, the previous / next buttons, the URL) hands antd's Tree
 * the same tree data and, while the value's ancestors are open already, the same expansion:
 * rc-tree renders the rows once, and their titles and links are not rebuilt; the strong path
 * reaches the titles through a context. The tree data, with each link's href, is rebuilt when a
 * node would show something else (its label, note, tooltip, icon, ...; compared by identity, see
 * useShownNodes: a `nodes` function building icon elements anew rebuilds it on every render), when
 * the field is enabled or disabled, when it locks or unlocks (pending), when `field.hrefFor` is
 * a new function (vultus-core's stores and field groups keep theirs), and when the search or a
 * confirmation changes.
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
 * The field's label is the tree's accessible name. While the field is pending (a commit runs,
 * or its `pending` option says the app is busy) the tree is locked (isLocked): it keeps its tab
 * stop and the keyboard focus, and its links; it is said unavailable; its titles look disabled
 * (useLockedTreeStyles); its rows are not disabled, so each keeps its state for a screen reader
 * (the current one `aria-selected`), but they choose nothing, a click, Space or Enter alike,
 * while the arrows still move and a folder still opens and closes; the lent Spinner (or
 * antd's own) shows by the search box. Tooltips are held back while a confirmation is asking.
 */
export function OneOfTreeList<T extends string>({
  field, search = false, style, nested = false, onChosen,
}: OneOfTreeListProps<T> & InternalOneOfTreeListProps<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useOneOfTreeRequest(field);
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
  const ancestors = field.path.slice(0, -1).map((node) => node.value);
  const [followed, setFollowed] = useState(field.value);
  if (followed !== field.value) {
    setFollowed(field.value);
    // The same keys while every ancestor is open already: new ones make rc-tree re-flatten its
    // rows and render them all again, four times over.
    setExpanded((keys) => {
      const closed = ancestors.filter((key) => !keys.includes(key));
      return closed.length === 0 ? keys : [...keys, ...closed];
    });
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

  // The nodes as their rows show them: the same list across a new value alone (vultus-core builds
  // the nodes afresh on every render). Only their shown fields are read here (useShownNodes).
  const nodes = useShownNodes(field.nodes);
  const kept = useMemo(
    () => (search && query.trim() !== '' ? collectValues(filterTree(nodes, query)) : undefined),
    [search, nodes, query],
  );
  const locked = isLocked(field);
  // The same tree data while the nodes as shown, the field and the search stay the same: a new
  // value alone changes only the selected row and the strong path (OnPathContext), and a
  // re-render of the list's own (the keyboard's active row) would otherwise hand rc-tree new
  // data, cutting short a node's opening or closing.
  const data = useMemo(() => {
    const hrefFor = field.enabled ? field.hrefFor : undefined;
    const rows = listRows(treeData(nodes, {
      noteStyle: 'brackets', tooltips: field.enabled, holdTooltips: asking, shown: kept?.all,
    }), nodes, hrefFor, locked);
    if (!field.optional) return rows;
    const label = field.placeholder || texts.none;
    const href = hrefFor?.('');
    const title = <span>{label}</span>;
    const none: ListDataNode<T> = {
      key: '', value: '', label, disabled: false, 'data-value': '',
      title: typeof href === 'string' ? rowLink(href, title, () => hrefFor?.(''), locked) : title,
      style: kept ? { display: 'none' } : undefined,
    };
    return [none, ...rows];
  }, [nodes, field.enabled, field.optional, field.placeholder, field.hrefFor, locked, asking, kept, texts.none]);
  const lockedStyles = useLockedTreeStyles(locked);
  const currentValue = field.current?.value;
  const selectedKeys = useMemo<(T | '')[]>(
    () => (currentValue !== undefined ? [currentValue] : field.optional && field.value === '' ? [''] : []),
    [currentValue, field.optional, field.value],
  );
  // The strong path: the same set while the value's ancestors stay the same (a sibling chosen).
  const ancestorsKey = JSON.stringify(ancestors);
  const onPath = useMemo<ReadonlySet<string>>(() => new Set(JSON.parse(ancestorsKey) as string[]), [ancestorsKey]);
  if (!field.visible) return null;

  const expandedKeys = !kept ? expanded : searchExpanded ?? kept.parents;
  const setExpandedKeys = (keys: T[]) => (kept ? setSearchExpanded(keys) : setExpanded(keys));
  /** Whether a row is shown: every row but while searching, when the kept nodes are (the optional row is not). */
  const isShown = (key: T | '') => !kept || (key !== '' && kept.all.has(key));

  /** A row chosen (a click, the keyboard): requests its value, opening a node with children; nothing while locked. */
  const choose = (key: T | '') => {
    if (locked) return;
    const node = key === '' ? undefined : field.byValue.get(key);
    if (node?.children?.length && !expandedKeys.includes(node.value)) setExpandedKeys([...expandedKeys, node.value]);
    if (request(key) || key === field.value) onChosen?.(key);
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
    setActive(nextShown(order, key, travel.current, isShown));
  };

  const tree = (
    <OnPathContext.Provider value={onPath}>
      <Tree<ListDataNode<T>>
        blockNode
        switcherIcon={<TreeSwitcherIcon />}
        // Locked, only the titles look disabled (useLockedTreeStyles): the tree keeps its tab
        // stop and each row its state; choose() takes no row.
        disabled={!field.enabled}
        aria-disabled={locked || undefined}
        styles={lockedStyles}
        treeData={data}
        selectedKeys={selectedKeys}
        expandedKeys={expandedKeys}
        onExpand={(keys) => setExpandedKeys(keys as T[])}
        // A click on a row that can be chosen, the row selected or not, and Enter or Space on one.
        onSelect={(_, { node }) => choose(node.key as T | '')}
        // A click on any row, before the selection: a node with children that cannot be chosen
        // opens or closes, and while the field is disabled any node with children does (browsing).
        onClick={(_, { key }) => {
          const node = field.byValue.get(key as T);
          if (!node?.children?.length || (node.choosable && field.enabled)) return;
          setExpandedKeys(expandedKeys.includes(node.value)
            ? expandedKeys.filter((k) => k !== node.value)
            : [...expandedKeys, node.value]);
        }}
        activeKey={active !== null && isShown(active) ? active : null}
        onActiveChange={(key) => activate((key ?? null) as T | '' | null)}
        aria-label={field.label || undefined}
        aria-description={fieldAccessibleDescription(field, texts)}
      />
    </OnPathContext.Provider>
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
        // Locked, Space on the tree chooses nothing (choose), nor scrolls the page, as antd
        // lets it do on a row it will not select (a folder).
        if (locked && e.key === ' ' && (e.target as Element).closest('[role="tree"]')) e.preventDefault();
        // Enter in the tree is the tree's, wherever the focus is in it: on the tree, or on a
        // row's link, which keeps the focus after a click (the browser does not follow that
        // link: the keys move the active row, not the focus). It chooses the active row as a
        // click does; rc-tree's own Enter would open or close a node with children instead, and
        // skip the row already chosen. Enter on a folder (or with no shown row active) stays
        // rc-tree's: it opens or closes the folder. While locked, Enter on a row that can be
        // chosen does nothing (choose).
        if (e.key !== 'Enter' || !(e.target as Element).closest('[role="tree"]')) return;
        e.preventDefault();
        if (!field.enabled || active === null || !isShown(active)) return;
        if (active !== '' && !field.byValue.get(active)?.choosable) return;
        e.stopPropagation();
        choose(active);
      }}
    >
      {search && (
        <TreeSearchBox
          field={field}
          query={query}
          onSearch={(next) => {
            setQuery(next);
            setSearchExpanded(null);
          }}
        />
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
