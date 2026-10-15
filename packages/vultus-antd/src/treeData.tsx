import type { CSSProperties, ReactNode } from 'react';
import type { TreeNodeControls } from 'vultus-core';
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
  children?: FieldTreeDataNode<T>[];
  style?: CSSProperties;
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
  /**
   * The nodes to show (a search's); any other node is hidden but stays in the
   * tree, so antd's check conduction still runs over the whole tree. Default:
   * every node.
   */
  shown?: Set<T>;
}

/**
 * A tree field's nodes (useTreeField's `nodes`) as antd tree data, shared by
 * TreeChecklist and TreePicker. Each node's title is its label (ChoiceLabel:
 * in the description colour while dimmed) and note (ChoiceNote, placed by
 * `noteStyle`), with the node's own tooltip (choiceTooltip: a disabled node's
 * reason first, then its description); a disabled node is disabled.
 */
export function treeData<T extends string>(nodes: TreeNodeControls<T>[], options: TreeDataOptions<T>): FieldTreeDataNode<T>[] {
  const { noteStyle, tooltips = true, holdTooltips = false, shown } = options;
  const map = (node: TreeNodeControls<T>): FieldTreeDataNode<T> => {
    const title = noteStyle === 'aside'
      ? <ChoiceRow choice={node} />
      : <span><ChoiceLabel choice={node} />{node.note && <> <ChoiceNote note={`(${node.note})`} /></>}</span>;
    return {
      key: node.value,
      value: node.value,
      label: node.label,
      title: withTooltip(tooltips ? choiceTooltip(node) : undefined, !node.enabled, title, {
        open: holdTooltips ? false : undefined,
        block: noteStyle === 'aside',
      }),
      disabled: !node.enabled,
      children: node.children?.map(map),
      style: shown && !shown.has(node.value) ? { display: 'none' } : undefined,
    };
  };
  return nodes.map(map);
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
