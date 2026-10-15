import { theme } from 'antd';
import type { JSX } from 'react';
import type { OneOfChoiceControls } from 'vultus-core';
import { ChoiceLabel } from './ChoiceLabel.js';

/** A choice's note, after its label, in secondary colour (e.g. a count: "12", "12 · 8%"); nothing without one. */
export function ChoiceNote({ note }: { note: string | undefined }): JSX.Element | null {
  const { token } = theme.useToken();
  if (!note) return null;
  return <span style={{ color: token.colorTextDescription }}>{note}</span>;
}

/**
 * A choice's label and note in a plain open-list row, the note right-aligned
 * (OneOfSelect's and ManyOfSelect's rows; `ManyOfChoiceControls` extends
 * `OneOfChoiceControls`, so a many-of choice fits here too).
 */
export function ChoiceRow({ choice }: { choice: OneOfChoiceControls }): JSX.Element {
  return (
    <span style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <ChoiceLabel choice={choice} />
      <ChoiceNote note={choice.note} />
    </span>
  );
}
