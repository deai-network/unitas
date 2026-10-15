import { Input, Spin } from 'antd';
import { useEffect, useState, type ChangeEvent, type CSSProperties, type ReactElement } from 'react';
import { useSpinnerKey, useVultusComponents, type TextFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useFieldRequest } from './useFieldRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props {
  field: TextFieldControls;
  style?: CSSProperties;
}

/**
 * A text field (useTextField) as antd's Input, or Input.TextArea when
 * `field.control === 'textarea'`. A field inside the field, or changed
 * locally (`!field.commits`), requests on every keystroke — there is no
 * ambiguity to wait out, as a numeric or tree value has, so a bound form's
 * own state stays in step at once; a confirmation configured on such a field
 * (through `useFieldRequest`) would then be asked on every change too, one
 * at a time (field.confirmationFor is only ever set through `commit`, so
 * this does not arise from useTextField's own options today, but the widget
 * stays consistent with the shared hook regardless). A committing field
 * keeps a draft while typing and requests only when editing ends: on blur,
 * or on Enter for the single-line input (a textarea's Enter is a newline,
 * so only blur requests there). The draft follows the field's value
 * whenever it changes other than through this widget's own in-flight
 * request (as NumericInput's).
 */
export function TextInput({ field, style }: Props) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useFieldRequest(field, { equal: (a, b) => a === b });
  const [draft, setDraft] = useState(field.value);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const inFlight = asking || field.pending;
  useEffect(() => { if (!inFlight) setDraft(field.value); }, [field.value, inFlight]);
  if (!field.visible) return null;
  const commitDraft = () => request(draft);
  const value = field.commits ? draft : field.value;
  const disabled = !field.enabled || field.pending;
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = e.target.value;
    if (field.commits) setDraft(next); else request(next);
  };
  const spinner = field.pending
    ? (Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />)
    : null;
  const sharedProps = {
    value,
    placeholder: field.placeholder,
    disabled,
    onChange,
    onBlur: field.commits ? commitDraft : undefined,
    'aria-label': field.label || undefined,
    'aria-description': fieldAccessibleDescription(field, texts),
    'data-field-id': field.id,
    'data-value': field.value,
  };
  const control: ReactElement = field.control === 'textarea'
    ? (
      <>
        <Input.TextArea {...sharedProps} style={{ minWidth: 220, ...style }} />
        {spinner && <span style={{ marginInlineStart: 8 }}>{spinner}</span>}
      </>
    )
    : (
      <Input
        {...sharedProps}
        onPressEnter={field.commits ? commitDraft : undefined}
        suffix={spinner || undefined}
        style={{ minWidth: 200, ...style }}
      />
    );
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, control, {
    open: asking ? false : undefined,
    block: !!style?.width,
  }));
}
