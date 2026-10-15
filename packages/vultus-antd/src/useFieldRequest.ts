import type { ReactElement } from 'react';
import type { ConfirmationSpec } from 'vultus-core';
import { useConfirm } from './useConfirm.js';

/** What useFieldRequest needs from a field: just enough to request a value on it. */
export interface RequestableField<TRequest> {
  enabled: boolean;
  pending: boolean;
  value: TRequest;
  label: string;
  setValue(next: TRequest): void;
  confirmationFor(next: TRequest): ConfirmationSpec | undefined;
}

/**
 * What requesting a value on a field widget does, shared by useManyOfRequest
 * (set equality) and useNumericRequest (`===`); useOneOfRequest stays apart,
 * since it also tracks the chosen choice's variant for the confirmation's OK
 * button. `equal` decides whether `next` already names the field's current
 * value, in whatever sense that kind of value has (a many-of field's lists
 * are equal regardless of order; a numeric field's numbers by `===`).
 * Nothing while the field is disabled or a commit is pending, while a
 * confirmation from an earlier request is still open (one request in flight
 * at a time), or when `equal(next, field.value)`. Otherwise asks the field's
 * confirmation for `next`, then requests it. `okText` defaults to the
 * field's label, as a request that names no single choice to label the
 * confirmation's OK with (a one-of field's choice does; see useOneOfRequest).
 * `asking`: the confirmation is open (see useConfirm).
 */
export function useFieldRequest<TRequest>(
  field: RequestableField<TRequest>,
  { equal, okText }: { equal: (a: TRequest, b: TRequest) => boolean; okText?: string },
): {
  request: (next: TRequest) => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  const { confirm, wrap, asking } = useConfirm({ okText: okText ?? field.label });
  const request = (next: TRequest) => {
    if (!field.enabled || field.pending || asking || equal(next, field.value)) return;
    confirm(field.confirmationFor(next), () => field.setValue(next));
  };
  return { request, wrap, asking };
}
