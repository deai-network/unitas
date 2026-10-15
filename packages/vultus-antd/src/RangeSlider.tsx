import { Slider } from 'antd';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import type { NumberRange, RangeFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useFieldRequest } from './useFieldRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props {
  field: RangeFieldControls;
  style?: CSSProperties;
  /** Shows the field's formatted value (field.valueText) before the slider. */
  showValue?: boolean;
}

const equalRange = (a: NumberRange, b: NumberRange): boolean => a[0] === b[0] && a[1] === b[1];

/**
 * A range field (useRangeField) as antd's Slider in `range` mode: one handle
 * per end, over field.min..field.max, stepped by field.step (Praeceptor's
 * school-years filter). A value is requested once per move, when it ends
 * (release, an arrow key's keyup) — `onChangeComplete`, as NumericSlider and
 * OneOfSlider — not at each step of a drag, carrying both ends `[from, to]`.
 * Each handle keeps antd's own tooltip (hover, focus, drag), formatting its
 * end with `field.format`; the rest of the slider (the track) carries the
 * field's own tooltip instead (fieldTooltip, with no "current state": the
 * handles' tooltips already show it), held back while hovering a handle
 * (its own tooltip would double up) or while a confirmation is open.
 */
export function RangeSlider({ field, style, showValue }: Props) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useFieldRequest<NumberRange>(field, { equal: equalRange });
  const [moving, setMoving] = useState<NumberRange | null>(null);
  const [onHandle, setOnHandle] = useState(false);
  if (!field.visible) return null;
  const settle = (value: NumberRange) => {
    setMoving(null);
    request(value);
  };
  const slider = (
    <Slider
      range
      min={field.min}
      max={field.max}
      step={field.step}
      value={moving ?? field.value}
      disabled={!field.enabled || field.pending}
      onChange={(value: number[]) => setMoving(value as NumberRange)}
      onChangeComplete={(value: number[]) => settle(value as NumberRange)}
      tooltip={{ formatter: (value?: number) => (value === undefined ? '' : field.format(value)) }}
      ariaLabelForHandle={field.label || undefined}
      style={{ minWidth: 160, ...style }}
    />
  );
  // antd's Slider puts no data-* attributes on its root: a wrapper carries them.
  const body = (
    <span
      data-field-id={field.id}
      data-value={`${field.value[0]}..${field.value[1]}`}
      aria-description={fieldAccessibleDescription(field, texts)}
      onMouseOver={(e: MouseEvent<HTMLElement>) => setOnHandle(!!(e.target as HTMLElement).closest('.ant-slider-handle'))}
      onMouseLeave={() => setOnHandle(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      {showValue && <span>{field.valueText}</span>}
      {slider}
    </span>
  );
  // The handles show what the values are (their own tooltips); the track says what the field is.
  return wrap(withTooltip(fieldTooltip(field, texts, false), !field.enabled, body, {
    open: asking || onHandle ? false : undefined,
  }));
}
