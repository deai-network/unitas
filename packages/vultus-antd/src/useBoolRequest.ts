import { useRef } from 'react';
import type { BoolFieldControls, MixedBoolFieldControls } from 'vultus-core';
import type { Confirm } from './useConfirm.js';
import { useClickOrDoubleClick } from './useClickOrDoubleClick.js';

/**
 * What a click on a boolean widget requests. On: off; off: on, at once.
 * Mixed: a click requests on, a double click off (the click waits a moment
 * to tell them apart; when the wait ends, it requests on the field as it is
 * then, so a field that is pending or disabled by then requests nothing).
 * Each request gets the field's confirmation for the requested value first.
 */
export function useBoolRequest(field: BoolFieldControls | MixedBoolFieldControls, confirm: Confirm): () => void {
  const request = (next: boolean) => {
    if (!field.enabled || field.pending) return;
    confirm(field.confirmationFor(next), () => field.setValue(next));
  };
  const latest = useRef(request);
  latest.current = request;
  const fromMixed = useClickOrDoubleClick(() => latest.current(true), () => latest.current(false));
  return field.value === 'mixed' ? fromMixed : () => request(field.value !== true);
}
