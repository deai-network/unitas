import { Spin, Switch } from 'antd';
import { useSpinnerKey, useVultusComponents, type ManyOfChoiceControls, type ManyOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
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
 * One choice's switch and its label (ChoiceLabel), both disabled while the
 * choice is and either one toggling it, with its own tooltip (choiceTooltip)
 * while `showTooltip` (the field is enabled). The choice's label is also the
 * switch's accessible name (as BoolSwitch's field label is its own switch's),
 * since the label sits next to it rather than inside it.
 */
function ChoiceSwitch<T extends string>({ choice, size, disabled, showTooltip, asking, onToggle }: {
  choice: ManyOfChoiceControls<T>;
  size: ManyOfSwitchesProps<T>['size'];
  disabled: boolean;
  showTooltip: boolean;
  asking: boolean;
  onToggle: () => void;
}) {
  return withTooltip(showTooltip ? choiceTooltip(choice) : undefined, !choice.enabled, (
    <span data-choice-value={choice.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Switch
        size={size}
        checked={choice.selected}
        disabled={disabled}
        onChange={() => onToggle()}
        aria-label={choice.label}
      />
      <span onClick={disabled ? undefined : () => onToggle()} style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <ChoiceLabel choice={choice} />
      </span>
    </span>
  ), { open: asking ? false : undefined });
}

/**
 * A many-of field (useManyOfField) as a small Switch per choice next to its
 * label (ChoiceLabel), row or column (`vertical`); clicking either the
 * switch or the label requests the field's value with that choice toggled
 * (useManyOfRequest normalizes it to the field's choice order). A disabled
 * choice's switch and label are disabled and request nothing. Tooltips (an
 * enabled field: choiceTooltip per choice; a disabled field: fieldTooltip
 * over the whole control), the field's accessible name and pending are as
 * ManyOfCheckboxes; `size` is the Switch's own size.
 */
export function ManyOfSwitches<T extends string>({ field, vertical, size }: ManyOfSwitchesProps<T>) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useManyOfRequest(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const disabled = !field.enabled || field.pending;
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
          disabled={!c.enabled || disabled}
          showTooltip={field.enabled}
          asking={asking}
          onToggle={() => toggle(c)}
        />
      ))}
    </div>
  );
  const control = field.enabled ? rows : withTooltip(fieldTooltip(field, texts), true, rows);
  return wrap(
    <>
      {control}
      {field.pending && (Spinner
        ? <span style={{ marginInlineStart: 8 }}><Spinner spinnerKey={spinnerKey} size="small" /></span>
        : <Spin size="small" style={{ marginInlineStart: 8 }} />)}
    </>,
  );
}
