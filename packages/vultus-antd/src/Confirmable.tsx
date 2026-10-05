import { useState, type ReactNode } from 'react';
import { Modal, Popconfirm } from 'antd';
import type { ConfirmationSpec } from 'vultus-core';
import { ConfirmTypingModal } from './ConfirmTypingModal.js';

interface Props {
  /** The confirmation to obtain before `onConfirm`, if any. */
  confirmation: ConfirmationSpec | undefined;
  /** Runs once confirmed (or at once without a confirmation). */
  onConfirm: () => void;
  /** Text of the confirming button (cascade modal). */
  okText: string;
  danger?: boolean;
  /** Nothing happens while disabled. */
  disabled?: boolean;
  /**
   * Renders the control. Call `activate` from the control's own event; it is
   * `undefined` for a popconfirm, which opens on the control's click by itself.
   */
  children: (activate: (() => void) | undefined) => ReactNode;
}

/**
 * Obtains a ConfirmationSpec's confirmation around any control (ActionButton,
 * BoolSwitch, BoolCheckbox): a popconfirm wraps the control, a cascade modal
 * and the typing confirmation open from `activate`.
 */
export function Confirmable({ confirmation, onConfirm, okText, danger, disabled, children }: Props) {
  // Hooks run unconditionally, whatever the confirmation kind is this render.
  const [typingOpen, setTypingOpen] = useState(false);
  const [modal, modalHolder] = Modal.useModal();

  const activate = () => {
    if (disabled) return;
    if (!confirmation) {
      onConfirm();
      return;
    }
    if (confirmation.kind === 'typing') {
      setTypingOpen(true);
      return;
    }
    if (confirmation.kind === 'cascade-modal') {
      modal.confirm({
        title: confirmation.title,
        content: confirmation.content,
        okText,
        okButtonProps: { danger },
        onOk: () => onConfirm(),
      });
    }
  };

  if (confirmation?.kind === 'popconfirm') {
    return (
      <Popconfirm
        title={<div style={{ maxWidth: 280, whiteSpace: 'normal' }}>{confirmation.question}</div>}
        onConfirm={() => onConfirm()}
        okButtonProps={{ danger }}
        disabled={disabled}
      >
        {children(undefined)}
      </Popconfirm>
    );
  }

  if (confirmation?.kind === 'typing') {
    return (
      <>
        {children(activate)}
        <ConfirmTypingModal
          open={typingOpen}
          title={confirmation.title}
          entityName={confirmation.entityName}
          description={confirmation.description}
          onConfirm={() => {
            setTypingOpen(false);
            onConfirm();
          }}
          onCancel={() => setTypingOpen(false)}
        />
      </>
    );
  }

  return <>{children(activate)}{modalHolder}</>;
}
