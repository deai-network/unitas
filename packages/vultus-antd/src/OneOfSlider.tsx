import { Slider } from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';
import type { OneOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useOneOfRequest } from './useOneOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props<T extends string> {
  field: OneOfFieldControls<T>;
  style?: CSSProperties;
  /** Style of the choices' labels under the track (e.g. a smaller font in a dense toolbar). */
  markStyle?: CSSProperties;
}

/**
 * A one-of field (useOneOfField) as antd's Slider, for ordered choices: each
 * choice a mark on the track, the handle on the current one. Hovering a mark
 * shows its choice's description, a disabled one its reason first
 * (choiceTooltip); primary and danger choices are styled as
 * CombinedActionButton styles its rows. Hovering any part of the slider shows
 * the field's tooltip (what it is, then the current state), except a mark
 * with a tooltip of its own, which shows that one instead. A choice is
 * requested when the move ends (release, a mark click, an arrow key), not at
 * every step of a drag; ending on a disabled choice requests nothing and the
 * handle returns. The field's confirmation for the requested choice comes
 * first; the handle stays on the requested choice while it is asked and
 * while the commit runs, then shows the stored value (the old one after a
 * Cancel or a failure). A disabled field shows its reason for the whole
 * control.
 */
export function OneOfSlider<T extends string>({ field, style, markStyle }: Props<T>) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useOneOfRequest(field);
  const [moving, setMoving] = useState<number | null>(null);
  const [requested, setRequested] = useState<T | null>(null);
  // On a mark with its own tooltip: the field's is held back meanwhile.
  const [onMark, setOnMark] = useState(false);
  const inFlight = asking || field.pending;
  // Asked and committed (or answered at once, inside the field): forget it.
  useEffect(() => { if (!inFlight) setRequested(null); }, [inFlight, requested]);
  if (!field.visible) return null;
  const choices = field.choices;
  const current = Math.max(0, choices.findIndex((c) => c.value === field.value));
  const held = inFlight && requested !== null ? choices.findIndex((c) => c.value === requested) : -1;
  const settle = (index: number) => {
    setMoving(null);
    const choice = choices[index];
    if (!choice?.enabled) return;
    setRequested(choice.value);
    request(choice.value);
  };
  const slider = (
    <Slider
      min={0}
      max={Math.max(0, choices.length - 1)}
      step={null}
      value={moving ?? (held >= 0 ? held : current)}
      disabled={!field.enabled || field.pending}
      onChange={(index: number) => setMoving(index)}
      onChangeComplete={(index: number) => settle(index)}
      marks={Object.fromEntries(choices.map((c, i) => {
        const tip = field.enabled ? choiceTooltip(c) : undefined;
        return [i, {
          style: { whiteSpace: 'nowrap', ...markStyle },
          label: !field.enabled ? c.label
            : !tip ? <ChoiceLabel choice={c} />
              : (
                <span onMouseEnter={() => setOnMark(true)} onMouseLeave={() => setOnMark(false)}>
                  {withTooltip(tip, !c.enabled, <ChoiceLabel choice={c} />, { open: asking ? false : undefined })}
                </span>
              ),
        }];
      }))}
      // No value bubble on the handle: the whole slider carries the field's tooltip.
      tooltip={{ open: false }}
      ariaLabelForHandle={field.label || undefined}
      ariaValueTextFormatterForHandle={(index?: number) => (index === undefined ? '' : choices[index]?.label ?? '')}
      style={{ minWidth: 160, ...style }}
    />
  );
  // antd's Slider puts no data-* attributes on its root: a wrapper carries them.
  const body = (
    <span
      data-field-id={field.id}
      data-value={field.value}
      aria-description={fieldAccessibleDescription(field, texts)}
      style={{ display: 'inline-block' }}
    >
      {slider}
    </span>
  );
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, body, {
    open: asking || onMark ? false : undefined,
  }));
}
