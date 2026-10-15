import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { resolveChoice, type OneOfChoice, type OneOfChoiceControls } from './choices.js';
import { useFieldContext } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

// Re-exported so today's callers (`import { type OneOfChoice } from 'vultus-core'`, and tests
// importing from this file) keep working now that the choice types live in choices.ts.
export type { OneOfChoice, OneOfChoiceControls };

export type OneOfFieldOptions<T extends string = string, RouteId extends string = string, Ctx = any> =
  FieldOptions<T, T, RouteId, Ctx> & {
    /** The choices, in order; static or derived (a function, of the field context if it declares a parameter). */
    choices: ValueOrFn<OneOfChoice<T>[], Ctx>;
  };

export interface OneOfFieldControls<T extends string = string> extends FieldControls<T, T> {
  choices: OneOfChoiceControls<T>[];
  /** The choice the value is, if it is one of them. */
  current: OneOfChoiceControls<T> | undefined;
}

/**
 * A field whose value is one of a list of choices (moxb's OneOf). Rendered by
 * vultus-antd's OneOfSelect and OneOfSegmented, which take the same controls.
 * Each choice may be disabled with a reason; the field's current state is the
 * current choice's description unless `valueDescriptions` words it
 * differently. Requesting a disabled or unknown choice is ignored with a
 * warning, as a disabled field ignores any request. Inside the field the value
 * starts at `initialValue`, else at the first enabled choice.
 */
export function useOneOfField<T extends string = string, RouteId extends string = string, Ctx = any>(
  opts: OneOfFieldOptions<T, RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): OneOfFieldControls<T> {
  const ctx = useFieldContext();
  const choices = resolveIn<OneOfChoice<T>[]>(opts.choices, [], ctx, `Field '${opts.id}': option 'choices'`)
    .map((c) => resolveChoice(opts.id, c));
  const inside = !opts.onChange && !opts.commit;
  const initialValue = opts.initialValue ?? choices.find((c) => c.enabled)?.value;
  const field = useFieldCore<T, T, RouteId, Ctx>('oneOf', inside ? { ...opts, initialValue } : opts, registry);
  const current = choices.find((c) => c.value === field.value);

  const setValue = (next: T) => {
    const choice = choices.find((c) => c.value === next);
    if (!choice) {
      console.warn(`Field '${opts.id}': '${next}' is not one of its choices`);
      return;
    }
    if (!choice.enabled) {
      console.warn(`Field '${opts.id}': choice '${next}' is disabled — ${choice.whyDisabled ?? '(no reason)'}`);
      return;
    }
    field.setValue(next);
  };

  return {
    ...field,
    valueDescription: field.valueDescription ?? current?.description,
    setValue,
    choices,
    current,
  };
}
