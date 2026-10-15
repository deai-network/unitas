import { Switch, theme, type SwitchProps } from 'antd';
import { useSpinnerKey, useVultusComponents, type BoolFieldControls, type MixedBoolFieldControls } from 'vultus-core';
import { fieldAccessibleDescription, fieldTooltip, useTooltipField } from './fieldTooltip.js';
import { useVultusTexts } from './texts.js';
import { useBoolRequest } from './useBoolRequest.js';
import { useConfirm } from './useConfirm.js';
import { withTooltip } from './WithReason.js';

interface Props {
  field: BoolFieldControls | MixedBoolFieldControls;
  size?: SwitchProps['size'];
  /** Text inside the switch when on (antd's checkedChildren), e.g. the field's short name. */
  checkedChildren?: SwitchProps['checkedChildren'];
  /** Text inside the switch when off or mixed (antd's unCheckedChildren). */
  unCheckedChildren?: SwitchProps['unCheckedChildren'];
}

/**
 * A boolean field (useBoolField, or useMixedBoolField for aggregates) as
 * antd's Switch. Mixed: the knob in the middle of a half-tinted track; a
 * click requests on, a double click off. The field's label is the switch's
 * accessible name; its description and current state (ARIA's switch has no
 * "mixed") the accessible description. The tooltip follows
 * fieldTooltip; a pending commit shows a loading switch; the field's
 * confirmation for the requested value comes first.
 */
export function BoolSwitch({ field, size, checkedChildren, unCheckedChildren }: Props) {
  const { token } = theme.useToken();
  const { confirm, wrap, asking } = useConfirm({ okText: field.label });
  const click = useBoolRequest(field, confirm);
  const texts = useVultusTexts();
  const tipField = useTooltipField(field);
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  if (!field.visible) return null;
  const mixed = field.value === 'mixed';
  const switchEl = (
    <Switch
      checked={field.value === true}
      size={size}
      checkedChildren={checkedChildren}
      unCheckedChildren={unCheckedChildren}
      // With a lent Spinner, the Switch shows no built-in loading state (antd's Switch has
      // no icon slot for one) — the Spinner renders right after it instead (Decision 6); it
      // still disables while pending either way.
      loading={Spinner ? undefined : field.pending}
      disabled={!field.enabled || field.pending}
      onChange={() => click()}
      aria-label={field.label || undefined}
      aria-description={fieldAccessibleDescription(field, texts)}
      data-field-id={field.id}
      data-value={String(field.value)}
      styles={mixed ? {
        root: { background: `linear-gradient(90deg, ${token.colorPrimary} 50%, ${token.colorTextQuaternary} 50%)` },
        indicator: { insetInlineStart: '50%', transform: 'translateX(-50%)' },
      } : undefined}
    />
  );
  const control = Spinner
    ? <>{switchEl}{field.pending && <span style={{ marginInlineStart: 8 }}><Spinner spinnerKey={spinnerKey} size="small" /></span>}</>
    : switchEl;
  return wrap(withTooltip(fieldTooltip(tipField, texts), !field.enabled, control, { open: asking ? false : undefined, stable: true }));
}
