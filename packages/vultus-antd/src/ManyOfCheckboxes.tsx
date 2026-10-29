import { Checkbox } from 'antd';
import type { ManyOfChoiceControls, ManyOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { ChoiceNote } from './ChoiceNote.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedCheckboxClassNames } from './pendingLock.js';
import { SpinnerPlace } from './SpinnerPlace.js';
import { useManyOfRequest } from './useManyOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface ManyOfCheckboxesProps<T extends string> {
  field: ManyOfFieldControls<T>;
  /** Column layout instead of the default row. */
  vertical?: boolean;
}

/**
 * One choice's checkbox: its label (ChoiceLabel) and note (ChoiceNote),
 * disabled while the choice is, with its own tooltip (choiceTooltip) while
 * `showTooltip` (the field is enabled). While `locked` (isLocked) it looks
 * disabled but is not: it keeps the keyboard focus and is said unavailable.
 */
function ChoiceCheckbox<T extends string>({ choice, disabled, locked, showTooltip, asking, onToggle }: {
  choice: ManyOfChoiceControls<T>;
  disabled: boolean;
  locked: boolean;
  showTooltip: boolean;
  asking: boolean;
  onToggle: () => void;
}) {
  const lockedClassNames = useLockedCheckboxClassNames(locked);
  return withTooltip(showTooltip ? choiceTooltip(choice) : undefined, !choice.enabled, (
    <Checkbox
      skipGroup
      checked={choice.selected}
      disabled={disabled}
      aria-disabled={locked || undefined}
      classNames={lockedClassNames}
      onChange={() => onToggle()}
      data-choice-value={choice.value}
    >
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
        <ChoiceLabel choice={choice} />
        <ChoiceNote note={choice.note} />
      </span>
    </Checkbox>
  ), { open: asking ? false : undefined });
}

/**
 * A many-of field (useManyOfField) as antd's Checkbox.Group: one checkbox per
 * choice (its label in ChoiceLabel, then its note in ChoiceNote), row or
 * column (`vertical`). A disabled choice's checkbox is disabled, and clicking
 * it requests nothing; clicking an enabled one requests the field's value
 * with that choice toggled (useManyOfRequest normalizes it to the field's
 * choice order, so where it lands in the list doesn't matter). An enabled
 * field shows each choice's own tooltip on hover (choiceTooltip: a disabled
 * choice's reason first, then its description — no "Current state:"/"Switch
 * to:" lead, since every choice is already shown, selected or not); a
 * disabled field shows its reason for the whole control instead
 * (fieldTooltip). The field's label is the group's accessible name; while
 * the field is pending (a commit runs, or its `pending` option says the app
 * is busy) its checkboxes are locked (isLocked: they keep the keyboard
 * focus, are said unavailable, and a click requests nothing) and the lent
 * Spinner (or antd's own) shows in its place, kept for it idle too
 * (SpinnerPlace): in a row the group's last item, after the choices, so the
 * row wraps alike idle and pending; after a column, beside it.
 */
export function ManyOfCheckboxes<T extends string>({ field, vertical }: ManyOfCheckboxesProps<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useManyOfRequest(field);
  if (!field.visible) return null;
  const locked = isLocked(field);
  const toggle = (choice: ManyOfChoiceControls<T>) => {
    if (!choice.enabled) return;
    request(choice.selected ? field.value.filter((v) => v !== choice.value) : [...field.value, choice.value]);
  };
  const group = (
    <Checkbox.Group
      disabled={!field.enabled}
      style={{ display: 'inline-flex', flexDirection: vertical ? 'column' : 'row' }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value.join(',')}
    >
      {field.choices.map((c) => (
        <ChoiceCheckbox
          key={c.value}
          choice={c}
          disabled={!c.enabled || !field.enabled}
          locked={c.enabled && locked}
          showTooltip={field.enabled}
          asking={asking}
          onToggle={() => toggle(c)}
        />
      ))}
      {/* In a row, the group's last item (antd's group spaces its items); a column has its own after it. */}
      {!vertical && <SpinnerPlace field={field} gap={0} />}
    </Checkbox.Group>
  );
  const control = field.enabled ? group : withTooltip(fieldTooltip(tipField, texts), true, group);
  return wrap(
    <>
      {control}
      {vertical && <SpinnerPlace field={field} />}
    </>,
  );
}
