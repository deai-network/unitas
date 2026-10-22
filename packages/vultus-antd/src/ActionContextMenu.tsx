import type { ReactElement } from 'react';
import { Dropdown } from 'antd';
import type { ActionStatus } from 'vultus-core';
import { useActionMenu } from './useActionMenu.js';

interface Props {
  // The menu's actions, as CombinedActionButton's: one row each, in order.
  actions: ActionStatus[];
  // The one element the menu opens on (a link, a segment): any element that
  // takes a ref and event handlers.
  children: ReactElement;
}

/**
 * A right-click menu of actions on one child element. A right click on the
 * child (or the keyboard's menu key, or Shift+F10, while it has the focus)
 * opens the rows at the pointer instead of the browser's own menu; the child's
 * own handlers stay its own (its left click is its business). The rows and the
 * confirmations are CombinedActionButton's (useActionMenu): a popconfirm points
 * at the child. A pending action's row is disabled, the spinner as its icon.
 * With no visible action the child renders alone: no menu, and the browser's
 * own is not suppressed.
 */
export function ActionContextMenu({ actions, children }: Props) {
  const menu = useActionMenu(actions, { pendingRows: true });

  if (menu.visible.length === 0) return children;

  return (
    <>
      {menu.anchor(
        // antd puts the menu at the pointer for a contextMenu trigger
        // (alignPoint), and prevents the browser's own menu.
        <Dropdown trigger={['contextMenu']} menu={{ items: menu.items }}>
          {children}
        </Dropdown>,
      )}
      {menu.dialogs}
    </>
  );
}
