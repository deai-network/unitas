import { Input, Spin } from 'antd';
import type { ChangeEvent, CSSProperties, KeyboardEvent } from 'react';
import { useSpinnerKey, useVultusComponents, type TextFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useTextDraft } from './useTextDraft.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface SearchInputProps {
  field: TextFieldControls;
  /** Called on Enter with the typed text, after it has been requested (at once, or — when the field commits — the draft). */
  onEnter?: (typed: string) => void;
  style?: CSSProperties;
}

/**
 * A text field (useTextField) as antd's Input with a search icon as its
 * `prefix` (an inline SVG, as fieldTooltip.tsx's icons — no
 * @ant-design/icons dependency) and `allowClear`. Same request rule as
 * TextInput: a field that does not commit requests on every keystroke, so
 * the clear button (which fires `onChange` with `''` like any other edit)
 * already requests at once there; a committing field keeps a draft instead,
 * so clearing is wired as an explicit action through antd's `onClear` (fired
 * once per click, separately from `onChange`): it resets the draft and
 * requests `''` at once, not waiting for a blur or Enter — the same as
 * Escape, which clears (resets the draft and requests `''`) in every mode,
 * via the same `clear` function. `onEnter` fires after Enter's request (if
 * the field commits — a non-committing field already requested live, on the
 * keystroke that produced the value), so a caller can run a search once the
 * field holds (or is about to hold) the typed text; it gets that text, which
 * a committing field's `value` shows only once the commit is done. Enter and Escape are
 * both ignored mid-IME-composition (`e.nativeEvent.isComposing`), as
 * TextInput's `onPressEnter` already is by antd itself — composing text is
 * not done yet, so the value should not request and no shortcut should fire.
 * The input shows a draft in both modes, as TextInput's (useTextDraft).
 */
export function SearchInput({ field, onEnter, style }: SearchInputProps) {
  const texts = useVultusTexts();
  const { value, change, commit, clear, wrap, asking } = useTextDraft(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const disabled = !field.enabled || field.pending;
  const onChange = (e: ChangeEvent<HTMLInputElement>) => change(e.target.value);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Escape') clear();
    else if (e.key === 'Enter') {
      if (field.commits) commit();
      onEnter?.(value);
    }
  };
  const spinner = field.pending
    ? (Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />)
    : null;
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, (
    <Input
      value={value}
      placeholder={field.placeholder}
      disabled={disabled}
      allowClear
      prefix={<SearchIcon />}
      // Always a real element, never undefined: toggling antd's `suffix` between a node and
      // undefined as `field.pending` flips makes antd remount the affix wrapper and drop focus
      // (its own dev warning). An always-present (if sometimes empty) slot keeps the wrapper
      // stable; here `allowClear` already forces that wrapper to exist regardless.
      suffix={spinner ?? <></>}
      onChange={onChange}
      onClear={field.commits ? clear : undefined}
      onBlur={field.commits ? commit : undefined}
      onKeyDown={onKeyDown}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value}
      style={{ minWidth: 200, ...style }}
    />
  ), { open: asking ? false : undefined, block: !!style?.width }));
}

// antd's SearchOutlined, inlined (as InfoCircleIcon/StopIcon in fieldTooltip.tsx) so
// vultus-antd needs no @ant-design/icons dependency; same markup and path as the icon component.
function SearchIcon() {
  return (
    <span role="img" aria-label="search" className="anticon anticon-search">
      <svg viewBox="64 64 896 896" focusable="false" data-icon="search" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path d="M909.6 854.5L649.9 594.8C690.2 542.7 712 479 712 412c0-80.2-31.3-155.4-87.9-212.1-56.6-56.7-132-87.9-212.1-87.9s-155.5 31.3-212.1 87.9C143.2 256.5 112 331.8 112 412c0 80.1 31.3 155.5 87.9 212.1C256.5 680.8 331.8 712 412 712c67 0 130.6-21.8 182.7-62l259.7 259.6a8.2 8.2 0 0011.6 0l43.6-43.5a8.2 8.2 0 000-11.6zM570.4 570.4C528 612.7 471.8 636 412 636s-116-23.3-158.4-65.6C211.3 528 188 471.8 188 412s23.3-116.1 65.6-158.4C296 211.3 352.2 188 412 188s116.1 23.2 158.4 65.6S636 352.2 636 412s-23.3 116.1-65.6 158.4z" />
      </svg>
    </span>
  );
}
