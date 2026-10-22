import { useState } from 'react';
import { Button, Dropdown, Space, Tooltip, type ButtonProps } from 'antd';
import { useSpinnerKey, useVultusComponents, type ActionStatus } from 'vultus-core';
import { ActionButton, alignToJustifyContent } from './ActionButton.js';
import { ReasonMarkdown } from './ReasonMarkdown.js';
import { useActionMenu } from './useActionMenu.js';

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
  const { Spinner } = useVultusComponents();

  // keepOriginalDefault: drop the pick, so the main half re-evaluates to the
  // first enabled action (the auto rule below). A no-op otherwise.
  const settle = () => {
    if (!keepOriginalDefault) return;
    setSelectedId(null);
    setSelectionSource('auto');
  };

  // The open list's rows and the confirmation flow (shared with
  // ActionContextMenu). `menu.fire` fires an explicit action (not the resolved
  // `active`): menu rows cannot "select then read active" in one handler —
  // `active` only recomputes on the next render — so the action is passed in
  // explicitly. Picking the action also locks it as a manual pick (intent =
  // the click, regardless of whether the operator follows through with
  // confirmation), mirroring the old lockActive behavior. Used by both the main
  // button and the menu rows. With keepOriginalDefault the pick lasts only
  // until the action fires or its confirmation closes (onSettle).
  const menu = useActionMenu(actions, {
    iconPlacement,
    align,
    onPick: (action) => {
      setSelectedId(action.id);
      setSelectionSource('manual');
    },
    onSettle: settle,
  });
  const visible = menu.visible;

  // Manual picks stay put even when the picked action becomes disabled
  // (operator's choice is respected — button disables but selection holds).
  // Auto picks re-evaluate to first-enabled each render, so the default
  // tracks state changes without any effect.
  //
  // Computed above the early returns below, together with the spinner key, so
  // useSpinnerKey runs on every render (Rules of Hooks); harmless when `visible`
  // is empty or holds a single action — those branches never read `active`.
  const selectedIndex = (() => {
    if (selectionSource === 'manual' && selectedId !== null) {
      const idx = visible.findIndex((a) => a.id === selectedId);
      if (idx !== -1) return idx;
    }
    const firstEnabled = visible.findIndex((a) => !a.disabled);
    return firstEnabled !== -1 ? firstEnabled : 0;
  })();
  const active = visible[selectedIndex];
  const spinnerKey = useSpinnerKey(`vultus:action:${active?.id ?? ''}`);

  if (visible.length === 0) return null;
  if (visible.length === 1) {
    return <ActionButton action={visible[0]} size={size} iconPlacement={iconPlacement} align={align} className={className} />;
  }

  const justifyContent = alignToJustifyContent(align);

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
        loading={Spinner
          ? (active.pending ? { icon: <Spinner spinnerKey={spinnerKey} size="small" /> } : false)
          : active.pending}
        disabled={active.disabled || active.pending}
        // Single path for every confirmation kind. For popconfirm, fire()
        // opens the controlled bubble (the Popconfirm no longer auto-opens
        // on child click now that it is controlled).
        onClick={() => menu.fire(active)}
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

    // The popconfirm's bubble (opened by menu.fire, from the main button OR a
    // menu row) points at the main half: the chevron click cannot trigger it.
    // A popconfirm action asked is the active one (picking it made it so).
    if (active.confirmation?.kind === 'popconfirm') {
      return menu.anchor(withTooltip, { disabled: active.disabled });
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
        menu={{ items: menu.items, selectedKeys: active.disabled ? [] : [String(selectedIndex)] }}
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

  return <>{dropdownButton}{menu.dialogs}</>;
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
