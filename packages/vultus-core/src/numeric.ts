import { NO_FIELD_CONTEXT, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import type { ValueOrFn } from './types.js';

/**
 * The bounds and formatting a numeric field has, shared with the range kind (whose two ends
 * reuse the same bounds). Each may be a context function, resolved like any other field option.
 * `format` is not itself a ValueOrFn — it always takes the number as its first argument — so it
 * is resolved by its own rule, below.
 */
export interface NumericBounds<Ctx = any> {
  min?: ValueOrFn<number | undefined, Ctx>;
  max?: ValueOrFn<number | undefined, Ctx>;
  step?: ValueOrFn<number | undefined, Ctx>;
  integer?: ValueOrFn<boolean, Ctx>;
  unit?: ValueOrFn<string | undefined, Ctx>;
  /** Formats a value for display; default: the number followed by the unit, if any. */
  format?: (n: number, ctx: Ctx) => string;
}

/** A NumericBounds with every option resolved through the field context. */
export interface ResolvedNumeric {
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
  integer: boolean;
  unit: string | undefined;
  format(n: number): string;
}

/** Clamps `n` into [min, max]; either end left out leaves that side open. */
export function clamp(n: number, min?: number, max?: number): number {
  let result = n;
  if (min !== undefined) result = Math.max(result, min);
  if (max !== undefined) result = Math.min(result, max);
  return result;
}

/**
 * Resolves a numeric field's bounds and formatter with the field context. `format` goes by its
 * own rule, not resolveIn's: it is checked by its declared parameter count the same way, but it
 * always receives the number, so a provider is only required when it also declares the context
 * parameter (`format.length >= 2`). With no provider above it, that throws the same message
 * shape resolveIn uses, naming the field and the option `'format'`.
 */
export function resolveNumeric(id: string, opts: NumericBounds, ctx: FieldCtx): ResolvedNumeric {
  const where = (name: string) => `Field '${id}': option '${name}'`;
  const min = resolveIn<number | undefined>(opts.min, undefined, ctx, where('min'));
  const max = resolveIn<number | undefined>(opts.max, undefined, ctx, where('max'));
  const step = resolveIn<number | undefined>(opts.step, undefined, ctx, where('step'));
  const integer = resolveIn<boolean>(opts.integer, false, ctx, where('integer'));
  const unit = resolveIn<string | undefined>(opts.unit, undefined, ctx, where('unit'));

  const { format } = opts;
  let resolvedFormat: (n: number) => string;
  if (format === undefined) {
    resolvedFormat = (n) => `${n}${unit ?? ''}`;
  } else if (format.length < 2) {
    resolvedFormat = (n) => format(n, undefined as never);
  } else if (ctx === NO_FIELD_CONTEXT) {
    throw new Error(`${where('format')} is a function of the field context, but no FieldContextProvider is above it`);
  } else {
    resolvedFormat = (n) => format(n, ctx as never);
  }

  return { min, max, step, integer, unit, format: resolvedFormat };
}
