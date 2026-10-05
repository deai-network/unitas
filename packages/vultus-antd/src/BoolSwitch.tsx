import { Switch, type SwitchProps } from 'antd';
import type { BoolFieldControls } from 'vultus-core';
import { Confirmable } from './Confirmable.js';
import { withReason } from './WithReason.js';

interface Props {
  field: BoolFieldControls;
  size?: SwitchProps['size'];
}

/**
 * A boolean field (useBoolField) as antd's Switch. The field's label is the
 * switch's accessible name (a visible label is the page's business); a
 * disabled field shows its reason as a tooltip, a pending commit a loading
 * switch, and the field's confirmation for the requested value is obtained
 * before the change is requested.
 */
export function BoolSwitch({ field, size }: Props) {
  if (!field.visible) return null;
  const next = !field.value;
  const locked = !field.enabled || field.pending;
  return (
    <Confirmable
      confirmation={field.confirmationFor(next)}
      onConfirm={() => field.setValue(next)}
      okText={field.label}
      disabled={locked}
    >
      {(activate) => withReason(field.whyDisabled, !field.enabled, (
        <Switch
          checked={field.value}
          size={size}
          loading={field.pending}
          disabled={locked}
          onChange={activate ? () => activate() : undefined}
          aria-label={field.label || undefined}
          title={field.description}
          data-field-id={field.id}
        />
      ))}
    </Confirmable>
  );
}
