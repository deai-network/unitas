import { Input, Spin } from 'antd';
import type { ChangeEvent, CSSProperties, ReactElement } from 'react';
import { useSpinnerKey, useVultusComponents, type TextFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useTextDraft } from './useTextDraft.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface TextInputProps {
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
 * so only blur requests there). The input shows a draft in both modes
 * (useTextDraft), so a value stored later than the keystroke (an app's
 * asynchronous onChange, the URL store) keeps the caret and every character;
 * the draft follows the field's value whenever it changes other than through
 * this widget's own requests.
 */
export function TextInput({ field, style }: TextInputProps) {
  const texts = useVultusTexts();
  const { value, change, commit, wrap, asking } = useTextDraft(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const disabled = !field.enabled || field.pending;
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(e.target.value);
  const spinner = field.pending
    ? (Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />)
    : null;
  const sharedProps = {
    value,
    placeholder: field.placeholder,
    disabled,
    onChange,
    onBlur: field.commits ? commit : undefined,
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
        onPressEnter={field.commits ? commit : undefined}
        // Always a real element, never undefined: toggling antd's `suffix` between a node and
        // undefined as `field.pending` flips makes antd remount the affix wrapper and drop
        // focus (its own dev warning) — an always-present (if sometimes empty) slot keeps the
        // wrapper stable instead.
        suffix={spinner ?? <></>}
        style={{ minWidth: 200, ...style }}
      />
    );
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, control, {
    open: asking ? false : undefined,
    block: !!style?.width,
  }));
}
