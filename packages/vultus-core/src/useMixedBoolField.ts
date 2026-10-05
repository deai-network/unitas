import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import type { ErrorRoutesRegistry } from './types.js';

/** What a mixed boolean field shows: on, off, or some of its items on and some off. */
export type MixedBool = boolean | 'mixed';

export type MixedBoolFieldOptions<RouteId extends string = string> = FieldOptions<MixedBool, boolean, RouteId>;

export interface MixedBoolFieldControls extends FieldControls<MixedBool, boolean> {
  /** Request the opposite: off when on, on when off or mixed. Programmatic use, as in BoolFieldControls. */
  toggle(): void;
}

/**
 * A boolean field over an aggregate (moxb's indeterminate Bool, ARIA's
 * "mixed"): it shows true, false or 'mixed', and can be asked for true or
 * false only. Rendered by the same widgets as useBoolField: BoolSwitch puts
 * its knob in the middle, BoolCheckbox is indeterminate. Derive the value with
 * `aggregateBool`; with no items at all, disable the field with a reason.
 */
export function useMixedBoolField<RouteId extends string = string>(
  opts: MixedBoolFieldOptions<RouteId>,
  registry?: ErrorRoutesRegistry<RouteId>,
): MixedBoolFieldControls {
  const inside = !opts.onChange && !opts.commit;
  const field = useFieldCore<MixedBool, boolean, RouteId>(
    'mixed-boolean',
    inside ? { ...opts, initialValue: opts.initialValue ?? false } : opts,
    registry,
  );
  return { ...field, toggle: () => field.setValue(field.value !== true) };
}

/**
 * The aggregate of several booleans: true when all are on, false when none is,
 * 'mixed' otherwise; `undefined` when there are none (a case for disabling the
 * field, not a value).
 */
export function aggregateBool(values: readonly boolean[]): MixedBool | undefined {
  if (values.length === 0) return undefined;
  const on = values.filter(Boolean).length;
  return on === values.length ? true : on === 0 ? false : 'mixed';
}
