import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import { clamp, resolveNumeric, type NumericBounds, type ResolvedNumeric } from './numeric.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

/** A `[from, to]` pair, `from <= to`. */
export type Range = [number, number];

export type RangeOwnOptions<Ctx = any> = NumericBounds<Ctx> & { min: ValueOrFn<number, Ctx>; max: ValueOrFn<number, Ctx> };

export type RangeFieldOptions<RouteId extends string = string, Ctx = any> =
  FieldOptions<Range, Range, RouteId, Ctx> & RangeOwnOptions<Ctx>;

export interface RangeFieldControls extends FieldControls<Range, Range>, ResolvedNumeric {
  min: number;
  max: number;
  /** The value, formatted (default: each end's number, joined by an en dash). */
  valueText: string;
}

function order([from, to]: Range): Range {
  return from <= to ? [from, to] : [to, from];
}

/** The implicit initial value for a range field: `initialValue` resolved, else `[min, max]`. */
export function rangeInitialValue(opts: RangeFieldOptions, ctx: FieldCtx, id: string): Range {
  const resolved = resolveIn<Range | undefined>(opts.initialValue, undefined, ctx, `Field '${id}': option 'initialValue'`);
  if (resolved !== undefined) return resolved;
  const { min, max } = resolveNumeric(id, opts, ctx);
  return [min as number, max as number];
}

/**
 * A field whose value is a `[from, to]` number range (Praeceptor's school-years filter),
 * reusing numeric's bounds and formatting; `min` and `max` are required here, and `step`
 * defaults to 1. The shown value is each end clamped into the bounds, then ordered, since a
 * value from outside (a stored or passed-in one) may fall outside them or out of order even
 * when every request this hook makes keeps both. A request is clamped the same way, rounded
 * when `integer`, then ordered; a non-finite end refuses the request with a warning, as a
 * disabled field refuses any request.
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
  const initialValue = inside ? rangeInitialValue(opts, ctx, opts.id) : undefined;
  const field = useFieldCore<Range, Range, RouteId, Ctx>('range', inside ? { ...opts, initialValue } : opts, registry);

  const value = order([clamp(field.value[0], min, max), clamp(field.value[1], min, max)]);

  const setValue = (next: Range) => {
    if (!Number.isFinite(next[0]) || !Number.isFinite(next[1])) {
      console.warn(`Field '${opts.id}': '${next}' is not a finite number range`);
      return;
    }
    const clamped: Range = [clamp(next[0], min, max), clamp(next[1], min, max)];
    const rounded: Range = resolved.integer ? [Math.round(clamped[0]), Math.round(clamped[1])] : clamped;
    field.setValue(order(rounded));
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
