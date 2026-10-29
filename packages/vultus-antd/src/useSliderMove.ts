import { useEffect, useState, type CSSProperties } from 'react';
import { splitLayout } from './WithReason.js';

/**
 * The style of a slider widget's antd Slider (NumericSlider, RangeSlider, OneOfSlider), from the
 * widget's `style`: at least 160px wide. The layout keys (flex, margins, ...) go to the widget's
 * anchor span (withTooltip `stable`), not here. A `style.width` goes to the slider's body (a flex
 * box, beside the shown value if any), in which the Slider grows instead, so `'100%'` fills the
 * container.
 */
export function sliderStyle(style: CSSProperties | undefined): CSSProperties {
  const { width, ...rest } = splitLayout(style).rest;
  if (width === undefined) return { minWidth: 160, ...rest };
  return { minWidth: 160, ...rest, flex: 1 };
}

export interface SliderMove<T> {
  /** What the slider should show now. */
  value: T;
  /** Wire to the control's `onChange` (every step of a move, e.g. a drag). */
  onChange: (next: T) => void;
  /** Wire to the control's `onChangeComplete` (a move ends: release, an arrow key's keyup). */
  onChangeComplete: (next: T) => void;
}

/**
 * The moving/held machinery NumericSlider and RangeSlider share (OneOfSlider keeps its
 * own: it moves over choice indexes, holds a choice, and requests nothing on a disabled
 * one, by the same rules). While a move is in progress (`onChange`, e.g. a drag or an arrow key before
 * its keyup) the slider shows that in-progress value, not yet requested. At the end of a
 * move (`onChangeComplete`) the moved-to value is requested (`request`) and, if the
 * request was taken, per the owner's slider rule (no jump back to the old value while a
 * request is in flight — vultus-field-model-design item 26), held on screen while a
 * confirmation for it is open (`asking`) or its commit is pending (`pending`); once
 * neither is true — confirmed and committed, cancelled, or failed — the field's own
 * `value` shows again: the new one on success, the old one after a Cancel or a failure. A
 * request not taken (another one's confirmation is still open, or it names the value)
 * holds nothing, so the handle stays on the value being asked about. While `pending` the
 * slider is locked, not disabled (useLockedSlider: its handle keeps the keyboard focus, and
 * antd's Slider still moves it on an arrow key or a drag): a move shows nothing, the handle
 * staying on the held or the field's value, and its end requests nothing (refused while
 * pending).
 */
export function useSliderMove<T>({ value, pending, asking, request }: {
  value: T;
  pending: boolean;
  asking: boolean;
  request: (next: T) => boolean;
}): SliderMove<T> {
  const [moving, setMoving] = useState<T | null>(null);
  const [held, setHeld] = useState<T | null>(null);
  const inFlight = asking || pending;
  // Asked and committed (or answered at once, inside the field): forget the held value.
  useEffect(() => { if (!inFlight) setHeld(null); }, [inFlight]);
  const onChangeComplete = (next: T) => {
    setMoving(null);
    if (request(next)) setHeld(next);
  };
  return {
    // A move begun before pending started shows nothing meanwhile either.
    value: (pending ? null : moving) ?? (inFlight && held !== null ? held : value),
    onChange: (next) => { if (!pending) setMoving(next); },
    onChangeComplete,
  };
}
