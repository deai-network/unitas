import { InputNumber, Spin } from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';
import { useSpinnerKey, useVultusComponents, type NumericFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { useNumericRequest } from './useNumericRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface NumericInputProps {
  field: NumericFieldControls;
  style?: CSSProperties;
}

/**
 * A numeric field (useNumericField) as antd's InputNumber: `min`/`max`/`step`
 * from the field, `precision` 0 when `integer`, the unit as its suffix (next
 * to the lent Spinner, or antd's own, while pending). It keeps a draft while
 * editing — each keystroke only changes the draft, not the field — and
 * requests when editing ends: on blur, on Enter, or on a stepper click
 * (antd's `onStep`). An empty or unparsable draft on blur (or Enter) returns
 * to the field's value, requesting nothing. The draft follows the field's
 * value whenever it changes other than through this widget's own in-flight
 * request (useNumericRequest's `asking` plus the field's own `pending`): a
 * second Enter or blur before that request lands re-sends the same draft,
 * which useNumericRequest already turns into a no-op, so it still requests
 * only once.
 */
export function NumericInput({ field, style }: NumericInputProps) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useNumericRequest(field);
  const [draft, setDraft] = useState<number | null>(field.value);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const inFlight = asking || field.pending;
  useEffect(() => { if (!inFlight) setDraft(field.value); }, [field.value, inFlight]);
  if (!field.visible) return null;
  const commitDraft = () => {
    if (draft === null || !Number.isFinite(draft)) { setDraft(field.value); return; }
    request(draft);
  };
  const spinner = field.pending
    ? (Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />)
    : null;
  return wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, (
    <InputNumber
      value={draft}
      min={field.min}
      max={field.max}
      step={field.step}
      precision={field.integer ? 0 : undefined}
      placeholder={field.placeholder}
      // Always a real element, never undefined, even with neither a spinner nor a unit: toggling
      // antd's `suffix` on and off as `field.pending` flips makes antd remount the affix wrapper
      // and drop focus (the same caveat Input itself warns about) — an always-present (if
      // sometimes empty) slot keeps the wrapper stable instead.
      suffix={<>{spinner}{field.unit}</>}
      disabled={!field.enabled || field.pending}
      onChange={(next) => setDraft(next)}
      onBlur={commitDraft}
      onPressEnter={commitDraft}
      onStep={(next) => { const value = Number(next); setDraft(value); request(value); }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={String(field.value)}
      style={{ minWidth: 120, ...style }}
    />
  ), { open: asking ? false : undefined, width: style?.width }));
}
