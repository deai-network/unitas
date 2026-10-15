import { Slider } from 'antd';
import { useState, type CSSProperties, type MouseEvent } from 'react';
import type { NumericFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useNumericRequest } from './useNumericRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props {
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
 * is open.
 */
export function NumericSlider({ field, style, showValue }: Props) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useNumericRequest(field);
  const [moving, setMoving] = useState<number | null>(null);
  const [onHandle, setOnHandle] = useState(false);
  if (field.min === undefined || field.max === undefined) {
    throw new Error(`Field '${field.id}': NumericSlider needs min and max`);
  }
  if (!field.visible) return null;
  const settle = (value: number) => {
    setMoving(null);
    request(value);
  };
  const slider = (
    <Slider
      min={field.min}
      max={field.max}
      step={field.step}
      value={moving ?? field.value}
      disabled={!field.enabled || field.pending}
      onChange={(value: number) => setMoving(value)}
      onChangeComplete={(value: number) => settle(value)}
      tooltip={{ formatter: (value?: number) => (value === undefined ? '' : field.format(value)) }}
      ariaLabelForHandle={field.label || undefined}
      style={{ minWidth: 160, ...style }}
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
    >
      {showValue && <span>{field.valueText}</span>}
      {slider}
    </span>
  );
  // The handle shows what the value is (its own tooltip); the track says what the field is.
  return wrap(withTooltip(fieldTooltip(field, texts, false), !field.enabled, body, {
    open: asking || onHandle ? false : undefined,
  }));
}
