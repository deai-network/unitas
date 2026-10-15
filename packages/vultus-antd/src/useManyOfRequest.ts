import type { ReactElement } from 'react';
import type { ManyOfFieldControls } from 'vultus-core';
import { useFieldRequest } from './useFieldRequest.js';

/** Whether `a` and `b` hold the same members, regardless of order or duplicates (many-of and tree values). */
export function sameMembers<T>(a: T[], b: T[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const v of setA) if (!setB.has(v)) return false;
  return true;
}

/**
 * What choosing in a many-of widget requests: useFieldRequest with set
 * equality (a request naming the same members as the current value, in any
 * order, does nothing), for a whole next list of values rather than a
 * single choice (a many-of selection names no single choice to label the
 * confirmation's OK with, so a cascade modal's or typing confirmation's OK
 * is labelled with the field itself, as a boolean field's would be).
 */
export function useManyOfRequest<T extends string>(field: ManyOfFieldControls<T>): {
  request: (next: T[]) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  return useFieldRequest(field, { equal: sameMembers });
}
