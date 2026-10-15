import { Tooltip, type TooltipProps } from 'antd';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

/**
 * Optional tooltip settings: where it opens, `open: false` to hold it back,
 * `block` to anchor it on the whole width (e.g. a list row) rather than on
 * the control alone, `width` for a control given a width (the widget's
 * `style.width`, e.g. `'100%'`: the span takes it, so the control can fill
 * it, and the tooltip stays anchored on the control), and `flex` for a
 * control that is itself a flex box (a row of a switch and its label): the
 * span is one too, so the row sits as an unwrapped one does, without the
 * line box an inline-block span adds under it.
 */
export interface TooltipOptions {
  placement?: TooltipProps['placement'];
  open?: boolean;
  block?: boolean;
  width?: CSSProperties['width'];
  flex?: boolean;
}
import { ReasonMarkdown } from './ReasonMarkdown.js';

/**
 * Puts a tooltip on a control. antd's disabled controls set
 * `pointer-events: none`, which swallows hover, so the control sits in a span
 * that receives it. Without a title the control is returned as is. A function,
 * not a component: a Popconfirm around the result must get the control (or
 * the Tooltip) itself as its child to attach its click.
 */
export function withTooltip(
  title: ReactNode | undefined, disabled: boolean, control: ReactElement, options?: TooltipOptions,
): ReactElement {
  if (!title) return control;
  return (
    <Tooltip title={title} placement={options?.placement} open={options?.open}>
      <span
        style={{
          display: options?.flex ? (options.block ? 'flex' : 'inline-flex') : options?.block ? 'block' : 'inline-block',
          width: options?.width,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
      >
        {control}
      </span>
    </Tooltip>
  );
}

/** A disabled control's reason (markdown) as its tooltip. */
export function withReason(reason: string | undefined, disabled: boolean, control: ReactElement): ReactElement {
  return withTooltip(reason ? <ReasonMarkdown>{reason}</ReasonMarkdown> : undefined, disabled, control);
}
