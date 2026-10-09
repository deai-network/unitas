import { Select, type SelectProps } from 'antd';
import { useState, type CSSProperties } from 'react';
import type { OneOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useOneOfRequest } from './useOneOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props<T extends string> {
  field: OneOfFieldControls<T>;
  size?: SelectProps['size'];
  style?: CSSProperties;
}

/**
 * A one-of field (useOneOfField) as antd's Select. Closed, its tooltip follows
 * fieldTooltip (what the field is, then "Current state:" and the current
 * choice's description; disabled: the reason first); it is held back while the
 * list is open. In the list each choice shows its description on hover, a
 * disabled one its reason first (choiceTooltip). Primary and danger choices
 * are styled as CombinedActionButton styles its rows (ChoiceLabel), the closed
 * select mirroring the current one. Choices with a `group` are listed after
 * the others, under their group's heading (antd option groups, in the order
 * the groups first appear). The field's label is the
 * accessible name; a pending commit shows a loading select; the field's
 * confirmation for the requested choice comes first, its OK labelled with the
 * choice.
 */
export function OneOfSelect<T extends string>({ field, size, style }: Props<T>) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useOneOfRequest(field);
  const [open, setOpen] = useState(false);
  if (!field.visible) return null;
  const byValue = new Map(field.choices.map((c) => [c.value as string, c]));
  const option = (c: (typeof field.choices)[number]) => ({ value: c.value, label: c.label, title: '', disabled: !c.enabled });
  const groups = [...new Set(field.choices.flatMap((c) => (c.group ? [c.group] : [])))];
  const options = [
    ...field.choices.filter((c) => !c.group).map(option),
    ...groups.map((g) => ({ label: g, title: '', options: field.choices.filter((c) => c.group === g).map(option) })),
  ];
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, (
    <Select
      value={field.value}
      size={size}
      style={{ minWidth: 160, ...style }}
      loading={field.pending}
      disabled={!field.enabled || field.pending}
      onChange={(next: T) => request(next)}
      onOpenChange={setOpen}
      virtual={false}
      // An empty title keeps antd from putting the label in a native
      // tooltip on each option and on the closed select, where it would
      // compete with ours.
      title=""
      options={options}
      optionRender={(option) => {
        const choice = byValue.get(String(option.value));
        if (!choice) return option.label;
        return withTooltip(choiceTooltip(choice), !choice.enabled, <ChoiceLabel choice={choice} />, { placement: 'right', block: true });
      }}
      // Closed, the current choice mirrors its variant (as the combined
      // button's opener mirrors the selected action), unless the field is
      // disabled.
      labelRender={(selected) => {
        const choice = byValue.get(String(selected.value));
        if (!choice) return selected.label;
        return field.enabled ? <ChoiceLabel choice={choice} /> : choice.label;
      }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value}
    />
  ), { open: open || asking ? false : undefined }));
}
