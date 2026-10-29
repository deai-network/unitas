import { ConfigProvider } from 'antd';
import { useContext } from 'react';

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
