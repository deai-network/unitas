import type { ReactElement } from 'react';
import type { OneOfTreeFieldControls } from 'vultus-core';
import { useFieldRequest } from './useFieldRequest.js';

/**
 * What choosing in a one-of tree widget requests: the chosen node's value, or `''` (clearing an
 * optional field), through useFieldRequest with `===` equality (a request naming the field's
 * value does nothing). A modal or typing confirmation's OK is labelled with the requested node's
 * label (the field's label for `''`), a danger node's OK a danger button (`labelsFor`); a
 * popconfirm keeps its OK, as everywhere in vultus.
 */
export function useOneOfTreeRequest<T extends string>(field: OneOfTreeFieldControls<T>): {
  request: (next: T | '') => boolean;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  return useFieldRequest(field, {
    equal: (a, b) => a === b,
    labelsFor: (next) => {
      const node = next === '' ? undefined : field.byValue.get(next);
      return { okText: node?.label ?? field.label, danger: node?.variant === 'danger' };
    },
  });
}
