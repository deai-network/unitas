import { Checkbox } from 'antd';
import type { BoolFieldControls, MixedBoolFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedCheckboxClassNames } from './pendingLock.js';
import { SpinnerPlace } from './SpinnerPlace.js';
import { useVultusTexts } from './texts.js';
import { useBoolRequest } from './useBoolRequest.js';
import { useConfirm } from './useConfirm.js';
import { withTooltip } from './WithReason.js';

/**
 * A boolean field (useBoolField, or useMixedBoolField for aggregates) as
 * antd's Checkbox with the field's label next to it; mixed is the
 * indeterminate state (a click requests on, a double click off). Same
 * behaviour as BoolSwitch otherwise, locked while pending too; its spinner
 * sits inside its label, after the text, in its place kept for it idle too
 * (SpinnerPlace).
 */
export function BoolCheckbox({ field }: { field: BoolFieldControls | MixedBoolFieldControls }) {
  const { confirm, wrap, asking } = useConfirm({ okText: field.label });
  const click = useBoolRequest(field, confirm);
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const locked = isLocked(field);
  const lockedClassNames = useLockedCheckboxClassNames(locked);
  if (!field.visible) return null;
  return wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, (
    <Checkbox
      checked={field.value === true}
      indeterminate={field.value === 'mixed'}
      disabled={!field.enabled}
      aria-disabled={locked || undefined}
      classNames={lockedClassNames}
      // Locked, a click (or Space) goes nowhere (as BoolSwitch's: no click/double-click timer
      // armed from mixed), and its activation is cancelled: the browser would clear the input's
      // `indeterminate`, which nothing restores, and a mixed field would be said not checked.
      onClick={locked ? (e) => e.preventDefault() : undefined}
      onChange={locked ? undefined : () => click()}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={String(field.value)}
    >
      {field.label}
      <SpinnerPlace field={field} />
    </Checkbox>
  ), { open: asking ? false : undefined, stable: true }));
}
