import type { ReactElement } from 'react';
import type { ConfirmationSpec } from 'vultus-core';
import { useConfirm, type ConfirmLabels } from './useConfirm.js';

/** What useFieldRequest needs from a field: just enough to request a value on it. */
export interface RequestableField<TRequest> {
  enabled: boolean;
  pending: boolean;
  value: TRequest;
  label: string;
  setValue(next: TRequest): void;
  confirmationFor(next: TRequest): ConfirmationSpec | undefined;
}

/** Whether `a` and `b` hold the same members, regardless of order or duplicates (the set equality of many-of and tree values). */
export function sameMembers<T>(a: T[], b: T[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const v of setA) if (!setB.has(v)) return false;
  return true;
}

/**
 * What requesting a value on a field widget does, shared by useManyOfRequest
 * and useManyOfTreeRequest (set equality), useNumericRequest, useOneOfRequest
 * and useOneOfTreeRequest (`===`; the one-of hooks label the confirmation's OK
 * with the chosen choice, `labelsFor`). `equal` decides whether `next` already names the field's current
 * value, in whatever sense that kind of value has (a many-of field's lists
 * are equal regardless of order; a numeric field's numbers by `===`).
 * Nothing while the field is disabled or a commit is pending, while a
 * confirmation from an earlier request is still open (one request in flight
 * at a time), or when `equal(next, field.value)`. Otherwise asks the field's
 * confirmation for `next`, then requests it. `okText` defaults to the
 * field's label, as a request that names no single choice to label the
 * confirmation's OK with (a one-of field's choice does; see useOneOfRequest).
 * `labelsFor` labels the OK for the requested value itself (the chosen
 * node's label, a danger button for a danger choice), over `okText`; the
 * labels go with the confirmation (see Confirm), so a cascade modal, which
 * takes them when it opens, names what was just requested.
 * `asking`: the confirmation is open (see useConfirm).
 */
export function useFieldRequest<TRequest>(
  field: RequestableField<TRequest>,
  { equal, okText, labelsFor }: {
    equal: (a: TRequest, b: TRequest) => boolean;
    okText?: string;
    labelsFor?: (next: TRequest) => ConfirmLabels;
  },
): {
  request: (next: TRequest) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  const { confirm, wrap, asking } = useConfirm({ okText: okText ?? field.label });
  const request = (next: TRequest) => {
    if (!field.enabled || field.pending || asking || equal(next, field.value)) return;
    confirm(field.confirmationFor(next), () => field.setValue(next), labelsFor?.(next));
  };
  return { request, wrap, asking };
}
