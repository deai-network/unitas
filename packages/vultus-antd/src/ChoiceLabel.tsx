import { theme } from 'antd';
import type { CSSProperties } from 'react';
import type { OneOfChoiceControls } from 'vultus-core';

/**
 * A choice's label, styled by its variant as CombinedActionButton styles its
 * rows: primary bold in the colour antd's primary button fills with
 * (colorPrimary), danger in the danger colour, only while the choice is
 * enabled (a disabled choice never looks primary or danger). Its icon, if
 * any, comes first; `iconOnly` shows just the icon, the label becoming its
 * accessible name.
 */
export function ChoiceLabel({ choice, iconOnly }: {
  choice: Pick<OneOfChoiceControls, 'label' | 'enabled' | 'variant' | 'icon'>;
  iconOnly?: boolean;
}) {
  const { token } = theme.useToken();
  const look: CSSProperties | undefined =
    choice.enabled && choice.variant === 'primary' ? { color: token.colorPrimary, fontWeight: 600 }
      : choice.enabled && choice.variant === 'danger' ? { color: token.colorError }
        : undefined;
  if (iconOnly && choice.icon) return <span role="img" aria-label={choice.label} style={look}>{choice.icon}</span>;
  if (!choice.icon) return <span style={look}>{choice.label}</span>;
  return (
    <span style={{ ...look, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {choice.icon}<span>{choice.label}</span>
    </span>
  );
}
