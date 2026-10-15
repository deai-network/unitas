import type { TooltipProps } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { normalizeText, type OneOfChoiceControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { ChoiceNote, ChoiceRow } from './ChoiceNote.js';
import { choiceTooltip } from './fieldTooltip.js';
import { withTooltip } from './WithReason.js';

/**
 * A tree field's node as antd's tree components take it (Tree's and
 * TreeSelect's `treeData`): `key` and `value` the node's value, `label` its
 * label as plain text (for TreeSelect's tags and search), `title` what the
 * tree shows.
 */
export interface FieldTreeDataNode<T extends string = string> {
  key: T;
  value: T;
  label: string;
  title: ReactNode;
  disabled: boolean;
  /** Whether a click chooses the node (antd's default, true) or only opens or closes it: a one-of tree's node that cannot be chosen. */
  selectable?: boolean;
  children?: FieldTreeDataNode<T>[];
  style?: CSSProperties;
}

/**
 * A node as treeData takes it: a resolved choice with children of the same kind (a many-of
 * tree's TreeNodeControls, a one-of tree's OneOfTreeNodeControls) and, in a one-of tree,
 * whether the field may choose it.
 */
export interface ChoiceTreeNode<T extends string = string> extends OneOfChoiceControls<T> {
  children: ChoiceTreeNode<T>[] | undefined;
  choosable?: boolean;
}

export interface TreeDataOptions<T extends string> {
  /**
   * Where a node's note goes: `'aside'` right-aligned, across the row (a
   * dropdown, as ChoiceRow); `'brackets'` after the label, "Kombinatorika
   * (4)" (an always-open tree, a phone panel).
   */
  noteStyle: 'aside' | 'brackets';
  /** Show each node's own tooltip (choiceTooltip); default true. False while the field is disabled, whose own tooltip covers the control. */
  tooltips?: boolean;
  /** Hold the nodes' tooltips back (a confirmation is open). */
  holdTooltips?: boolean;
  /** Where the nodes' tooltips open; default antd's (above). A dropdown's open to the side (`'right'`), clear of the rows above. */
  tooltipPlacement?: TooltipProps['placement'];
  /**
   * The nodes to show (a search's); any other node is hidden but stays in the
   * tree, so antd's check conduction still runs over the whole tree. Default:
   * every node.
   */
  shown?: Set<T>;
}

/**
 * A tree field's nodes (useManyOfTreeField's or useOneOfTreeField's `nodes`) as antd tree data,
 * shared by the tree widgets (ManyOfTreeChecklist, ManyOfTreePicker, OneOfTreePicker). Each
 * node's title is its label (ChoiceLabel: in the description colour while dimmed) and note
 * (ChoiceNote, placed by `noteStyle`), with the node's own tooltip (choiceTooltip: a disabled
 * node's reason first, then its description); a disabled node is disabled. A one-of tree's
 * node is `selectable` as it is `choosable`, so a click on one that cannot be chosen only
 * opens or closes it.
 */
export function treeData<T extends string>(nodes: ChoiceTreeNode<T>[], options: TreeDataOptions<T>): FieldTreeDataNode<T>[] {
  const { noteStyle, tooltips = true, holdTooltips = false, tooltipPlacement, shown } = options;
  const map = (node: ChoiceTreeNode<T>): FieldTreeDataNode<T> => {
    const title = noteStyle === 'aside'
      ? <ChoiceRow choice={node} />
      : <span><ChoiceLabel choice={node} />{node.note && <> <ChoiceNote note={`(${node.note})`} /></>}</span>;
    return {
      key: node.value,
      value: node.value,
      label: node.label,
      title: withTooltip(tooltips ? choiceTooltip(node) : undefined, !node.enabled, title, {
        open: holdTooltips ? false : undefined,
        placement: tooltipPlacement,
        block: noteStyle === 'aside',
      }),
      disabled: !node.enabled,
      ...(node.choosable !== undefined ? { selectable: node.choosable } : {}),
      children: node.children?.map(map),
      style: shown && !shown.has(node.value) ? { display: 'none' } : undefined,
    };
  };
  return nodes.map(map);
}

/**
 * Whether a tree data node's label holds a search, accent- and case-insensitive, ignoring the
 * search's surrounding spaces (as vultus-core's filterTree): TreeSelect's `filterTreeNode` in
 * the tree pickers' search.
 */
export function labelMatches(search: string, node: Record<string, unknown>): boolean {
  return normalizeText(String(node.label ?? '')).includes(normalizeText(search.trim()));
}

/**
 * The switcher (open/close) caret for antd's trees: antd's CaretDownFilled,
 * inlined (no @ant-design/icons dependency) and hidden from assistive tech;
 * antd's own carries `aria-label="caret-down"`, which reads into every parent
 * node's name ("caret-down Algebra (12)"). antd rotates it while closed.
 */
export function TreeSwitcherIcon({ className }: { className?: string }) {
  return (
    <span className={`anticon anticon-caret-down${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 1024 1024" focusable="false" data-icon="caret-down" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path d="M840.4 300H183.6c-19.7 0-30.7 20.8-18.5 35l328.4 380.8c9.4 10.9 27.5 10.9 37 0L858.9 335c12.2-14.2 1.2-35-18.5-35z" />
      </svg>
    </span>
  );
}
