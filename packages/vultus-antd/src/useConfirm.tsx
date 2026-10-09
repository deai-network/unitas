import { useRef, useState, type ReactElement } from 'react';
import { Modal, Popconfirm } from 'antd';
import type { ConfirmationSpec } from 'vultus-core';
import { ConfirmTypingModal } from './ConfirmTypingModal.js';

/** Obtains a confirmation, then runs; runs at once without one. */
export type Confirm = (confirmation: ConfirmationSpec | undefined, run: () => void) => void;

/**
 * Obtains ConfirmationSpec confirmations for a control (ActionButton,
 * BoolSwitch, BoolCheckbox), under program control: the control decides what
 * it requests and when (a boolean widget in the mixed state first tells a
 * click from a double click), then calls `confirm`. `wrap` puts the
 * popconfirm's anchor around the control and renders the dialogs (cascade
 * modal, typing confirmation) next to it. `asking` is true while a
 * confirmation is open: the control holds back its own tooltips meanwhile,
 * which would otherwise cover the popconfirm.
 */
export function useConfirm({ okText, danger }: { okText: string; danger?: boolean }): {
  confirm: Confirm;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  const [modal, modalHolder] = Modal.useModal();
  const [modalOpen, setModalOpen] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [typing, setTyping] = useState<Extract<ConfirmationSpec, { kind: 'typing' }> | null>(null);
  const runRef = useRef<() => void>(() => {});

  const confirm: Confirm = (confirmation, run) => {
    if (!confirmation) {
      run();
      return;
    }
    runRef.current = run;
    if (confirmation.kind === 'popconfirm') setQuestion(confirmation.question);
    else if (confirmation.kind === 'typing') setTyping(confirmation);
    else {
      setModalOpen(true);
      modal.confirm({
        title: confirmation.title,
        content: confirmation.content,
        okText,
        okButtonProps: { danger },
        onOk: () => run(),
        afterClose: () => setModalOpen(false),
      });
    }
  };

  const wrap = (control: ReactElement) => (
    <>
      <Popconfirm
        open={question !== null}
        // Opens only from `confirm`; the control's own click must not open it.
        onOpenChange={(open) => { if (!open) setQuestion(null); }}
        title={<div style={{ maxWidth: 280, whiteSpace: 'normal' }}>{question}</div>}
        onConfirm={() => { setQuestion(null); runRef.current(); }}
        onCancel={() => setQuestion(null)}
        okButtonProps={{ danger }}
      >
        {control}
      </Popconfirm>
      {typing && (
        <ConfirmTypingModal
          open
          title={typing.title}
          entityName={typing.entityName}
          description={typing.description}
          prompt={typing.prompt}
          okText={okText}
          danger={danger}
          onConfirm={() => { setTyping(null); runRef.current(); }}
          onCancel={() => setTyping(null)}
        />
      )}
      {modalHolder}
    </>
  );

  return { confirm, wrap, asking: question !== null || typing !== null || modalOpen };
}
