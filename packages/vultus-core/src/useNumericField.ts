import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import { clamp, resolveNumeric, type NumericBounds, type ResolvedNumeric } from './numeric.js';
import type { ErrorRoutesRegistry } from './types.js';

export type NumericOwnOptions<Ctx = any> = NumericBounds<Ctx>;

export type NumericFieldOptions<RouteId extends string = string, Ctx = any> =
  FieldOptions<number, number, RouteId, Ctx> & NumericOwnOptions<Ctx>;

export interface NumericFieldControls extends FieldControls<number, number>, ResolvedNumeric {
  /** The value, formatted (default: the number and the unit; `format` overrides it). */
  valueText: string;
}

/**
 * The implicit initial value for a numeric field: `initialValue` resolved, else `min` (or 0),
 * clamped into the bounds. Only those options are resolved, not `format`, so a `format` of the
 * field context needs no provider here.
 */
export function numericInitialValue(opts: NumericFieldOptions, ctx: FieldCtx, id: string): number {
  const resolved = resolveIn<number | undefined>(opts.initialValue, undefined, ctx, `Field '${id}': option 'initialValue'`);
  if (resolved !== undefined) return resolved;
  const min = resolveIn<number | undefined>(opts.min, undefined, ctx, `Field '${id}': option 'min'`);
  const max = resolveIn<number | undefined>(opts.max, undefined, ctx, `Field '${id}': option 'max'`);
  return clamp(min ?? 0, min, max);
}

/**
 * A field whose value is a single number (moxb's Numeric). The shown value is always clamped
 * into the bounds, then rounded when `integer`, since a value from outside (a stored or
 * passed-in one) may fall outside them or be fractional even when every request this hook makes
 * fits. A request is clamped and rounded the same way; a non-finite request (e.g. a widget
 * parsing `''`) is refused with a warning, as a disabled field refuses any request.
 */
export function useNumericField<RouteId extends string = string, Ctx = any>(
  opts: NumericFieldOptions<RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): NumericFieldControls {
  const ctx = useFieldContext();
  const resolved = resolveNumeric(opts.id, opts, ctx);
  const inside = !opts.onChange && !opts.commit;
  const initialValue = () => numericInitialValue(opts, ctx, opts.id);
  const field = useFieldCore<number, number, RouteId, Ctx>('numeric', inside ? { ...opts, initialValue } : opts, registry);

  /** A number clamped into the bounds, then rounded when `integer`. */
  const fit = (n: number) => {
    const clamped = clamp(n, resolved.min, resolved.max);
    return resolved.integer ? Math.round(clamped) : clamped;
  };
  const value = fit(field.value);

  const setValue = (next: number) => {
    if (!Number.isFinite(next)) {
      console.warn(`Field '${opts.id}': '${next}' is not a finite number`);
      return;
    }
    field.setValue(fit(next));
  };

  return {
    ...field,
    ...resolved,
    value,
    setValue,
    valueText: resolved.format(value),
  };
}
