import { Slider } from 'antd';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import type { NumericFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { useNumericRequest } from './useNumericRequest.js';
import { sliderStyle, useSliderMove } from './useSliderMove.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface NumericSliderProps {
  field: NumericFieldControls;
  style?: CSSProperties;
  /** Shows the field's formatted value (field.valueText) before the slider. */
  showValue?: boolean;
}

/**
 * A numeric field (useNumericField) as antd's Slider. Needs both `min` and
 * `max` (there is no way to size a track otherwise); without them it throws,
 * naming the field. A value is requested once per move, when it ends
 * (release, an arrow key) — `onChangeComplete`, as OneOfSlider — not at each
 * step of a drag. The handle keeps antd's own tooltip (shown on hover,
 * focus and drag), formatting the value with `field.format`; the rest of
 * the slider (the track) carries the field's own tooltip instead
 * (fieldTooltip, with no "current state": the handle's tooltip already
 * shows it), held back while hovering the handle (its own tooltip would
 * double up, as a mark's own does on OneOfSlider) or while a confirmation
 * is open. Per the owner's slider rule (no jump back to the old value while
 * a request is in flight — vultus-field-model-design item 26), the
 * moved-to value stays shown while the confirmation is open or the commit
 * is pending (useSliderMove, shared with RangeSlider).
 */
export function NumericSlider({ field, style, showValue }: NumericSliderProps) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useNumericRequest(field);
  const move = useSliderMove<number>({ value: field.value, pending: field.pending, asking, request });
  const [onHandle, setOnHandle] = useState(false);
  if (field.min === undefined || field.max === undefined) {
    throw new Error(`Field '${field.id}': NumericSlider needs min and max`);
  }
  if (!field.visible) return null;
  const slider = (
    <Slider
      min={field.min}
      max={field.max}
      step={field.step}
      value={move.value}
      disabled={!field.enabled || field.pending}
      onChange={move.onChange}
      onChangeComplete={move.onChangeComplete}
      tooltip={{ formatter: (value?: number) => (value === undefined ? '' : field.format(value)) }}
      ariaLabelForHandle={field.label || undefined}
      style={sliderStyle(style)}
    />
  );
  // antd's Slider puts no data-* attributes on its root: a wrapper carries them.
  const body = (
    <span
      data-field-id={field.id}
      data-value={String(field.value)}
      aria-description={fieldAccessibleDescription(field, texts)}
      onMouseOver={(e: MouseEvent<HTMLElement>) => setOnHandle(!!(e.target as HTMLElement).closest('.ant-slider-handle'))}
      onMouseLeave={() => setOnHandle(false)}
      style={{ display: style?.width === undefined ? 'inline-flex' : 'flex', alignItems: 'center', gap: 8, width: style?.width }}
    >
      {showValue && <span style={{ whiteSpace: 'nowrap' }}>{field.valueText}</span>}
      {slider}
    </span>
  );
  // The handle shows what the value is (its own tooltip); the track says what the field is.
  return wrap(withTooltip(fieldTooltip(tipField, texts, false), !field.enabled, body, {
    open: asking || onHandle ? false : undefined,
    width: style?.width,
  }));
}
