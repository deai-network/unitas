import type { ReactElement } from 'react';
import type { ManyOfTreeFieldControls } from 'vultus-core';
import { sameMembers, useFieldRequest } from './useFieldRequest.js';

/**
 * What checking in a tree widget requests: useFieldRequest with set equality,
 * as useManyOfRequest, for a whole next list of node values (a tree field's
 * value is a set, normalized by the hook; a request naming the same nodes in
 * any order does nothing). A tree selection names no single node to label the
 * confirmation's OK with, so it is labelled with the field itself.
 */
export function useManyOfTreeRequest<T extends string>(field: ManyOfTreeFieldControls<T>): {
  request: (next: T[]) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  return useFieldRequest(field, { equal: sameMembers });
}
