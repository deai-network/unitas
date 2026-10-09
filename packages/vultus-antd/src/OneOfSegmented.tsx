import { Segmented, type SegmentedProps } from 'antd';
import type { OneOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useOneOfRequest } from './useOneOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props<T extends string> {
  field: OneOfFieldControls<T>;
  size?: SegmentedProps['size'];
  /** Show each choice's icon only (as ActionButton's iconOnly): its label becomes the accessible name and leads its tooltip. */
  iconOnly?: boolean;
}

/**
 * A one-of field (useOneOfField) as antd's Segmented: every choice visible,
 * the current one selected. Each segment shows its choice's description on
 * hover, a disabled one its reason first (choiceTooltip); primary and danger
 * choices are styled as CombinedActionButton styles its rows. A disabled field
 * shows its reason for the whole control instead (fieldTooltip). The field's
 * label is the accessible name; a pending commit locks it; the field's
 * confirmation for the requested choice comes first, its OK labelled with the
 * choice.
 */
export function OneOfSegmented<T extends string>({ field, size, iconOnly }: Props<T>) {
  const texts = useVultusTexts();
  const { request, wrap } = useOneOfRequest(field);
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
          ? withTooltip(choiceTooltip(c, iconOnly), !c.enabled, <ChoiceLabel choice={c} iconOnly={iconOnly} />)
          : <ChoiceLabel choice={{ ...c, enabled: false }} iconOnly={iconOnly} />,
      }))}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value}
    />
  );
  return wrap(field.enabled ? control : withTooltip(fieldTooltip(field, texts), true, control));
}
