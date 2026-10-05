import { Checkbox, Spin } from 'antd';
import type { BoolFieldControls, MixedBoolFieldControls } from 'vultus-core';
import { Confirmable } from './Confirmable.js';
import { fieldTooltip } from './fieldTooltip.js';
import { withTooltip } from './WithReason.js';

/**
 * A boolean field (useBoolField, or useMixedBoolField for aggregates) as
 * antd's Checkbox with the field's label next to it; mixed is the
 * indeterminate state, and a click requests on. Same behaviour as
 * BoolSwitch otherwise.
 */
export function BoolCheckbox({ field }: { field: BoolFieldControls | MixedBoolFieldControls }) {
  if (!field.visible) return null;
  const on = field.value === true;
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
        <Checkbox
          checked={on}
          indeterminate={field.value === 'mixed'}
          disabled={locked}
          onChange={activate ? () => activate() : undefined}
          aria-description={field.valueDescription}
          data-field-id={field.id}
          data-value={String(field.value)}
        >
          {field.label}
          {field.pending && <Spin size="small" style={{ marginInlineStart: 8 }} />}
        </Checkbox>
      ))}
    </Confirmable>
  );
}
