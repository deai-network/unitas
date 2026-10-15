import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

export type TextOwnOptions = { control?: 'input' | 'textarea' };

export type TextFieldOptions<RouteId extends string = string, Ctx = any> =
  FieldOptions<string, string, RouteId, Ctx> & TextOwnOptions;

export interface TextFieldControls extends FieldControls<string, string> {
  control: 'input' | 'textarea';
}

/** The implicit initial value for a text field: `initialValue` resolved, else the empty string. */
export function textInitialValue(
  opts: { initialValue?: ValueOrFn<string> },
  ctx: FieldCtx,
  id: string,
): string {
  return resolveIn<string>(opts.initialValue, '', ctx, `Field '${id}': option 'initialValue'`);
}

/**
 * A field whose value is a string (moxb's Text, TextAnt, TextSearchAnt). `control` says whether
 * vultus-antd renders an input or a textarea; defaults to `'input'`. A field inside the field or
 * changed locally requests on every change; one that commits holds requests back until the
 * widget decides (blur or Enter), as any commit-mode field does.
 */
export function useTextField<RouteId extends string = string, Ctx = any>(
  opts: TextFieldOptions<RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): TextFieldControls {
  const ctx = useFieldContext();
  const inside = !opts.onChange && !opts.commit;
  const initialValue = () => textInitialValue(opts, ctx, opts.id);
  const field = useFieldCore<string, string, RouteId, Ctx>('text', inside ? { ...opts, initialValue } : opts, registry);
  return { ...field, control: opts.control ?? 'input' };
}
