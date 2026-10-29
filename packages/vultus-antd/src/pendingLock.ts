import { ConfigProvider, theme } from 'antd';
import { useContext, type CSSProperties } from 'react';

/**
 * Whether a field widget is locked: its field is enabled and pending (a
 * commit runs, or its `pending` option says the app is busy with it). A
 * locked widget is not `disabled`, so the keyboard focus stays on it (a
 * browser moves the focus off a disabled element). It is said to be
 * unavailable (`aria-disabled="true"` on its focusable or role element),
 * keeps the look `disabled` gave it (antd's disabled colours and the
 * not-allowed cursor, through the antd control's own props and theme
 * tokens) and changes nothing: the request hooks refuse while pending, and
 * whatever the antd control keeps on its own is held. When pending ends it
 * is back to normal, the focus where the user left it. A field that is not
 * enabled is disabled as ever, pending or not.
 */
export function isLocked(field: { enabled: boolean; pending: boolean }): boolean {
  return field.enabled && field.pending;
}

/**
 * A locked antd Checkbox's `classNames` (undefined when not `locked`):
 * antd's own disabled classes on its wrapper and its box, under the app's
 * prefix (ConfigProvider's `prefixCls`), so it keeps the whole disabled
 * look: box, checkmark, label and cursor. The checkmark is the box's
 * `::after`, which no `styles` entry reaches; tokens alone would leave it
 * white on the disabled background.
 */
export function useLockedCheckboxClassNames(locked: boolean): { root: string; icon: string } | undefined {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  if (!locked) return undefined;
  const prefix = getPrefixCls('checkbox');
  return { root: `${prefix}-wrapper-disabled`, icon: `${prefix}-disabled` };
}

/**
 * A locked antd Select's or TreeSelect's look, through theme tokens: the look
 * `disabled` gave it. `style` goes into the control's `style` (a TreeSelect
 * also hands `styles.root` to its popup): antd's disabled text colour and
 * background, the not-allowed cursor. `styles` is its `styles`: the same
 * colour and cursor on its search input, and no remove icon on its tags (a
 * disabled select's have none). Both undefined when not `locked`. The clear
 * icon goes with `allowClear`, which a locked widget turns off, as `disabled`
 * does. The focus ring stays: the focus does.
 */
export function useLockedSelectLook(locked: boolean): {
  style?: CSSProperties;
  styles?: { input: CSSProperties; itemRemove: CSSProperties };
} {
  const { token } = theme.useToken();
  if (!locked) return {};
  const text: CSSProperties = { color: token.colorTextDisabled, cursor: 'not-allowed' };
  return {
    style: { ...text, background: token.colorBgContainerDisabled },
    styles: { input: text, itemRemove: { display: 'none' } },
  };
}

/**
 * A locked tree's data (antd Tree's `treeData`): every node disabled, so the
 * rows keep the look `disabled` gave them, antd's own disabled rows and
 * checkboxes (the checkmark is the checkbox's `::after`, which no `styles`
 * entry reaches, and a tree's checkbox takes no `classNames` either), and
 * antd takes no check or selection on them. The Tree itself is not
 * disabled: it keeps its tab stop and the keyboard focus, its arrows still
 * moving over the rows. `nodes` as they are when not `locked`.
 */
export function lockTreeData<N extends { disabled?: boolean; children?: N[] }>(nodes: N[], locked: boolean): N[] {
  if (!locked) return nodes;
  return nodes.map((node) => ({ ...node, disabled: true, children: node.children && lockTreeData(node.children, true) }));
}
