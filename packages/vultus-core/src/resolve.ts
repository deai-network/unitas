import { NO_FIELD_CONTEXT, readingContext, type FieldCtx } from './FieldContext.js';
import type { ValueOrFn } from './types.js';

export function resolve<T>(v: ValueOrFn<T> | undefined, fallback: T): T {
  if (v === undefined) return fallback;
  return typeof v === 'function' ? (v as () => T)() : v;
}

/**
 * Resolves a field's option with its context. With a provider above, every function receives
 * `ctx`, so one whose parameter has a default (`(ctx = {}) => ...`) gets it too. With none, a
 * function without declared parameters is called with nothing, so it works without a provider,
 * and one that declares a parameter throws, `where` (`Field '<id>': option '<name>'`) saying
 * whose it is. A key the function reads that no provider gave throws with `where` in front, so
 * that error names the field and the option too. A function that returns `undefined` counts as
 * an absent option, and yields `fallback` — a context lookup that misses (e.g. `(ctx) =>
 * ctx.items[id]`) should fall back exactly as leaving the option out would, not leave the field
 * with no value at all.
 */
export function resolveIn<T>(v: ValueOrFn<T> | undefined, fallback: T, ctx: FieldCtx, where: string): T {
  if (v === undefined) return fallback;
  if (typeof v !== 'function') return v;
  const fn = v as (ctx?: object) => T;
  if (ctx !== NO_FIELD_CONTEXT) return readingContext(where, () => fn(ctx)) ?? fallback;
  if (fn.length > 0) {
    throw new Error(`${where} is a function of the field context, but no FieldContextProvider is above it`);
  }
  return fn() ?? fallback;
}
