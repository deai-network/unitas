import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

export type BoolFieldOptions<RouteId extends string = string, Ctx = any> = FieldOptions<boolean, boolean, RouteId, Ctx>;

export interface BoolFieldControls extends FieldControls<boolean, boolean> {
  /**
   * Request the opposite value. Programmatic use; widgets obtain the field's
   * confirmation for `!value` first, then call `setValue`.
   */
  toggle(): void;
}

/** The implicit initial value for a boolean field: `initialValue` resolved, else false. */
export function boolInitialValue(
  opts: { initialValue?: ValueOrFn<boolean> },
  ctx: FieldCtx,
  id: string,
): boolean {
  return resolveIn<boolean>(opts.initialValue, false, ctx, `Field '${id}': option 'initialValue'`);
}

/**
 * A boolean field (moxb's Bool, the sidedao boolean field). Rendered by
 * vultus-antd's BoolCheckbox and BoolSwitch, which take the same controls.
 * Inside the field the value starts at `initialValue` (default false).
 */
export function useBoolField<RouteId extends string = string, Ctx = any>(
  opts: BoolFieldOptions<RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): BoolFieldControls {
  const ctx = useFieldContext();
  const inside = !opts.onChange && !opts.commit;
  const initialValue = inside ? boolInitialValue(opts, ctx, opts.id) : undefined;
  const field = useFieldCore<boolean, boolean, RouteId, Ctx>(
    'boolean',
    inside ? { ...opts, initialValue } : opts,
    registry,
  );
  return { ...field, toggle: () => field.setValue(!field.value) };
}
