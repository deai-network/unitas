import type { ReactElement } from 'react';
import type { NumericFieldControls } from 'vultus-core';
import { useFieldRequest } from './useFieldRequest.js';

/**
 * What requesting a value in a numeric widget does: useFieldRequest with
 * `===` equality (a request naming the field's current number does
 * nothing — e.g. a second Enter before the first commit lands, or before a
 * local setValue has re-rendered), confirmed and labelled as useManyOfRequest
 * (no single choice names the confirmation's OK; see useOneOfRequest for
 * that case).
 */
export function useNumericRequest(field: NumericFieldControls): {
  request: (next: number) => boolean;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  return useFieldRequest(field, { equal: (a, b) => a === b });
}
