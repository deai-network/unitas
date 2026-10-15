import { NO_FIELD_CONTEXT, type FieldCtx } from './FieldContext.js';
import type { ValueOrFn } from './types.js';

export function resolve<T>(v: ValueOrFn<T> | undefined, fallback: T): T {
  if (v === undefined) return fallback;
  return typeof v === 'function' ? (v as () => T)() : v;
}

/**
 * Resolves a field's option with its context: a function that declares a parameter receives
 * `ctx`; one without parameters is called with nothing, so it works without a provider. A
 * function of the context with no provider above throws, `where` (`Field '<id>': option
 * '<name>'`) saying whose it is.
 */
export function resolveIn<T>(v: ValueOrFn<T> | undefined, fallback: T, ctx: FieldCtx, where: string): T {
  if (v === undefined) return fallback;
  if (typeof v !== 'function') return v;
  const fn = v as (ctx?: object) => T;
  if (fn.length === 0) return fn();
  if (ctx === NO_FIELD_CONTEXT) {
    throw new Error(`${where} is a function of the field context, but no FieldContextProvider is above it`);
  }
  return fn(ctx);
}
