import type { ReactNode } from 'react';
import type { FieldControls } from 'vultus-core';
import { ReasonMarkdown } from './ReasonMarkdown.js';
import type { VultusTexts } from './texts.js';

type DescribedField = Pick<FieldControls<unknown, unknown>, 'enabled' | 'whyDisabled' | 'description' | 'valueDescription'>;

/** "Current state: <what the current value means>", or nothing without a value description. */
function currentState(field: DescribedField, texts: VultusTexts): string | undefined {
  return field.valueDescription ? `${texts.currentState} ${field.valueDescription}` : undefined;
}

/**
 * What a field's tooltip says. Enabled: what the field is, then its current
 * state (the value's description, led by "Current state:", so it is not read
 * as a promise of what the field does). Disabled: why, then what the field
 * is; the current state is left out, since its description usually says what
 * a click would do.
 */
export function fieldTooltip(field: DescribedField, texts: VultusTexts): ReactNode | undefined {
  const parts: ReactNode[] = field.enabled
    ? [field.description, currentState(field, texts)]
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

/** The field's accessible description: what it is, then its current state (as the enabled tooltip). */
export function fieldAccessibleDescription(field: DescribedField, texts: VultusTexts): string | undefined {
  return [field.description, currentState(field, texts)].filter(Boolean).join(' ') || undefined;
}
