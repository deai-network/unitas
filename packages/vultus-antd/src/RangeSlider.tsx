import { Slider } from 'antd';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import type { NumberRange, RangeFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { useLockedSlider } from './pendingLock.js';
import { useFieldRequest } from './useFieldRequest.js';
import { sliderStyle, useSliderMove } from './useSliderMove.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface RangeSliderProps {
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
 * (its own tooltip would double up) or while a confirmation is open. Per the
 * owner's slider rule (no jump back to the old value while a request is in
 * flight — vultus-field-model-design item 26), the moved-to ends stay shown
 * while the confirmation is open or the commit is pending (useSliderMove,
 * shared with NumericSlider). While the field is pending (a commit runs, or
 * its `pending` option says the app is busy) it is locked (isLocked,
 * useLockedSlider: the handles keep the keyboard focus, are said
 * unavailable, and an arrow key or a drag neither moves them nor requests
 * anything).
 */
export function RangeSlider({ field, style, showValue }: RangeSliderProps) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useFieldRequest<NumberRange>(field, { equal: equalRange });
  const move = useSliderMove<NumberRange>({ value: field.value, pending: field.pending, asking, request });
  const lockedSlider = useLockedSlider(field);
  const [onHandle, setOnHandle] = useState(false);
  if (!field.visible) return null;
  const slider = (
    <Slider
      range
      min={field.min}
      max={field.max}
      step={field.step}
      value={move.value}
      disabled={!field.enabled}
      classNames={lockedSlider.classNames}
      onChange={(value: number[]) => move.onChange(value as NumberRange)}
      onChangeComplete={(value: number[]) => move.onChangeComplete(value as NumberRange)}
      tooltip={{ formatter: (value?: number) => (value === undefined ? '' : field.format(value)) }}
      ariaLabelForHandle={[`${field.label}, ${texts.from}`, `${field.label}, ${texts.to}`]}
      style={sliderStyle(style)}
    />
  );
  // antd's Slider puts no data-* attributes on its root: a wrapper carries them.
  const body = (
    <span
      ref={lockedSlider.ref}
      data-field-id={field.id}
      data-value={`${field.value[0]}..${field.value[1]}`}
      aria-description={fieldAccessibleDescription(field, texts)}
      onMouseOver={(e: MouseEvent<HTMLElement>) => setOnHandle(!!(e.target as HTMLElement).closest('.ant-slider-handle'))}
      onMouseLeave={() => setOnHandle(false)}
      style={{ display: style?.width === undefined ? 'inline-flex' : 'flex', alignItems: 'center', gap: 8, width: style?.width }}
    >
      {showValue && <span style={{ whiteSpace: 'nowrap' }}>{field.valueText}</span>}
      {slider}
    </span>
  );
  // The handles show what the values are (their own tooltips); the track says what the field is.
  return wrap(withTooltip(fieldTooltip(tipField, texts, false), !field.enabled, body, {
    open: asking || onHandle ? false : undefined,
    style,
    stable: true,
  }));
}
