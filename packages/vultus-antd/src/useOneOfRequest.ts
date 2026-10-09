import { useState, type ReactElement } from 'react';
import type { OneOfFieldControls } from 'vultus-core';
import { useConfirm } from './useConfirm.js';

/**
 * What choosing in a one-of widget requests: the chosen value, after the
 * field's confirmation for it (a modal or typing confirmation's OK is labelled
 * with the chosen choice; a popconfirm keeps its OK, as everywhere in vultus;
 * a danger choice's OK is a danger button).
 * Nothing while the field is disabled or a commit is pending.
 */
export function useOneOfRequest<T extends string>(field: OneOfFieldControls<T>): {
  request: (next: T) => void;
  wrap: (control: ReactElement) => ReactElement;
} {
  const [requested, setRequested] = useState<T | undefined>(undefined);
  const choice = field.choices.find((c) => c.value === requested);
  const { confirm, wrap } = useConfirm({ okText: choice?.label ?? field.label, danger: choice?.variant === 'danger' });
  const request = (next: T) => {
    if (!field.enabled || field.pending || next === field.value) return;
    setRequested(next);
    confirm(field.confirmationFor(next), () => field.setValue(next));
  };
  return { request, wrap };
}
