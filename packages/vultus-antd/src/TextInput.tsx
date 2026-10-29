import { Input, Spin } from 'antd';
import type { ChangeEvent, CSSProperties, ReactElement } from 'react';
import { useSpinnerKey, useVultusComponents, type TextFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedLook } from './pendingLock.js';
import { useTextDraft } from './useTextDraft.js';
import { useVultusTexts } from './texts.js';
import { splitLayout, withTooltip } from './WithReason.js';

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
 * this widget's own requests. While the field is pending (a commit runs, or
 * its `pending` option says the app is busy) it is locked (isLocked): it is
 * read-only, not disabled, so it keeps the keyboard focus and its draft, is
 * said unavailable, and typing changes nothing.
 */
export function TextInput({ field, style }: TextInputProps) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { value, change, commit, wrap, asking } = useTextDraft(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const locked = isLocked(field);
  const lockedLook = useLockedLook(locked);
  if (!field.visible) return null;
  // Locked, a change goes nowhere: read-only stops typing, this any change that gets past it.
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (!locked) change(e.target.value); };
  const spinner = field.pending
    ? (Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />)
    : null;
  const sharedProps = {
    value,
    placeholder: field.placeholder,
    disabled: !field.enabled,
    readOnly: locked,
    'aria-disabled': locked || undefined,
    onChange,
    onBlur: field.commits ? commit : undefined,
    'aria-label': field.label || undefined,
    'aria-description': fieldAccessibleDescription(field, texts),
    'data-field-id': field.id,
    'data-value': field.value,
  };
  // The textarea and its spinner in one row, which a given width (and the tooltip's span) can size: the textarea grows in it.
  const { width, ...rest } = splitLayout(style).rest;
  const control: ReactElement = field.control === 'textarea'
    ? (
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width }}>
        <Input.TextArea {...sharedProps} style={{ minWidth: 220, ...rest, flex: 1, ...lockedLook.style }} />
        {spinner}
      </span>
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
        style={{ minWidth: 200, ...style, ...lockedLook.style }}
        styles={lockedLook.text && { input: lockedLook.text }}
      />
    );
  // Without a width, antd's Input fills its container: so does the tooltip's span (always there, see withTooltip).
  return wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, control, {
    open: asking ? false : undefined,
    style,
    block: style?.width === undefined,
    stable: true,
  }));
}
