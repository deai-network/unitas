import { Switch, theme } from 'antd';
import type { ManyOfChoiceControls, ManyOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { ChoiceNote } from './ChoiceNote.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedSwitchClassNames } from './pendingLock.js';
import { SpinnerPlace } from './SpinnerPlace.js';
import { useManyOfRequest } from './useManyOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface ManyOfSwitchesProps<T extends string> {
  field: ManyOfFieldControls<T>;
  /** Column layout instead of the default row. */
  vertical?: boolean;
  /** The Switch size. */
  size?: 'small' | 'middle';
}

/**
 * One choice's switch, its label (ChoiceLabel) and its note (ChoiceNote), as
 * ManyOfCheckboxes lays a checkbox's out; the switch and the label are both
 * disabled while the choice is (the label then in the disabled text colour,
 * as a disabled checkbox's is) and either one (the label with its note)
 * toggles it. While `locked` (isLocked) both look disabled too, but the
 * switch is not: it keeps the keyboard focus, is said unavailable, and
 * neither one requests anything. It has its own
 * tooltip (choiceTooltip) while `showTooltip` (the field is enabled). The
 * choice's label is also the switch's accessible name (as BoolSwitch's field
 * label is its own switch's), since the label sits next to it rather than
 * inside it.
 */
function ChoiceSwitch<T extends string>({ choice, size, disabled, locked, showTooltip, asking, onToggle }: {
  choice: ManyOfChoiceControls<T>;
  size: ManyOfSwitchesProps<T>['size'];
  disabled: boolean;
  locked: boolean;
  showTooltip: boolean;
  asking: boolean;
  onToggle: () => void;
}) {
  const { token } = theme.useToken();
  const lockedClassNames = useLockedSwitchClassNames(locked);
  const inactive = disabled || locked;
  return withTooltip(showTooltip ? choiceTooltip(choice) : undefined, !choice.enabled, (
    <span data-choice-value={choice.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Switch
        size={size}
        checked={choice.selected}
        disabled={disabled}
        aria-disabled={locked || undefined}
        classNames={lockedClassNames}
        onChange={() => onToggle()}
        aria-label={choice.label}
      />
      <span
        onClick={inactive ? undefined : () => onToggle()}
        style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 6,
          cursor: inactive ? 'not-allowed' : 'pointer', color: inactive ? token.colorTextDisabled : undefined,
        }}
      >
        <ChoiceLabel choice={choice} />
        <ChoiceNote note={choice.note} />
      </span>
    </span>
  ), { open: asking ? false : undefined, flex: true });
}

/**
 * A many-of field (useManyOfField) as a small Switch per choice next to its
 * label (ChoiceLabel), row or column (`vertical`); clicking either the
 * switch or the label requests the field's value with that choice toggled
 * (useManyOfRequest normalizes it to the field's choice order). A disabled
 * choice's switch and label are disabled and request nothing. Tooltips (an
 * enabled field: choiceTooltip per choice; a disabled field: fieldTooltip
 * over the whole control), the field's accessible name and pending (the
 * spinner's place too) are as ManyOfCheckboxes; `size` is the Switch's own
 * size.
 */
export function ManyOfSwitches<T extends string>({ field, vertical, size }: ManyOfSwitchesProps<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useManyOfRequest(field);
  if (!field.visible) return null;
  const locked = isLocked(field);
  const toggle = (choice: ManyOfChoiceControls<T>) => {
    if (!choice.enabled) return;
    request(choice.selected ? field.value.filter((v) => v !== choice.value) : [...field.value, choice.value]);
  };
  const rows = (
    <div
      role="group"
      style={{
        display: 'inline-flex', flexDirection: vertical ? 'column' : 'row',
        flexWrap: vertical ? undefined : 'wrap', gap: vertical ? 8 : 16,
      }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value.join(',')}
    >
      {field.choices.map((c) => (
        <ChoiceSwitch
          key={c.value}
          choice={c}
          size={size}
          disabled={!c.enabled || !field.enabled}
          locked={c.enabled && locked}
          showTooltip={field.enabled}
          asking={asking}
          onToggle={() => toggle(c)}
        />
      ))}
      {/* In a row, the group's last item (the row's gap spaces it); a column has its own after it. */}
      {!vertical && <SpinnerPlace field={field} gap={0} />}
    </div>
  );
  const control = field.enabled ? rows : withTooltip(fieldTooltip(tipField, texts), true, rows);
  return wrap(
    <>
      {control}
      {vertical && <SpinnerPlace field={field} />}
    </>,
  );
}
