import type { ReactElement } from 'react';
import type { OneOfTreeFieldControls } from 'vultus-core';
import { useConfirm } from './useConfirm.js';

/**
 * What choosing in a one-of tree widget requests: the chosen node's value, or `''` (clearing an
 * optional field), after the field's confirmation for it, as useOneOfRequest: a modal or typing
 * confirmation's OK is labelled with the requested node's label (the field's label for `''`); a
 * popconfirm keeps its OK, as everywhere in vultus; a danger node's OK is a danger button. The
 * labels go with each confirmation (see Confirm), so a cascade modal, which takes them when it
 * opens, names the node just chosen. Nothing while the field is disabled or a commit is pending,
 * while a confirmation from an earlier request is still open (one request in flight at a time),
 * or when `next` is the field's value. `asking`: the confirmation is open (see useConfirm).
 */
export function useOneOfTreeRequest<T extends string>(field: OneOfTreeFieldControls<T>): {
  request: (next: T | '') => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  const { confirm, wrap, asking } = useConfirm({ okText: field.label });
  const request = (next: T | '') => {
    if (!field.enabled || field.pending || asking || next === field.value) return;
    const node = next === '' ? undefined : field.byValue.get(next);
    confirm(field.confirmationFor(next), () => field.setValue(next), {
      okText: node?.label ?? field.label,
      danger: node?.variant === 'danger',
    });
  };
  return { request, wrap, asking };
}
