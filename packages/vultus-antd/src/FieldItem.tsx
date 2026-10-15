import { Form } from 'antd';
import type { ReactNode } from 'react';
import type { FieldControls } from 'vultus-core';
import { InfoCircleIcon } from './fieldTooltip.js';
import { ReasonMarkdown } from './ReasonMarkdown.js';

/**
 * A field's control as an antd form item, for vertical forms such as a print dialog
 * (`<Field item>`, `<FieldWidget item>`): the field's label (unless the widget shows its own,
 * as BoolCheckbox does), its description (markdown) as the label's info tooltip, and the last
 * commit's messages under the control, the item in the error status when one of them is an
 * error, in the warning status when one is a warning. Each message is a live region (antd gives
 * a help text none without a `name`): an error an alert, the others a status. A hidden field
 * renders no item. It needs no enclosing antd `Form`; inside one, it takes the form's layout.
 * The messages also go to the MessageSink unless the caller silences it (see FieldWidget).
 */
export function FieldItem({ field, showLabel = true, children }: {
  field: FieldControls<any, any>;
  /** False when the widget shows the field's label itself. */
  showLabel?: boolean;
  children: ReactNode;
}) {
  if (!field.visible) return null;
  const label = showLabel && field.label ? field.label : undefined;
  const { messages } = field;
  const status = messages.some((m) => m.severity === 'error') ? 'error'
    : messages.some((m) => m.severity === 'warning') ? 'warning'
      : undefined;
  return (
    <Form.Item
      label={label}
      tooltip={label && field.description
        ? { title: <ReasonMarkdown>{field.description}</ReasonMarkdown>, icon: <InfoCircleIcon /> }
        : undefined}
      help={messages.length > 0
        ? messages.map((m, i) => <div key={i} role={m.severity === 'error' ? 'alert' : 'status'}>{m.text}</div>)
        : undefined}
      validateStatus={status}
    >
      {children}
    </Form.Item>
  );
}
