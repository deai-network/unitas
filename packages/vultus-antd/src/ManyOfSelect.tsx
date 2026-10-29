import { Select, type SelectProps } from 'antd';
import { useState, type CSSProperties } from 'react';
import { normalizeText, useSpinnerKey, useVultusComponents, type ManyOfChoiceControls, type ManyOfFieldControls } from 'vultus-core';
import { ChoiceRow } from './ChoiceNote.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { isLocked, useLockedSelectLook } from './pendingLock.js';
import { useManyOfRequest } from './useManyOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

export interface ManyOfSelectProps<T extends string> {
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
 * accessible name; while the field is pending (a commit runs, or its
 * `pending` option says the app is busy) it is a loading select, locked
 * (isLocked: it keeps the keyboard focus, is said unavailable, its list
 * closes, an opening asked for while locked opening nothing, then or as
 * pending ends, and a removal, a clear or a search changes nothing: the clear
 * icon out of sight, no remove icon on the tags, the search read-only).
 */
export function ManyOfSelect<T extends string>({ field, size, style }: ManyOfSelectProps<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useManyOfRequest(field);
  const [open, setOpen] = useState(false);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  const locked = isLocked(field);
  const lockedLook = useLockedSelectLook(locked);
  if (!field.visible) return null;
  // Locked or disabled, the list is closed, which antd does not report.
  if ((locked || !field.enabled) && open) setOpen(false);
  const byValue = new Map(field.choices.map((c) => [c.value as string, c]));
  const option = (c: ManyOfChoiceControls<T>) => ({ value: c.value, label: c.label, title: '', disabled: !c.enabled });
  const groups = [...new Set(field.choices.flatMap((c) => (c.group ? [c.group] : [])))];
  const options = [
    ...field.choices.filter((c) => !c.group).map(option),
    ...groups.map((g) => ({ label: g, title: '', options: field.choices.filter((c) => c.group === g).map(option) })),
  ];
  // Without a width the span is a block, so the select fills a form item (antd's ant-select-in-form-item); elsewhere it keeps its natural width.
  return wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, (
    <Select
      mode="multiple"
      value={field.value}
      size={size}
      style={{ minWidth: 200, ...style, ...lockedLook.style }}
      styles={lockedLook.styles}
      loading={field.pending}
      // See OneOfSelect: `suffixIcon` is the one loading-related prop antd
      // strips before forwarding the rest to @rc-component/select.
      suffixIcon={Spinner && field.pending ? <Spinner spinnerKey={spinnerKey} size="small" /> : undefined}
      disabled={!field.enabled}
      // Open only as `open` says, closed while locked (see OneOfSelect), and
      // the search read-only while locked: antd keeps a search typed while
      // closed for the next opening.
      open={field.enabled && !locked && open}
      showSearch={locked ? false : undefined}
      aria-disabled={locked || undefined}
      onChange={(next: T[]) => request(next)}
      onOpenChange={(next) => setOpen(next && !locked)}
      // Locked, the clear icon stays (it may hold the focus), out of sight (useLockedSelectLook).
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
  ), { open: open || asking ? false : undefined, style, block: style?.width === undefined, stable: true }));
}
