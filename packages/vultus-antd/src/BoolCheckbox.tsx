import { Checkbox, Spin } from 'antd';
import type { BoolFieldControls } from 'vultus-core';
import { Confirmable } from './Confirmable.js';
import { withReason } from './WithReason.js';

/**
 * A boolean field (useBoolField) as antd's Checkbox with the field's label
 * next to it. Same behaviour as BoolSwitch: the reason as a tooltip when
 * disabled, a spinner while a commit is pending, the confirmation for the
 * requested value before the change.
 */
export function BoolCheckbox({ field }: { field: BoolFieldControls }) {
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
        <Checkbox
          checked={field.value}
          disabled={locked}
          onChange={activate ? () => activate() : undefined}
          title={field.description}
          data-field-id={field.id}
        >
          {field.label}
          {field.pending && <Spin size="small" style={{ marginInlineStart: 8 }} />}
        </Checkbox>
      ))}
    </Confirmable>
  );
}
