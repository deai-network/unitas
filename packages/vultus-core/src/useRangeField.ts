import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import { clamp, resolveNumeric, type NumericBounds, type ResolvedNumeric } from './numeric.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

/** A `[from, to]` pair, `from <= to`. Not named `Range`, which would shadow the DOM's global type. */
export type NumberRange = [number, number];

export type RangeOwnOptions<Ctx = any> = NumericBounds<Ctx> & { min: ValueOrFn<number, Ctx>; max: ValueOrFn<number, Ctx> };

export type RangeFieldOptions<RouteId extends string = string, Ctx = any> =
  FieldOptions<NumberRange, NumberRange, RouteId, Ctx> & RangeOwnOptions<Ctx>;

export interface RangeFieldControls extends FieldControls<NumberRange, NumberRange>, ResolvedNumeric {
  min: number;
  max: number;
  /** The value, formatted (default: each end's number, joined by an en dash). */
  valueText: string;
}

function order([from, to]: NumberRange): NumberRange {
  return from <= to ? [from, to] : [to, from];
}

/**
 * The implicit initial value for a range field: `initialValue` resolved, else `[min, max]`. Only
 * those options are resolved, not `format`, so a `format` of the field context needs no
 * provider here.
 */
export function rangeInitialValue(opts: RangeFieldOptions, ctx: FieldCtx, id: string): NumberRange {
  const resolved = resolveIn<NumberRange | undefined>(opts.initialValue, undefined, ctx, `Field '${id}': option 'initialValue'`);
  if (resolved !== undefined) return resolved;
  const min = resolveIn<number | undefined>(opts.min, undefined, ctx, `Field '${id}': option 'min'`);
  const max = resolveIn<number | undefined>(opts.max, undefined, ctx, `Field '${id}': option 'max'`);
  return [min as number, max as number];
}

/**
 * A field whose value is a `[from, to]` number range (Praeceptor's school-years filter),
 * reusing numeric's bounds and formatting; `min` and `max` are required here, and `step`
 * defaults to 1. The shown value is each end clamped into the bounds and rounded when
 * `integer`, then ordered, since a value from outside (a stored or passed-in one) may fall
 * outside them, be fractional or be out of order even when every request this hook makes fits.
 * A request is clamped, rounded and ordered the same way; a non-finite end refuses the request
 * with a warning, as a disabled field refuses any request.
 */
export function useRangeField<RouteId extends string = string, Ctx = any>(
  opts: RangeFieldOptions<RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): RangeFieldControls {
  const ctx = useFieldContext();
  const resolved = resolveNumeric(opts.id, opts, ctx);
  const min = resolved.min as number;
  const max = resolved.max as number;
  const step = resolved.step ?? 1;
  const inside = !opts.onChange && !opts.commit;
  const initialValue = () => rangeInitialValue(opts, ctx, opts.id);
  const field = useFieldCore<NumberRange, NumberRange, RouteId, Ctx>('range', inside ? { ...opts, initialValue } : opts, registry);

  /** An end clamped into the bounds, then rounded when `integer`. */
  const fit = (n: number) => {
    const clamped = clamp(n, min, max);
    return resolved.integer ? Math.round(clamped) : clamped;
  };
  const value = order([fit(field.value[0]), fit(field.value[1])]);

  const setValue = (next: NumberRange) => {
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) {
      console.warn(`Field '${opts.id}': '${next}' is not a finite number range`);
      return;
    }
    field.setValue(order([fit(next[0]), fit(next[1])]));
  };

  return {
    ...field,
    ...resolved,
    min,
    max,
    step,
    value,
    setValue,
    valueText: `${resolved.format(value[0])}–${resolved.format(value[1])}`,
  };
}
