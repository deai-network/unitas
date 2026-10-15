import { Select, type SelectProps } from 'antd';
import { useState, type CSSProperties } from 'react';
import { normalizeText, useSpinnerKey, useVultusComponents, type ManyOfChoiceControls, type ManyOfFieldControls } from 'vultus-core';
import { ChoiceRow } from './ChoiceNote.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip } from './fieldTooltip.js';
import { useManyOfRequest } from './useManyOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props<T extends string> {
  field: ManyOfFieldControls<T>;
  size?: SelectProps['size'];
  style?: CSSProperties;
}

/**
 * A many-of field (useManyOfField) as antd's Select in `mode="multiple"`:
 * each selected choice a tag, collapsing to "+N ..." once they no longer fit
 * (`maxTagCount="responsive"`, Review Focus 5); `allowClear` clears every
 * choice at once, requesting `[]`. In the open list each choice shows its
 * label (ChoiceLabel) and note (ChoiceNote), right-aligned, with its own
 * tooltip on hover (choiceTooltip: a disabled choice's reason first, then its
 * description); a disabled choice cannot be selected. The search box filters
 * choices by label, accent- and case-insensitive (`normalizeText`), as the
 * tree hook's search does. Choices with a `group` are listed after the
 * others, under their group's heading (as OneOfSelect). Closed, the select
 * shows `field.placeholder` while empty and the field's tooltip
 * (`fieldTooltip`: disabled, its reason first), held back while the list is
 * open or a confirmation is asking. Each change (picking, removing a tag,
 * clearing) requests the new list through `useManyOfRequest`, which
 * normalizes it to the field's choice order. The field's label is the
 * accessible name; a pending commit shows a loading select.
 */
export function ManyOfSelect<T extends string>({ field, size, style }: Props<T>) {
  const texts = useVultusTexts();
  const { request, wrap, asking } = useManyOfRequest(field);
  const [open, setOpen] = useState(false);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const byValue = new Map(field.choices.map((c) => [c.value as string, c]));
  const option = (c: ManyOfChoiceControls<T>) => ({ value: c.value, label: c.label, title: '', disabled: !c.enabled });
  const groups = [...new Set(field.choices.flatMap((c) => (c.group ? [c.group] : [])))];
  const options = [
    ...field.choices.filter((c) => !c.group).map(option),
    ...groups.map((g) => ({ label: g, title: '', options: field.choices.filter((c) => c.group === g).map(option) })),
  ];
  return wrap(withTooltip(fieldTooltip(field, texts), !field.enabled, (
    <Select
      mode="multiple"
      value={field.value}
      size={size}
      style={{ minWidth: 200, ...style }}
      loading={field.pending}
      // See OneOfSelect: `suffixIcon` is the one loading-related prop antd
      // strips before forwarding the rest to @rc-component/select.
      suffixIcon={Spinner && field.pending ? <Spinner spinnerKey={spinnerKey} size="small" /> : undefined}
      disabled={!field.enabled || field.pending}
      onChange={(next: T[]) => request(next)}
      onOpenChange={setOpen}
      allowClear
      maxTagCount="responsive"
      placeholder={field.placeholder}
      virtual={false}
      // An empty title keeps antd from putting the label in a native
      // tooltip on each option, where it would compete with ours.
      title=""
      options={options}
      filterOption={(input, option) => {
        if (!option || !('value' in option) || option.value === undefined) return false;
        const choice = byValue.get(String(option.value));
        return choice ? normalizeText(choice.label).includes(normalizeText(input)) : false;
      }}
      optionRender={(option) => {
        const choice = byValue.get(String(option.value));
        if (!choice) return option.label;
        return withTooltip(choiceTooltip(choice), !choice.enabled, <ChoiceRow choice={choice} />, { placement: 'right', block: true });
      }}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={field.value.join(',')}
    />
  ), { open: open || asking ? false : undefined, width: style?.width }));
}
