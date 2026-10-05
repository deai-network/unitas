import { Tooltip } from 'antd';
import type { ReactElement } from 'react';
import { ReasonMarkdown } from './ReasonMarkdown.js';

/**
 * Shows a reason (why a control is disabled) as a tooltip. antd's disabled
 * controls set `pointer-events: none`, which swallows hover, so the control
 * sits in a span that receives it. Without a reason the control is returned
 * as is. A function, not a component: a Popconfirm around the result must get
 * the control (or the Tooltip) itself as its child to attach its click.
 */
export function withReason(reason: string | undefined, disabled: boolean, control: ReactElement): ReactElement {
  if (!reason) return control;
  return (
    <Tooltip title={<ReasonMarkdown>{reason}</ReasonMarkdown>}>
      <span style={{ display: 'inline-block', cursor: disabled ? 'not-allowed' : undefined }}>
        {control}
      </span>
    </Tooltip>
  );
}
