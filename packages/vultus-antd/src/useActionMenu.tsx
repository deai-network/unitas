import { useContext, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { ConfigProvider, Modal, Popconfirm, Spin, Tooltip, theme, type MenuProps } from 'antd';
import { useSpinnerKey, useVultusComponents, type ActionStatus } from 'vultus-core';
import { ConfirmTypingModal } from './ConfirmTypingModal.js';
import { alignToJustifyContent } from './ActionButton.js';
import { isActionLocked } from './pendingLock.js';
import { ReasonMarkdown } from './ReasonMarkdown.js';

export interface ActionMenuOptions {
  // Where each row's icon sits, and where each row's content sits within the
  // row: CombinedActionButton's `iconPlacement` and `align` (see there).
  iconPlacement?: 'start' | 'end';
  align?: 'start' | 'center' | 'end';
  // A pending action's row shows it, the spinner as its icon, and is locked
  // while the action is enabled (isActionLocked): not disabled, so the keyboard
  // focus stays on it, said unavailable, with the disabled look, and picking it
  // does nothing. On for ActionContextMenu, whose rows are the only place an
  // action shows; CombinedActionButton leaves it off (it shows the pending
  // state on its main half, and its rows stay as they were).
  pendingRows?: boolean;
  // Called with the action a row (or the caller's own control, through
  // `fire`) picks, before its confirmation is asked.
  onPick?: (action: ActionStatus) => void;
  // Called once the picked action has fired or its confirmation was dismissed.
  onSettle?: () => void;
}

export interface ActionMenu {
  // The actions that are not invisible, in order: the rows' actions.
  visible: ActionStatus[];
  // The rows, for antd's Menu (a Dropdown's `menu.items`), keyed by index.
  items: NonNullable<MenuProps['items']>;
  // Fires an action through its confirmation (the rows' own click handler).
  fire: (action: ActionStatus) => void;
  // Puts the popconfirm's anchor around a control: the bubble an action's
  // popconfirm confirmation opens points at it.
  anchor: (control: ReactElement, options?: { disabled?: boolean }) => ReactElement;
  // The cascade modal's holder and the typing confirmation's modal: rendered
  // once, beside the anchor.
  dialogs: ReactNode;
}

/**
 * A menu of actions, as CombinedActionButton's open list and ActionContextMenu
 * show it: the rows (label, icon, primary and danger while enabled, a disabled
 * action greyed with its reason in a tooltip, a pending one locked with
 * `pendingRows`, an invisible one left out) and
 * the confirmation flow a pick goes through (popconfirm on the caller's anchor,
 * cascade modal, typing confirmation). The caller renders `items` in its
 * Dropdown, wraps its control in `anchor` and renders `dialogs`.
 */
export function useActionMenu(actions: ActionStatus[], options: ActionMenuOptions = {}): ActionMenu {
  const { iconPlacement, align, pendingRows = false, onPick, onSettle } = options;
  const [askedId, setAskedId] = useState<string | null>(null);
  const [typingOpen, setTypingOpen] = useState(false);
  const [popconfirmOpen, setPopconfirmOpen] = useState(false);
  const { token } = theme.useToken();
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  // Hook-based confirm (not static Modal.confirm): it renders through
  // `modalHolder` inside the app's tree, so it follows the app's
  // ConfigProvider (theme, prefix, locale).
  const [modal, modalHolder] = Modal.useModal();

  const visible = actions.filter((a) => !a.invisible);
  // The action whose popconfirm or typing confirmation is (or was last) asked,
  // as it is now. Kept after the confirmation closes, so the closing bubble or
  // dialog keeps its text.
  const asked = askedId === null ? undefined : visible.find((a) => a.id === askedId);

  const settle = () => onSettle?.();

  // Fire an explicit action. Picking it (onPick) comes first, whether or not
  // the user follows through with its confirmation.
  const fire = (action: ActionStatus) => {
    if (action.disabled || action.pending) return;
    onPick?.(action);
    if (!action.confirmation) {
      action.fire();
      settle();
      return;
    }
    if (action.confirmation.kind === 'typing') {
      setAskedId(action.id);
      setTypingOpen(true);
      return;
    }
    if (action.confirmation.kind === 'cascade-modal') {
      const conf = action.confirmation;
      modal.confirm({
        title: conf.title,
        content: conf.content,
        okText: action.label,
        okButtonProps: { danger: action.variant === 'danger' },
        onOk: () => { action.fire(); settle(); },
        onCancel: settle,
      });
      return;
    }
    // popconfirm: open the controlled bubble on the anchor.
    setAskedId(action.id);
    setPopconfirmOpen(true);
  };

  const justifyContent = alignToJustifyContent(align);

  // A locked row's own props (pendingRows), which rc-menu hands to the row's
  // element: antd's own disabled class on it, under the app's prefix, for the
  // look a disabled row has (its colour, the not-allowed cursor, no hover
  // tint; the row the keyboard is on still shows it), and a pick held before
  // rc-menu sees it, which would pick the row (its fire refused) and close the
  // menu: a click, and Enter (rc-menu's own pick key), do nothing, the menu
  // staying open as it does for a disabled row.
  const hold = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const lockedRow: Pick<HTMLAttributes<HTMLLIElement>, 'className' | 'onClickCapture' | 'onKeyDownCapture'> = {
    className: `${getPrefixCls('dropdown')}-menu-item-disabled`,
    onClickCapture: hold,
    onKeyDownCapture: (e) => { if (e.key === 'Enter') hold(e); },
  };

  const items = visible.map((a, i) => {
    const showsPending = pendingRows && a.pending;
    const locked = pendingRows && isActionLocked(a);
    // Disabled or locked: the row is said unavailable and looks it.
    const unavailable = a.disabled || locked;
    // primary → label tinted with the same token antd's primary button fills
    // with (colorPrimary), bold; deliberately no solid fill so it does not
    // collide with the selectedKeys highlight on the active row. danger uses
    // antd's native menu-item danger styling (set below via `danger`).
    // Both apply only while the entry is available — disabled, antd's menu
    // does not neutralize them on its own (unlike a disabled Button), so a
    // disabled entry would otherwise still look primary/danger (owner
    // feedback, Fix 15; mirrors Fix 11's treatment of the opener).
    const labelText =
      !unavailable && a.variant === 'primary'
        ? <span style={{ color: token.colorPrimary, fontWeight: 600 }}>{a.label}</span>
        : <span>{a.label}</span>;
    const labelWithReason = a.reason
      ? <Tooltip title={<ReasonMarkdown>{a.reason}</ReasonMarkdown>}>{labelText}</Tooltip>
      : labelText;

    // While pending (pendingRows), the spinner takes the icon's place.
    const icon = showsPending ? <PendingIcon actionId={a.id} locked={locked} /> : a.icon;

    // The `icon` slot antd's Menu renders is always first and is a sibling
    // of the aligned wrapper below, not part of it — so it cannot represent
    // "icon after label" (iconPlacement="end") nor move together with the
    // label when `align` is set. Fold the icon out of that slot and into the
    // row's own label node whenever either applies; otherwise keep using the
    // slot (antd's normal, unmoved placement).
    const iconInLabel = iconPlacement === 'end' || align !== undefined;
    const rowIcon = iconInLabel ? icon : undefined;
    const iconAfterLabel = iconPlacement === 'end';
    const rowLabel = rowIcon
      ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, ...(justifyContent ? { justifyContent, width: '100%' } : {}) }}>
            {iconAfterLabel ? labelWithReason : rowIcon}
            {iconAfterLabel ? rowIcon : labelWithReason}
          </span>
        )
      : justifyContent
        ? <span style={{ display: 'flex', width: '100%', justifyContent }}>{labelWithReason}</span>
        : labelWithReason;

    return {
      key: String(i),
      icon: iconInLabel ? undefined : icon,
      danger: !unavailable && a.variant === 'danger',
      label: rowLabel,
      // Locked, not disabled: rc-menu takes a disabled row out of the keyboard's reach. The
      // locked row is said unavailable by its spinner (PendingIcon).
      disabled: a.disabled,
      ...(locked ? lockedRow : {}),
      onClick: () => fire(a),
    };
  });

  const anchor = (control: ReactElement, { disabled }: { disabled?: boolean } = {}) => (
    <Popconfirm
      title={<div style={{ maxWidth: 280, whiteSpace: 'normal' }}>{asked?.confirmation?.kind === 'popconfirm' ? asked.confirmation.question : undefined}</div>}
      // Controlled: fire() drives `open` (from the caller's control OR a menu
      // row). We only handle the close transition here — opening is always
      // explicit via fire(). onConfirm closes via the same false transition.
      open={popconfirmOpen}
      onOpenChange={(next) => { if (!next) { setPopconfirmOpen(false); settle(); } }}
      onConfirm={() => { asked?.fire(); settle(); }}
      okButtonProps={{ danger: asked?.variant === 'danger' }}
      disabled={disabled}
    >
      {control}
    </Popconfirm>
  );

  const typing = asked?.confirmation?.kind === 'typing' ? asked.confirmation : undefined;
  const dialogs = (
    <>
      {modalHolder}
      {asked && typing && (
        <ConfirmTypingModal
          open={typingOpen}
          title={typing.title}
          entityName={typing.entityName}
          description={typing.description}
          prompt={typing.prompt}
          okText={asked.label}
          danger={asked.variant === 'danger'}
          onConfirm={() => { setTypingOpen(false); asked.fire(); settle(); }}
          onCancel={() => { setTypingOpen(false); settle(); }}
        />
      )}
    </>
  );

  return { visible, items, fire, anchor, dialogs };
}

// A pending row's icon: the app's lent Spinner, keyed to the action as its
// button's is, else antd's own small spinner. A component of its own, so each
// row's spinner key comes from its own hook call. antd's Menu passes the icon
// slot's class in `className`.
//
// A `locked` row (isActionLocked) is said unavailable from here: rc-menu writes
// a row's `aria-disabled` from `disabled` alone, over the row's own props, and
// a locked row is not disabled. While locked, the row's element says "true";
// when the lock ends (pending over, or the action disabled), it gets back
// rc-menu's own "false", before rc-menu writes "true" for a row disabled in the
// same render (React runs a row's children's cleanups before it updates the
// row). React leaves the attribute alone in between: rc-menu's value for it
// stays the same.
function PendingIcon({ actionId, locked, className }: { actionId: string; locked: boolean; className?: string }) {
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:action:${actionId}`);
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!locked) return undefined;
    const row = ref.current?.closest('[role="menuitem"]');
    row?.setAttribute('aria-disabled', 'true');
    return () => row?.setAttribute('aria-disabled', 'false');
  }, [locked]);
  return (
    <span ref={ref} className={className} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />}
    </span>
  );
}
