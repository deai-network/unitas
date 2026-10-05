import { Checkbox, Spin } from 'antd';
import type { BoolFieldControls, MixedBoolFieldControls } from 'vultus-core';
import { fieldTooltip } from './fieldTooltip.js';
import { useBoolRequest } from './useBoolRequest.js';
import { useConfirm } from './useConfirm.js';
import { withTooltip } from './WithReason.js';

/**
 * A boolean field (useBoolField, or useMixedBoolField for aggregates) as
 * antd's Checkbox with the field's label next to it; mixed is the
 * indeterminate state (a click requests on, a double click off). Same
 * behaviour as BoolSwitch otherwise.
 */
export function BoolCheckbox({ field }: { field: BoolFieldControls | MixedBoolFieldControls }) {
  const { confirm, wrap } = useConfirm({ okText: field.label });
  const click = useBoolRequest(field, confirm);
  if (!field.visible) return null;
  return wrap(withTooltip(fieldTooltip(field), !field.enabled, (
    <Checkbox
      checked={field.value === true}
      indeterminate={field.value === 'mixed'}
      disabled={!field.enabled || field.pending}
      onChange={() => click()}
      aria-description={field.valueDescription}
      data-field-id={field.id}
      data-value={String(field.value)}
    >
      {field.label}
      {field.pending && <Spin size="small" style={{ marginInlineStart: 8 }} />}
    </Checkbox>
  )));
}
