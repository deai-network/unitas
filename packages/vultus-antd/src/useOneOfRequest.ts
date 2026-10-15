import type { ReactElement } from 'react';
import type { OneOfFieldControls } from 'vultus-core';
import { useFieldRequest } from './useFieldRequest.js';

/**
 * What choosing in a one-of widget requests: the chosen value, through
 * useFieldRequest with `===` equality, after the field's confirmation for it
 * (a modal or typing confirmation's OK is labelled with the chosen choice; a
 * popconfirm keeps its OK, as everywhere in vultus; a danger choice's OK is a
 * danger button). The labels go with each confirmation (`labelsFor`), so a
 * cascade modal names the choice just made, the first one too.
 * Nothing while the field is disabled or a commit is pending, while a
 * confirmation from an earlier request is still open, or when `next` is the
 * field's value. `asking`: the confirmation is open (see useConfirm).
 */
export function useOneOfRequest<T extends string>(field: OneOfFieldControls<T>): {
  request: (next: T) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  return useFieldRequest(field, {
    equal: (a, b) => a === b,
    labelsFor: (next) => {
      const choice = field.choices.find((c) => c.value === next);
      return { okText: choice?.label ?? field.label, danger: choice?.variant === 'danger' };
    },
  });
}
