import { useState } from 'react';
import { Button, Dropdown, Modal, Popconfirm, Space, Tooltip, theme, type ButtonProps } from 'antd';
import type { ActionStatus } from 'vultus-core';
import { ConfirmTypingModal } from './ConfirmTypingModal.js';
import { ActionButton, alignToJustifyContent } from './ActionButton.js';
import { ReasonMarkdown } from './ReasonMarkdown.js';

interface Props {
  actions: ActionStatus[];
  // antd's own Button size type (antd 6 adds 'medium'), so a ConfigProvider
  // componentSize can be passed straight through.
  size?: ButtonProps['size'];
  // Off (default): a menu pick becomes the main action and stays there.
  // On: the main half returns to the first enabled action (the original
  // default) once the picked action fires or its confirmation is dismissed.
  keepOriginalDefault?: boolean;
  // Where the icon sits on the main (action) half, relative to the label.
  // While that half is pending, antd's loading spinner takes the icon's
  // slot, so this also governs where the spinner renders. `'end'` also moves
  // each open-list row's icon to after its label — antd's Menu always renders
  // an item's `icon` slot before its label, so that case builds the icon into
  // the row's label node instead. `'start'` and unset keep antd's normal
  // (left) menu-item icon placement via that `icon` slot, unless `align` is
  // also set (see below).
  iconPlacement?: 'start' | 'end';
  // Where the button's content (label plus icon or spinner) sits within the
  // button's width, on the main half and (matching) each open-list row.
  // Unset keeps antd's default exactly. Only matters when the button is
  // wider than its content. When set, each row's icon is also folded out of
  // antd's `icon` slot — that slot is a sibling of the aligned wrapper, not
  // part of it, so it would not move with the label — and into the aligned
  // wrapper alongside the label instead, so the row's icon and label align
  // and move together as one unit: before the label for `iconPlacement`
  // `'start'`/unset, after it for `'end'`.
  align?: 'start' | 'center' | 'end';
  // Extra class on the buttons (the main half and the opener), e.g. a styling
  // layer's look; in the single-button case on that button.
  className?: string;
}

export function CombinedActionButton({ actions, size, keepOriginalDefault = false, iconPlacement, align, className }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<'auto' | 'manual'>('auto');
  const [typingOpen, setTypingOpen] = useState(false);
  const [popconfirmOpen, setPopconfirmOpen] = useState(false);
  const { token } = theme.useToken();
  // Hook-based confirm (not static Modal.confirm): it renders through
  // `modalHolder` inside the app's tree, so it follows the app's
  // ConfigProvider (theme, prefix, locale).
  const [modal, modalHolder] = Modal.useModal();

  const visible = actions.filter((a) => !a.invisible);
  if (visible.length === 0) return null;
  if (visible.length === 1) {
    return <ActionButton action={visible[0]} size={size} iconPlacement={iconPlacement} align={align} className={className} />;
  }

  const justifyContent = alignToJustifyContent(align);

  // Manual picks stay put even when the picked action becomes disabled
  // (operator's choice is respected — button disables but selection holds).
  // Auto picks re-evaluate to first-enabled each render, so the default
  // tracks state changes without any effect.
  const selectedIndex = (() => {
    if (selectionSource === 'manual' && selectedId !== null) {
      const idx = visible.findIndex((a) => a.id === selectedId);
      if (idx !== -1) return idx;
    }
    const firstEnabled = visible.findIndex((a) => !a.disabled);
    return firstEnabled !== -1 ? firstEnabled : 0;
  })();

  const active = visible[selectedIndex];

  // keepOriginalDefault: drop the pick, so the main half re-evaluates to the
  // first enabled action (the auto rule above). A no-op otherwise.
  const settle = () => {
    if (!keepOriginalDefault) return;
    setSelectedId(null);
    setSelectionSource('auto');
  };

  // Fire an explicit action (not the resolved `active`). Menu rows cannot
  // "select then read active" in one handler — `active` only recomputes on
  // the next render — so the action is passed in explicitly. Selecting the
  // action also locks it as a manual pick (intent = the click, regardless of
  // whether the operator follows through with confirmation), mirroring the
  // old lockActive behavior. Used by both the main button and the menu rows.
  // With keepOriginalDefault the pick lasts only until the action fires or
  // its confirmation closes.
  const fire = (action: ActionStatus) => {
    if (action.disabled || action.pending) return;
    setSelectedId(action.id);
    setSelectionSource('manual');
    if (!action.confirmation) {
      action.fire();
      settle();
      return;
    }
    if (action.confirmation.kind === 'typing') {
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
    // popconfirm: open the controlled bubble on the main half.
    setPopconfirmOpen(true);
  };

  const menuItems = visible.map((a, i) => {
    // primary → label tinted with the same token antd's primary button fills
    // with (colorPrimary), bold; deliberately no solid fill so it does not
    // collide with the selectedKeys highlight on the active row. danger uses
    // antd's native menu-item danger styling (set below via `danger`).
    // Both apply only while the entry is enabled — disabled, antd's menu
    // does not neutralize them on its own (unlike a disabled Button), so a
    // disabled entry would otherwise still look primary/danger (owner
    // feedback, Fix 15; mirrors Fix 11's treatment of the opener).
    const labelText =
      !a.disabled && a.variant === 'primary'
        ? <span style={{ color: token.colorPrimary, fontWeight: 600 }}>{a.label}</span>
        : <span>{a.label}</span>;
    const labelWithReason = a.reason
      ? <Tooltip title={<ReasonMarkdown>{a.reason}</ReasonMarkdown>}>{labelText}</Tooltip>
      : labelText;

    // The `icon` slot antd's Menu renders is always first and is a sibling
    // of the aligned wrapper below, not part of it — so it cannot represent
    // "icon after label" (iconPlacement="end") nor move together with the
    // label when `align` is set. Fold the icon out of that slot and into the
    // row's own label node whenever either applies; otherwise keep using the
    // slot (antd's normal, unmoved placement).
    const iconInLabel = iconPlacement === 'end' || align !== undefined;
    const rowIcon = iconInLabel ? a.icon : undefined;
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
      icon: iconInLabel ? undefined : a.icon,
      danger: !a.disabled && a.variant === 'danger',
      label: rowLabel,
      disabled: a.disabled,
      onClick: () => fire(a),
    };
  });

  // The main half is its own Button, so the opener stays
  // interactive even when the active half is disabled (design §3.2 requires
  // the menu to open in the all-disabled case for per-item reason tooltips),
  // the icon renders via Button's `icon` prop, and Popconfirm wraps only the
  // main half (chevron click cannot trigger it).
  const renderMainButton = () => {
    const rawButton = (
      <Button
        className={className}
        icon={active.icon}
        iconPlacement={iconPlacement}
        style={justifyContent ? { justifyContent } : undefined}
        type={active.variant === 'primary' ? 'primary' : 'default'}
        danger={active.variant === 'danger'}
        size={size}
        loading={active.pending}
        disabled={active.disabled || active.pending}
        // Single path for every confirmation kind. For popconfirm, fire()
        // opens the controlled bubble (the Popconfirm no longer auto-opens
        // on child click now that it is controlled).
        onClick={() => fire(active)}
        data-action-id={active.id}
      >
        {active.label}
      </Button>
    );

    // Mirror single-action: disabled buttons have pointer-events:none which
    // swallows tooltip hover; wrap in Tooltip><span> to restore it.
    const withTooltip = active.reason
      ? (
          <Tooltip title={<ReasonMarkdown>{active.reason}</ReasonMarkdown>}>
            <span style={{ display: 'inline-block', cursor: active.disabled ? 'not-allowed' : undefined }}>
              {rawButton}
            </span>
          </Tooltip>
        )
      : rawButton;

    if (active.confirmation?.kind === 'popconfirm') {
      return (
        <Popconfirm
          title={<div style={{ maxWidth: 280, whiteSpace: 'normal' }}>{active.confirmation.question}</div>}
          // Controlled: fire() drives `open` (from the main button OR a menu
          // row). We only handle the close transition here — opening is always
          // explicit via fire(). onConfirm closes via the same false transition.
          open={popconfirmOpen}
          onOpenChange={(next) => { if (!next) { setPopconfirmOpen(false); settle(); } }}
          onConfirm={() => { active.fire(); settle(); }}
          okButtonProps={{ danger: active.variant === 'danger' }}
          disabled={active.disabled}
        >
          {withTooltip}
        </Popconfirm>
      );
    }

    return withTooltip;
  };

  // The split button, composed the way antd recommends in place of the
  // deprecated Dropdown.Button: Space.Compact holding the main half and an
  // opener Button wrapped in Dropdown. Space.Compact is not block by default,
  // so the group does not turn greedy under a flex parent (eg. the
  // entity-detail heading's `space-between` layout). `size` on Space.Compact
  // sizes both halves. `vultus-combined-action-button` is the stable hook for
  // consumers' CSS.
  const dropdownButton = (
    <Space.Compact className="vultus-combined-action-button" size={size}>
      {renderMainButton()}
      <Dropdown
        // Click trigger (default is hover) — touch devices can't hover, and
        // the opener is meant to be clicked anyway.
        trigger={['click']}
        placement="bottomRight"
        menu={{ items: menuItems, selectedKeys: active.disabled ? [] : [String(selectedIndex)] }}
      >
        <Button
          className={className}
          // The opener mirrors the selected action's primary/danger styling
          // only while that action is enabled. Disabled, it renders in the
          // default style — it still opens the list either way, only its look
          // changes (owner feedback, Fix 11).
          type={!active.disabled && active.variant === 'primary' ? 'primary' : 'default'}
          danger={!active.disabled && active.variant === 'danger'}
          icon={<EllipsisIcon />}
        />
      </Dropdown>
    </Space.Compact>
  );

  if (active.confirmation?.kind === 'typing') {
    const conf = active.confirmation;
    return (
      <>
        {dropdownButton}
        {modalHolder}
        <ConfirmTypingModal
          open={typingOpen}
          title={conf.title}
          entityName={conf.entityName}
          description={conf.description}
          onConfirm={() => { setTypingOpen(false); active.fire(); settle(); }}
          onCancel={() => { setTypingOpen(false); settle(); }}
        />
      </>
    );
  }

  return <>{dropdownButton}{modalHolder}</>;
}

// antd's EllipsisOutlined (the opener icon Dropdown.Button used), inlined so
// vultus-antd needs no @ant-design/icons dependency. Same markup as the icon
// component, so antd's icon-button styling applies unchanged.
function EllipsisIcon() {
  return (
    <span role="img" aria-label="ellipsis" className="anticon anticon-ellipsis">
      <svg viewBox="64 64 896 896" focusable="false" data-icon="ellipsis" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path d="M176 511a56 56 0 10112 0 56 56 0 10-112 0zm280 0a56 56 0 10112 0 56 56 0 10-112 0zm280 0a56 56 0 10112 0 56 56 0 10-112 0z" />
      </svg>
    </span>
  );
}
