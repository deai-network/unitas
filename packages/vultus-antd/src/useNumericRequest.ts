import type { ReactElement } from 'react';
import type { NumericFieldControls } from 'vultus-core';
import { useConfirm } from './useConfirm.js';

/**
 * What requesting a value in a numeric widget does: the requested number,
 * after the field's confirmation for it (as useOneOfRequest; the
 * confirmation's OK is labelled with the field itself, as a numeric field
 * names no single choice to label it with).
 * Nothing while the field is disabled or a commit is pending, while a
 * confirmation from an earlier request is still open (one request in flight
 * at a time, as useManyOfRequest), or when the request matches the field's
 * current value (e.g. a second Enter before the first commit lands, or
 * before a local setValue has re-rendered). `asking`: the confirmation is
 * open (see useConfirm).
 */
export function useNumericRequest(field: NumericFieldControls): {
  request: (next: number) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  const { confirm, wrap, asking } = useConfirm({ okText: field.label });
  const request = (next: number) => {
    if (!field.enabled || field.pending || asking || next === field.value) return;
    confirm(field.confirmationFor(next), () => field.setValue(next));
  };
  return { request, wrap, asking };
}
