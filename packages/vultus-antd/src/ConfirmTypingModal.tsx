import { Fragment, useEffect, useState } from 'react';
import { Modal, Input } from 'antd';
import type React from 'react';

interface Props {
  open: boolean;
  title: string;
  entityName: string;
  description: React.ReactNode;
  // The instruction line; each `{phrase}` in it becomes the highlighted phrase
  // (see the 'typing' ConfirmationSpec in vultus-core).
  prompt?: string;
  // The OK button's text: the action's label.
  okText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const PHRASE = '{phrase}';
const DEFAULT_PROMPT = `Type ${PHRASE} to confirm:`;

export function ConfirmTypingModal({
  open, title, entityName, description, prompt = DEFAULT_PROMPT, okText = 'Delete', danger = true, onConfirm, onCancel,
}: Props) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const matches = typed === entityName;
  // The text around the phrase; a prompt without a placeholder gets the
  // phrase after it.
  const around = prompt.includes(PHRASE) ? prompt.split(PHRASE) : [`${prompt} `, ''];

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={okText}
      okButtonProps={{ danger, disabled: !matches }}
    >
      {description}
      <p style={{ marginTop: 12 }}>
        {around.map((text, i) => (
          <Fragment key={i}>
            {i > 0 && <code>{entityName}</code>}
            {text}
          </Fragment>
        ))}
      </p>
      <Input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        // Enter confirms when the OK button would: the phrase is typed.
        onPressEnter={() => { if (open && matches) onConfirm(); }}
        autoFocus
      />
    </Modal>
  );
}
