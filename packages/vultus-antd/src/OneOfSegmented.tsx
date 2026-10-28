import { Segmented, Spin, type SegmentedProps } from 'antd';
import { useSpinnerKey, useVultusComponents, type OneOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { choiceLead, fieldAccessibleDescription, fieldTooltip, shownChoiceTooltip, useTooltipField } from './fieldTooltip.js';
import { useOneOfRequest } from './useOneOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props<T extends string> {
  field: OneOfFieldControls<T>;
  size?: SegmentedProps['size'];
  /** Show each choice's icon only (as ActionButton's iconOnly): its label becomes the accessible name and leads its tooltip, before the field's description. */
  iconOnly?: boolean;
}

/**
 * A one-of field (useOneOfField) as antd's Segmented: every choice visible,
 * the current one selected. Each segment shows on hover the field's
 * description first (the enabled control has no tooltip of its own;
 * OneOfSelect's leads with it too; an icon-only choice's label comes before
 * it), then its choice's description, led by "Current state:" on the current
 * segment and "Switch to:" on another enabled one, a disabled one its reason
 * first (shownChoiceTooltip, choiceLead); a segment with nothing of its own still shows the field's
 * description. Primary and danger choices are styled as
 * CombinedActionButton styles its rows. A disabled field shows its reason for
 * the whole control instead (fieldTooltip). The field's label is the
 * accessible name; while the field is pending (a commit runs, or its
 * `pending` option says the app is busy) it is locked and the lent Spinner
 * (or antd's own) follows it; the field's confirmation for the requested
 * choice comes first, its OK labelled with the choice.
 */
export function OneOfSegmented<T extends string>({ field, size, iconOnly }: Props<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useOneOfRequest(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const control = (
    <Segmented<T>
      value={field.value}
      size={size}
      disabled={!field.enabled || field.pending}
      onChange={(next) => request(next)}
      options={field.choices.map((c) => ({
        value: c.value,
        disabled: !c.enabled,
        label: field.enabled
          ? withTooltip(shownChoiceTooltip(tipField, c, iconOnly, choiceLead(c, c.value === field.value, texts)), !c.enabled, <ChoiceLabel choice={c} iconOnly={iconOnly} />, { open: asking ? false : undefined })
          : <ChoiceLabel choice={{ ...c, enabled: false }} iconOnly={iconOnly} />,
      }))}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value}
    />
  );
  return wrap(
    <>
      {field.enabled ? control : withTooltip(fieldTooltip(tipField, texts), true, control)}
      {field.pending && (Spinner
        ? <span style={{ marginInlineStart: 8 }}><Spinner spinnerKey={spinnerKey} size="small" /></span>
        : <Spin size="small" style={{ marginInlineStart: 8 }} />)}
    </>,
  );
}
