import { Select, theme, type SelectProps } from 'antd';
import { useState, type CSSProperties } from 'react';
import { useSpinnerKey, useVultusComponents, type OneOfChoiceControls, type OneOfFieldControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';
import { ChoiceNote, ChoiceRow } from './ChoiceNote.js';
import { choiceTooltip, fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { ReasonMarkdown } from './ReasonMarkdown.js';
import { useOneOfRequest } from './useOneOfRequest.js';
import { useVultusTexts } from './texts.js';
import { withTooltip } from './WithReason.js';

interface Props<T extends string> {
  field: OneOfFieldControls<T>;
  size?: SelectProps['size'];
  style?: CSSProperties;
  /**
   * Each choice's description in the open list, under its label (a bold
   * heading), smaller and wrapping, instead of in its tooltip; a disabled
   * choice's tooltip keeps its reason. The closed select shows the label
   * only. The list is at least INLINE_LIST_WIDTH wide.
   */
  inlineDescriptions?: boolean;
}

/** The open list's least width with inline descriptions, so they wrap readably. */
const INLINE_LIST_WIDTH = 320;

/**
 * A choice in the open list with its description: the label as a bold
 * heading (its note, if any, right-aligned on that same line, in normal
 * weight so it doesn't inherit the heading's boldness), the description
 * (markdown) under it.
 */
function InlineChoice<T extends string>({ choice }: { choice: OneOfChoiceControls<T> }) {
  const { token } = theme.useToken();
  return (
    <div style={{ whiteSpace: 'normal' }}>
      <div
        data-choice-part="label"
        style={{ fontWeight: token.fontWeightStrong, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}
      >
        <ChoiceLabel choice={choice} />
        <span style={{ fontWeight: 'normal' }}><ChoiceNote note={choice.note} /></span>
      </div>
      {choice.description && (
        <div
          data-choice-part="description"
          style={{
            fontSize: token.fontSizeSM,
            lineHeight: token.lineHeightSM,
            whiteSpace: 'normal',
            // A disabled choice keeps antd's disabled colour.
            color: choice.enabled ? token.colorTextDescription : undefined,
          }}
        >
          <ReasonMarkdown>{choice.description}</ReasonMarkdown>
        </div>
      )}
    </div>
  );
}

/**
 * A one-of field (useOneOfField) as antd's Select. Closed, its tooltip follows
 * fieldTooltip (what the field is, then "Current state:" and the current
 * choice's description; disabled: the reason first); it is held back while the
 * list is open. In the list each choice shows its description on hover, a
 * disabled one its reason first (choiceTooltip). Primary and danger choices
 * are styled as CombinedActionButton styles its rows (ChoiceLabel), the closed
 * select mirroring the current one. Each choice's note (if any) is shown
 * right-aligned after its label, in secondary colour (ChoiceNote); a dimmed
 * choice's label is in that same secondary colour (ChoiceLabel), still
 * selectable. Choices with a `group` are listed after
 * the others, under their group's heading (antd option groups, in the order
 * the groups first appear). The field's label is the
 * accessible name; a pending commit shows a loading select; the field's
 * confirmation for the requested choice comes first, its OK labelled with the
 * choice.
 */
export function OneOfSelect<T extends string>({ field, size, style, inlineDescriptions }: Props<T>) {
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { request, wrap, asking } = useOneOfRequest(field);
  const [open, setOpen] = useState(false);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const byValue = new Map(field.choices.map((c) => [c.value as string, c]));
  const option = (c: (typeof field.choices)[number]) => ({ value: c.value, label: c.label, title: '', disabled: !c.enabled });
  const groups = [...new Set(field.choices.flatMap((c) => (c.group ? [c.group] : [])))];
  const options = [
    ...field.choices.filter((c) => !c.group).map(option),
    ...groups.map((g) => ({ label: g, title: '', options: field.choices.filter((c) => c.group === g).map(option) })),
  ];
  // Without a width the span is a block, so the select fills a form item (antd's ant-select-in-form-item); elsewhere it keeps its natural width.
  return wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, (
    <Select
      value={field.value}
      size={size}
      style={{ minWidth: 160, ...style }}
      loading={field.pending}
      // `loadingIcon` isn't stripped before antd forwards the rest of the Select's props
      // to @rc-component/select, which spreads it onto the root div — an invalid DOM
      // attribute even when `undefined` (React still warns on the prop name), and
      // `[object Object]` when set. `suffixIcon` IS stripped, and (per antd's useIcons)
      // wins over the default loading icon whenever it's defined, so only set it while
      // pending — unset the rest of the time, so the normal arrow/search icon still shows.
      suffixIcon={Spinner && field.pending ? <Spinner spinnerKey={spinnerKey} size="small" /> : undefined}
      disabled={!field.enabled || field.pending}
      onChange={(next: T) => request(next)}
      onOpenChange={setOpen}
      popupMatchSelectWidth={inlineDescriptions ? INLINE_LIST_WIDTH : undefined}
      virtual={false}
      // An empty title keeps antd from putting the label in a native
      // tooltip on each option and on the closed select, where it would
      // compete with ours.
      title=""
      options={options}
      optionRender={(option) => {
        const choice = byValue.get(String(option.value));
        if (!choice) return option.label;
        return inlineDescriptions
          ? withTooltip(choiceTooltip(choice, false, false), !choice.enabled, <InlineChoice choice={choice} />, { placement: 'right', block: true })
          : withTooltip(choiceTooltip(choice), !choice.enabled, <ChoiceRow choice={choice} />, { placement: 'right', block: true });
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
  ), { open: open || asking ? false : undefined, style, block: style?.width === undefined, stable: true }));
}
