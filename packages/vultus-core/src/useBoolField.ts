import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import type { ErrorRoutesRegistry } from './types.js';

export type BoolFieldOptions<RouteId extends string = string> = FieldOptions<boolean, boolean, RouteId>;

export interface BoolFieldControls extends FieldControls<boolean, boolean> {
  /**
   * Request the opposite value. Programmatic use; widgets obtain the field's
   * confirmation for `!value` first, then call `setValue`.
   */
  toggle(): void;
}

/**
 * A boolean field (moxb's Bool, the sidedao boolean field). Rendered by
 * vultus-antd's BoolCheckbox and BoolSwitch, which take the same controls.
 * Inside the field the value starts at `initialValue` (default false).
 */
export function useBoolField<RouteId extends string = string>(
  opts: BoolFieldOptions<RouteId>,
  registry?: ErrorRoutesRegistry<RouteId>,
): BoolFieldControls {
  const inside = !opts.onChange && !opts.commit;
  const field = useFieldCore<boolean, boolean, RouteId>(
    'boolean',
    inside ? { ...opts, initialValue: opts.initialValue ?? false } : opts,
    registry,
  );
  return { ...field, toggle: () => field.setValue(!field.value) };
}
