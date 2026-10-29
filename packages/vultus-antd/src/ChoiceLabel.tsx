import { theme } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import type { OneOfChoiceControls } from 'vultus-core';

/** Out of sight, still read by assistive tech (the usual visually-hidden rule). */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

/**
 * A choice's label, styled by its variant as CombinedActionButton styles its
 * rows: primary bold in the colour antd's primary button fills with
 * (colorPrimary), danger in the danger colour, only while the choice is
 * enabled (a disabled choice never looks primary or danger). A dimmed choice
 * (e.g. one with nothing behind it right now) is in the description colour
 * instead, whether or not it is enabled — it takes precedence over the
 * variant colours. Its icon, if any, comes first; `iconOnly` shows just the
 * icon, the label becoming its accessible name.
 *
 * `children`, when given, is shown in the label's text's place (a tree widget's `renderLabel`),
 * in the same look, the icon still first. It is hidden from assistive tech, which reads the
 * label's text instead (out of sight), so the label stays the accessible name whatever is drawn:
 * give it presentational content only (text, marks, an animation), never a link, a button or
 * anything a screen reader must hear. Its element tree stays the same while the label changes,
 * so what `children` holds keeps its state; an icon coming or going wraps the text otherwise, so
 * what `children` holds is mounted anew then.
 */
export function ChoiceLabel({ choice, iconOnly, children }: {
  /** A choice's controls, or one built by hand: `dimmed` may be left out (not dimmed). */
  choice: Pick<OneOfChoiceControls, 'label' | 'enabled' | 'variant' | 'icon'> & { dimmed?: boolean };
  iconOnly?: boolean;
  /** What shows in the label's text's place; the label's text when left out. Not with `iconOnly`, which shows no text. */
  children?: ReactNode;
}) {
  const { token } = theme.useToken();
  const look: CSSProperties | undefined = choice.dimmed
    ? { color: token.colorTextDescription }
    : choice.enabled && choice.variant === 'primary' ? { color: token.colorPrimary, fontWeight: 600 }
      : choice.enabled && choice.variant === 'danger' ? { color: token.colorError }
        : undefined;
  if (iconOnly && choice.icon) return <span role="img" aria-label={choice.label} style={look}>{choice.icon}</span>;
  const text = children === undefined ? choice.label : (
    <><span aria-hidden="true">{children}</span><span style={VISUALLY_HIDDEN}>{choice.label}</span></>
  );
  if (!choice.icon) return <span style={look}>{text}</span>;
  return (
    <span style={{ ...look, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {choice.icon}<span>{text}</span>
    </span>
  );
}
