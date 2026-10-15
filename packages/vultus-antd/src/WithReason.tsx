import { Tooltip, type TooltipProps } from 'antd';
import { cloneElement, Fragment, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { ReasonMarkdown } from './ReasonMarkdown.js';

/**
 * The style keys that place an element in its parent's layout. On a field widget's stable span
 * (see TooltipOptions' `stable`) they go to the span, the control's layout box, and leave the
 * control, so a flex or a margin applies once and reaches the parent.
 */
const LAYOUT_KEYS = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'justifySelf', 'order',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginBlock', 'marginBlockStart', 'marginBlockEnd', 'marginInline', 'marginInlineStart', 'marginInlineEnd',
  'gridArea', 'gridColumn', 'gridColumnStart', 'gridColumnEnd', 'gridRow', 'gridRowStart', 'gridRowEnd',
] as const satisfies readonly (keyof CSSProperties)[];

/** `style` split into its layout keys (LAYOUT_KEYS) and the rest. */
export function splitLayout(style: CSSProperties | undefined): { layout: CSSProperties; rest: CSSProperties } {
  const layout: Record<string, unknown> = {};
  const rest: Record<string, unknown> = { ...style };
  for (const key of LAYOUT_KEYS) {
    if (style?.[key] !== undefined) {
      layout[key] = style[key];
      delete rest[key];
    }
  }
  return { layout: layout as CSSProperties, rest: rest as CSSProperties };
}

/**
 * Optional tooltip settings: where it opens, `open: false` to hold it back,
 * `block` to anchor it on the whole width (e.g. a list row) rather than on
 * the control alone, and `flex` for a control that is itself a flex box (a
 * row of a switch and its label): the span is one too, so the row sits as an
 * unwrapped one does, without the line box an inline-block span adds under it.
 *
 * `stable` is for a field widget's own control, whose tooltip comes and goes
 * with the value (a value with a description and one without) or with
 * `<Field item>`: the span (class `vultus-tooltip-anchor`) is there with or
 * without a title, the tooltip never opening without one, so the element tree
 * around the control stays the same and React does not remount it (the
 * keyboard focus would drop). The span is then the control's layout box:
 * `style` (the widget's own) gives it its layout keys (LAYOUT_KEYS: flex,
 * margins, grid placement), which leave the control, and its `width` (e.g.
 * `'100%'`), the control filling the span (its own width becomes `'100%'`, so
 * a percentage applies once).
 */
export interface TooltipOptions {
  placement?: TooltipProps['placement'];
  open?: boolean;
  block?: boolean;
  flex?: boolean;
  stable?: boolean;
  style?: CSSProperties;
}

/**
 * Puts a tooltip on a control. antd's disabled controls set
 * `pointer-events: none`, which swallows hover, so the control sits in a span
 * that receives it. Without a title the control is returned as is, unless the
 * span is `stable` (see TooltipOptions). A function, not a component: a
 * Popconfirm around the result must get the control (or the Tooltip) itself
 * as its child to attach its click.
 */
export function withTooltip(
  title: ReactNode | undefined, disabled: boolean, control: ReactElement, options?: TooltipOptions,
): ReactElement {
  const shown = !!title;
  if (!shown && !options?.stable) return control;
  const { layout } = splitLayout(options?.style);
  const width = options?.style?.width;
  const moved = Object.keys(layout).length > 0 || width !== undefined;
  const filling = moved && control.type !== Fragment
    ? cloneElement(control as ReactElement<{ style?: CSSProperties }>, {
      style: {
        ...(control.props as { style?: CSSProperties }).style,
        ...Object.fromEntries(Object.keys(layout).map((key) => [key, undefined])),
        ...(width !== undefined ? { width: '100%' } : {}),
      },
    })
    : control;
  return (
    <Tooltip title={shown ? title : undefined} placement={options?.placement} open={shown ? options?.open : false}>
      <span
        className={options?.stable ? 'vultus-tooltip-anchor' : undefined}
        style={{
          display: options?.flex ? (options.block ? 'flex' : 'inline-flex') : options?.block ? 'block' : 'inline-block',
          ...layout,
          width,
          cursor: disabled ? 'not-allowed' : undefined,
        }}
      >
        {filling}
      </span>
    </Tooltip>
  );
}

/** A disabled control's reason (markdown) as its tooltip. */
export function withReason(
  reason: string | undefined, disabled: boolean, control: ReactElement, options?: TooltipOptions,
): ReactElement {
  return withTooltip(reason ? <ReasonMarkdown>{reason}</ReasonMarkdown> : undefined, disabled, control, options);
}
