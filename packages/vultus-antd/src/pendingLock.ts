import { ConfigProvider, theme } from 'antd';
import { useContext, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';

/**
 * Whether a field widget is locked: its field is enabled and pending (a
 * commit runs, or its `pending` option says the app is busy with it). A
 * locked widget is not `disabled`, so the keyboard focus stays on it (a
 * browser moves the focus off a disabled element). It is said to be
 * unavailable (`aria-disabled="true"` on its focusable or role element),
 * keeps the look `disabled` gave it (antd's disabled colours and the
 * not-allowed cursor, through the antd control's own props and theme
 * tokens) and changes nothing: the request hooks refuse while pending, and
 * whatever the antd control keeps on its own is held. When pending ends it
 * is back to normal, the focus where the user left it. A field that is not
 * enabled is disabled as ever, pending or not.
 */
export function isLocked(field: { enabled: boolean; pending: boolean }): boolean {
  return field.enabled && field.pending;
}

/**
 * A locked antd Checkbox's `classNames` (undefined when not `locked`):
 * antd's own disabled classes on its wrapper and its box, under the app's
 * prefix (ConfigProvider's `prefixCls`), so it keeps the whole disabled
 * look: box, checkmark, label and cursor. The checkmark is the box's
 * `::after`, which no `styles` entry reaches; tokens alone would leave it
 * white on the disabled background.
 */
export function useLockedCheckboxClassNames(locked: boolean): { root: string; icon: string } | undefined {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  if (!locked) return undefined;
  const prefix = getPrefixCls('checkbox');
  return { root: `${prefix}-wrapper-disabled`, icon: `${prefix}-disabled` };
}

/**
 * A locked antd Switch's `classNames` (undefined when not `locked`): antd's
 * own disabled class on it, under the app's prefix, so it keeps the whole
 * disabled look: the opacity and cursor, no hover tint, no knob shadow, and
 * no knob stretching on press (the stretch is the knob's `::before`, which no
 * `styles` entry reaches).
 */
export function useLockedSwitchClassNames(locked: boolean): { root: string } | undefined {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  if (!locked) return undefined;
  return { root: `${getPrefixCls('switch')}-disabled` };
}

/**
 * A locked antd Select's or TreeSelect's look, through theme tokens: the look
 * `disabled` gave it. `style` goes into the control's `style` (a TreeSelect
 * also hands `styles.root` to its popup): antd's disabled text colour and
 * background, the not-allowed cursor. `styles` is its `styles`: the same
 * colour and cursor on its search input, and no remove icon on its tags (a
 * disabled select's have none). The clear icon, a button that may hold the
 * focus, stays mounted, out of sight and out of the pointer's reach (a
 * disabled select has none; its request is refused like any other), and the
 * suffix (the spinner) stays shown on hover, where antd hides it for the
 * clear icon (TreeSelect's `styles` type lacks `clear`, but antd hands it on).
 * Both undefined when not `locked`. The focus ring stays: the focus does.
 */
export function useLockedSelectLook(locked: boolean): {
  style?: CSSProperties;
  styles?: { input: CSSProperties; itemRemove: CSSProperties; clear: CSSProperties; suffix: CSSProperties };
} {
  const { token } = theme.useToken();
  if (!locked) return {};
  const text: CSSProperties = { color: token.colorTextDisabled, cursor: 'not-allowed' };
  return {
    style: { ...text, background: token.colorBgContainerDisabled },
    styles: {
      input: text,
      itemRemove: { display: 'none' },
      clear: { opacity: 0, pointerEvents: 'none' },
      suffix: { opacity: 1 },
    },
  };
}

/**
 * A locked antd Slider (OneOfSlider, NumericSlider, RangeSlider): its `classNames`, and the `ref`
 * for an element around it. The classNames (undefined when not locked) put antd's own disabled
 * class on the slider, under the app's prefix, so the rail, track, dots, marks and the handle at
 * rest keep the look `disabled` gave them, the not-allowed cursor included. The handle's own
 * disabled class stays off: antd styles a handle's focus and hover through one rule, which that
 * class turns off, and the focus ring stays, as the focus does. Through `ref`, each handle
 * (`role="slider"`) is said to be unavailable (`aria-disabled="true"`) while locked: no Slider
 * prop reaches a handle's `aria-disabled` (rc-slider renders it from `disabled` alone, which takes
 * the handle out of the tab order), so it is set on the handles after each render; React leaves it
 * alone while the Slider's own value for it stays the same, and it is put back when the lock ends.
 */
export function useLockedSlider(field: { enabled: boolean; pending: boolean }): {
  ref: RefObject<HTMLSpanElement | null>;
  classNames: { root: string } | undefined;
} {
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext);
  const ref = useRef<HTMLSpanElement>(null);
  const locked = isLocked(field);
  // Unavailable while not enabled (rc-slider's own value then) or locked.
  const unavailable = String(!field.enabled || locked);
  useLayoutEffect(() => {
    ref.current?.querySelectorAll('[role="slider"]').forEach((handle) => {
      if (handle.getAttribute('aria-disabled') !== unavailable) handle.setAttribute('aria-disabled', unavailable);
    });
  });
  return { ref, classNames: locked ? { root: `${getPrefixCls('slider')}-disabled` } : undefined };
}

/**
 * A locked text or number input's look (TextInput, SearchInput, NumericInput), through theme
 * tokens: the look `disabled` gave it. `style` goes into the control's `style` (its box: an
 * Input's affix wrapper, an InputNumber's root, a TextArea itself): antd's disabled text colour
 * and background, the not-allowed cursor. `text` is the same colour and cursor for the text
 * element inside the box (`styles.input`). Both undefined when not `locked`. The border and the
 * focus ring stay: the focus does.
 */
export function useLockedInputLook(locked: boolean): { style?: CSSProperties; text?: CSSProperties } {
  const { token } = theme.useToken();
  if (!locked) return {};
  const text: CSSProperties = { color: token.colorTextDisabled, cursor: 'not-allowed' };
  return { style: { ...text, background: token.colorBgContainerDisabled }, text };
}

/**
 * A locked antd Tree's `styles` (undefined when not `locked`): its titles in
 * antd's disabled text colour, with the not-allowed cursor, the look a
 * disabled tree gave its rows. Neither the Tree nor its rows are disabled:
 * the Tree keeps its tab stop and the keyboard focus (its arrows still move
 * over the rows), and each row keeps its state for a screen reader
 * (`aria-selected`, `aria-checked`), which rc-tree drops on a disabled one.
 * A checklist's checkboxes lock on their own (ManyOfTreeChecklist).
 */
export function useLockedTreeStyles(locked: boolean): { itemTitle: CSSProperties } | undefined {
  const { token } = theme.useToken();
  if (!locked) return undefined;
  return { itemTitle: { color: token.colorTextDisabled, cursor: 'not-allowed' } };
}
