import type { ReactElement } from 'react';
import type { ManyOfFieldControls } from 'vultus-core';
import { useConfirm } from './useConfirm.js';

/** Whether `a` and `b` hold the same members, regardless of order or duplicates. */
function sameMembers<T>(a: T[], b: T[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const v of setA) if (!setB.has(v)) return false;
  return true;
}

/**
 * What choosing in a many-of widget requests: mirrors useOneOfRequest, for a
 * whole next list of values rather than a single choice (a many-of selection
 * names no single choice to label the confirmation's OK with, so a cascade
 * modal's or typing confirmation's OK is labelled with the field itself, as a
 * boolean field's would be).
 * Nothing while the field is disabled or a commit is pending, or while a
 * confirmation from an earlier request is still open (one request in flight
 * at a time). A request naming the same members as the current value, in any
 * order, does nothing either. `asking`: the confirmation is open (see
 * useConfirm).
 */
export function useManyOfRequest<T extends string>(field: ManyOfFieldControls<T>): {
  request: (next: T[]) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  const { confirm, wrap, asking } = useConfirm({ okText: field.label });
  const request = (next: T[]) => {
    if (!field.enabled || field.pending || asking || sameMembers(next, field.value)) return;
    confirm(field.confirmationFor(next), () => field.setValue(next));
  };
  return { request, wrap, asking };
}
