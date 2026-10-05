import { Switch, theme, type SwitchProps } from 'antd';
import type { BoolFieldControls, MixedBoolFieldControls } from 'vultus-core';
import { Confirmable } from './Confirmable.js';
import { fieldTooltip } from './fieldTooltip.js';
import { withTooltip } from './WithReason.js';

interface Props {
  field: BoolFieldControls | MixedBoolFieldControls;
  size?: SwitchProps['size'];
}

/**
 * A boolean field (useBoolField, or useMixedBoolField for aggregates) as
 * antd's Switch. Mixed: the knob in the middle of a half-tinted track; a click
 * requests on. The field's label is the switch's accessible name, the current
 * value's description its accessible description (ARIA's switch has no
 * "mixed"). The tooltip follows fieldTooltip; a pending commit shows a loading
 * switch; the field's confirmation for the requested value comes first.
 */
export function BoolSwitch({ field, size }: Props) {
  const { token } = theme.useToken();
  if (!field.visible) return null;
  const on = field.value === true;
  const mixed = field.value === 'mixed';
  const next = !on;
  const locked = !field.enabled || field.pending;
  return (
    <Confirmable
      confirmation={field.confirmationFor(next)}
      onConfirm={() => field.setValue(next)}
      okText={field.label}
      disabled={locked}
    >
      {(activate) => withTooltip(fieldTooltip(field), !field.enabled, (
        <Switch
          checked={on}
          size={size}
          loading={field.pending}
          disabled={locked}
          onChange={activate ? () => activate() : undefined}
          aria-label={field.label || undefined}
          aria-description={field.valueDescription}
          data-field-id={field.id}
          data-value={String(field.value)}
          styles={mixed ? {
            root: { background: `linear-gradient(90deg, ${token.colorPrimary} 50%, ${token.colorTextQuaternary} 50%)` },
            indicator: { insetInlineStart: '50%', transform: 'translateX(-50%)' },
          } : undefined}
        />
      ))}
    </Confirmable>
  );
}
