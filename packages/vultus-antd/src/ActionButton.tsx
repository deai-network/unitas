import type { CSSProperties } from 'react';
import { Button, type ButtonProps } from 'antd';
import type { ActionStatus } from 'vultus-core';
import { CombinedActionButton } from './CombinedActionButton.js';
import { useConfirm } from './useConfirm.js';
import { withReason } from './WithReason.js';

interface Props {
  action: ActionStatus | ActionStatus[];
  // antd's own Button size type (antd 6 adds 'medium'), so a ConfigProvider
  // componentSize can be passed straight through.
  size?: ButtonProps['size'];
  block?: boolean;
  // Array form only: forwarded to CombinedActionButton (see there).
  keepOriginalDefault?: boolean;
  // Where the icon (and, while pending, the loading spinner, which takes the
  // icon's slot) sits relative to the label. Array form: forwarded to
  // CombinedActionButton's main half (see there).
  iconPlacement?: 'start' | 'end';
  // Where the button's content (label plus icon or spinner) sits within the
  // button's width. Only visible when the button is wider than its content.
  // Unset keeps antd's default (centered) exactly. Array form: forwarded to
  // CombinedActionButton's main half (see there).
  align?: 'start' | 'center' | 'end';
  // antd's Button variant, for a button that is not the usual outlined or
  // solid one: 'text' in menus and pop-up panels, 'link' inline. The action's
  // own variant still picks the colour (primary, danger). Single action only.
  buttonVariant?: ButtonProps['variant'];
}

// Shared by ActionButton and CombinedActionButton: maps the `align` prop to
// the CSS `justify-content` value that antd's Button (a flex container) reads
// via inline `style`, so it wins over antd's own centered default without
// resorting to global CSS. `undefined` leaves the style untouched.
export function alignToJustifyContent(align: 'start' | 'center' | 'end' | undefined): CSSProperties['justifyContent'] | undefined {
  if (align === 'start') return 'flex-start';
  if (align === 'end') return 'flex-end';
  if (align === 'center') return 'center';
  return undefined;
}

export function ActionButton({ action, size, block, keepOriginalDefault, iconPlacement, align, buttonVariant }: Props) {
  // Called unconditionally, before the early returns (Rules of Hooks); with the
  // array form the label and danger are unused.
  const single = Array.isArray(action) ? undefined : action;
  const { confirm, wrap } = useConfirm({ okText: single?.label ?? '', danger: single?.variant === 'danger' });

  if (Array.isArray(action)) {
    return (
      <CombinedActionButton
        actions={action}
        size={size}
        keepOriginalDefault={keepOriginalDefault}
        iconPlacement={iconPlacement}
        align={align}
      />
    );
  }

  if (action.invisible) return null;

  const justifyContent = alignToJustifyContent(align);
  // antd takes `type`/`danger` unless both `color` and `variant` are given.
  const look: Pick<ButtonProps, 'type' | 'danger' | 'color' | 'variant'> = buttonVariant
    ? {
        color: action.variant === 'danger' ? 'danger' : action.variant === 'primary' ? 'primary' : 'default',
        variant: buttonVariant,
      }
    : { type: action.variant === 'primary' ? 'primary' : 'default', danger: action.variant === 'danger' };

  return wrap(withReason(action.reason, action.disabled, (
    <Button
      icon={action.icon}
      iconPlacement={iconPlacement}
      style={justifyContent ? { justifyContent } : undefined}
      {...look}
      size={size}
      block={block}
      loading={action.pending}
      disabled={action.disabled || action.pending}
      onClick={() => confirm(action.confirmation, () => action.fire())}
      data-action-id={action.id}
    >
      {action.label}
    </Button>
  )));
}
