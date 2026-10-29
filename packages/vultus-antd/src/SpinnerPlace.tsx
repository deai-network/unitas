import { Spin, theme } from 'antd';
import { useSpinnerKey, useVultusComponents } from 'vultus-core';

interface Props {
  /** The field whose spinner it holds: its `id` keys a lent Spinner, its `pending` shows the spinner. */
  field: { id: string; pending: boolean };
  /**
   * The space before the place, in px: the theme's `marginXS` (8) by default; 0 where what
   * comes before it leaves room already: a row that spaces its items (a group's choices), an
   * antd suffix (its affix padding), a checkbox's label (its padding).
   */
  gap?: number;
  /**
   * Where it sits across a flex row: centred (the default), or at the row's start, by the
   * first line of a control that grows downwards (a textarea).
   */
  align?: 'center' | 'start';
}

/** The tokens of antd's Spin the place's size follows: its own `dotSizeSM`, or the `controlHeightLG` antd derives it from. */
type SpinTokens = Partial<{ dotSizeSM: number; controlHeightLG: number }>;

/**
 * The spinner's place beside a field widget's control (BoolSwitch, BoolCheckbox,
 * OneOfSegmented, ManyOfCheckboxes, ManyOfSwitches, the suffixes of NumericInput, TextInput
 * and SearchInput, the textarea's row, the tree widgets' search box): always laid out, a fixed
 * square (class `vultus-spinner-place`), so the widget keeps its size, and the form its layout,
 * as pending comes and goes. It is the same element either way. While the field is pending the
 * spinner shows in it, centred: the lent Spinner (keyed `vultus:field:<id>`, size small), else
 * antd's small Spin. Idle it is empty and hidden from assistive tech; pending, the spinner in it
 * is announced as it is on its own.
 *
 * The square holds antd's small Spin as it turns: its dot size (the theme's Spin token
 * `dotSizeSM`, else antd's own default for it, from `controlHeightLG`, the Spin component's own
 * before the global one, as antd takes it) across the diagonal, as antd's dot turns on its
 * corner; so nothing antd's Spin draws reaches past it. A larger lent Spinner overflows it,
 * centred, moving nothing.
 */
export function SpinnerPlace({ field, gap, align = 'center' }: Props) {
  const { token } = theme.useToken();
  const { Spinner } = useVultusComponents();
  const spinnerKey = useSpinnerKey(`vultus:field:${field.id}`);
  // A component's tokens may set any global one for it too (antd's ConfigProvider `components`).
  const spin: SpinTokens | undefined = token.Spin;
  // antd's own default for the small dot (its Spin style's prepareComponentToken).
  const dot = spin?.dotSizeSM ?? (spin?.controlHeightLG ?? token.controlHeightLG) * 0.35;
  const side = Math.ceil(dot * Math.SQRT2);
  return (
    <span
      className="vultus-spinner-place"
      aria-hidden={field.pending ? undefined : true}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        // Centred on the line, whatever it holds: `middle` beside text, `center` in a flex row.
        verticalAlign: 'middle', alignSelf: align === 'start' ? 'flex-start' : 'center',
        width: side, height: side, flexShrink: 0, marginInlineStart: gap ?? token.marginXS,
      }}
    >
      {field.pending && (Spinner ? <Spinner spinnerKey={spinnerKey} size="small" /> : <Spin size="small" />)}
    </span>
  );
}
