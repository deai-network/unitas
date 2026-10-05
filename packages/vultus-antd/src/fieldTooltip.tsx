import type { ReactNode } from 'react';
import type { FieldControls } from 'vultus-core';
import { ReasonMarkdown } from './ReasonMarkdown.js';

/**
 * What a field's tooltip says. Enabled: what the current value means, then
 * what the field is. Disabled: why, then what the field is; the value's
 * description is left out, since it usually says what a click would do.
 */
export function fieldTooltip(field: Pick<FieldControls<unknown, unknown>, 'enabled' | 'whyDisabled' | 'description' | 'valueDescription'>): ReactNode | undefined {
  const parts: ReactNode[] = field.enabled
    ? [field.valueDescription, field.description]
    : [field.whyDisabled && <ReasonMarkdown key="reason">{field.whyDisabled}</ReasonMarkdown>, field.description];
  const present = parts.filter(Boolean);
  if (present.length === 0) return undefined;
  return (
    <>
      {present.map((part, index) => (
        <div key={index} style={{ marginTop: index > 0 ? 6 : 0 }}>{part}</div>
      ))}
    </>
  );
}
