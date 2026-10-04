import { useState, type CSSProperties } from 'react';
import { Button, Modal, Popconfirm, Tooltip, type ButtonProps } from 'antd';
import type { ActionStatus } from 'vultus-core';
import { ConfirmTypingModal } from './ConfirmTypingModal.js';
import { CombinedActionButton } from './CombinedActionButton.js';
import { ReasonMarkdown } from './ReasonMarkdown.js';

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

export function ActionButton({ action, size, block, keepOriginalDefault, iconPlacement, align }: Props) {
  // `useState` must be called unconditionally on every render to keep the
  // hook call order stable. The `action` prop can plausibly flip shape
  // across renders, so we cannot guard this hook behind the Array.isArray
  // branch — that would change the hook count and trip Rules of Hooks.
  const [typingOpen, setTypingOpen] = useState(false);
  // Hook-based confirm (see CombinedActionButton): follows the app's
  // ConfigProvider. Called unconditionally for the same hook-order reason.
  const [modal, modalHolder] = Modal.useModal();

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

  const handleClick = () => {
    if (action.disabled || action.pending) return;
    if (!action.confirmation) {
      action.fire();
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
        onOk: () => action.fire(),
      });
      return;
    }
    // popconfirm wraps the button; click is delegated to Popconfirm.
  };

  const rawButton = (
    <Button
      icon={action.icon}
      iconPlacement={iconPlacement}
      style={justifyContent ? { justifyContent } : undefined}
      type={action.variant === 'primary' ? 'primary' : 'default'}
      danger={action.variant === 'danger'}
      size={size}
      block={block}
      loading={action.pending}
      disabled={action.disabled || action.pending}
      onClick={action.confirmation?.kind === 'popconfirm' ? undefined : handleClick}
      data-action-id={action.id}
    >
      {action.label}
    </Button>
  );

  // AntD's disabled buttons set `pointer-events: none`, which suppresses the
  // native `title` attribute's hover tooltip. Wrap in <Tooltip><span>...</span></Tooltip>
  // so disabled-with-reason actually shows the reason on hover. Only wrap
  // when there's something to say.
  const buttonNode = action.reason
    ? (
        <Tooltip title={<ReasonMarkdown>{action.reason}</ReasonMarkdown>}>
          <span style={{ display: 'inline-block', cursor: action.disabled ? 'not-allowed' : undefined }}>
            {rawButton}
          </span>
        </Tooltip>
      )
    : rawButton;

  if (action.confirmation?.kind === 'popconfirm') {
    return (
      <Popconfirm
        title={<div style={{ maxWidth: 280, whiteSpace: 'normal' }}>{action.confirmation.question}</div>}
        onConfirm={() => action.fire()}
        okButtonProps={{ danger: action.variant === 'danger' }}
        disabled={action.disabled}
      >
        {buttonNode}
      </Popconfirm>
    );
  }

  if (action.confirmation?.kind === 'typing') {
    const conf = action.confirmation;
    return (
      <>
        {buttonNode}
        <ConfirmTypingModal
          open={typingOpen}
          title={conf.title}
          entityName={conf.entityName}
          description={conf.description}
          onConfirm={() => {
            setTypingOpen(false);
            action.fire();
          }}
          onCancel={() => setTypingOpen(false)}
        />
      </>
    );
  }

  return <>{buttonNode}{modalHolder}</>;
}
