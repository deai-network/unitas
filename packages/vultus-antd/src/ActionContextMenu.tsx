import { useId, useRef, type ReactElement } from 'react';
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
 * opens the rows at the pointer instead of the browser's own menu, and the
 * menu takes the focus; when it closes with the focus in it (Escape, a pick),
 * the focus goes back to the child. The child's own handlers stay its own (its
 * left click is its business). The rows and the confirmations are
 * CombinedActionButton's (useActionMenu): a popconfirm points at the child. A
 * pending action's row shows the spinner as its icon and, while the action is
 * enabled, is locked (isActionLocked): it keeps the keyboard focus, is said
 * unavailable, looks disabled, and picking it does nothing. With no visible
 * action the child renders alone: no menu, and the browser's own is not
 * suppressed.
 */
export function ActionContextMenu({ actions, children }: Props) {
  const menu = useActionMenu(actions, { pendingRows: true });
  // What the Dropdown's ref reaches: the child's own (an element, or the
  // handle of a component such as an antd Tooltip).
  const childRef = useRef<HTMLElement>(null);
  const menuId = useId();

  if (menu.visible.length === 0) return children;

  // The menu closes with the focus in it: give the focus back to the child.
  // rc-dropdown would do so on Escape, but only for a child whose ref has a
  // `focus` (not a Tooltip's), and the popup's own Escape handling closes it
  // first. A menu that closes once the focus has left it (a scroll, say) leaves
  // the focus where it is. Without scrolling: the child may sit out of view in a
  // scrolling box (a wide bar's segment), and the page should not jump to it.
  const onOpenChange = (open: boolean) => {
    if (open) return;
    const list = document.getElementById(menuId);
    if (list?.contains(document.activeElement)) elementOf(childRef.current)?.focus({ preventScroll: true });
  };

  return (
    <>
      {menu.anchor(
        // antd puts the menu at the pointer for a contextMenu trigger
        // (alignPoint), and prevents the browser's own menu. The menu takes
        // the focus as it opens (its first row), so a menu opened from the
        // keyboard goes on by the keyboard.
        <Dropdown
          ref={childRef}
          trigger={['contextMenu']}
          autoFocus
          menu={{ items: menu.items, id: menuId }}
          onOpenChange={onOpenChange}
        >
          {children}
        </Dropdown>,
      )}
      {menu.dialogs}
    </>
  );
}

// The child's DOM element from what its ref holds: the element itself, or a
// component's handle naming it (`nativeElement`: an antd Tooltip's, a
// trigger's).
function elementOf(handle: unknown): HTMLElement | null {
  if (handle instanceof HTMLElement) return handle;
  const native = (handle as { nativeElement?: unknown } | null)?.nativeElement;
  return native instanceof HTMLElement ? native : null;
}
