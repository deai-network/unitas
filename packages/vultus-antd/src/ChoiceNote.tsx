import { theme } from 'antd';
import type { JSX } from 'react';

/** A choice's note, after its label, in secondary colour (e.g. a count: "12", "12 · 8%"); nothing without one. */
export function ChoiceNote({ note }: { note: string | undefined }): JSX.Element | null {
  const { token } = theme.useToken();
  if (!note) return null;
  return <span style={{ color: token.colorTextDescription }}>{note}</span>;
}
