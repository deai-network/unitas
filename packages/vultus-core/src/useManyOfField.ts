import { useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { resolveChoice, type OneOfChoice, type OneOfChoiceControls } from './choices.js';
import { useFieldContext, type FieldCtx } from './FieldContext.js';
import { resolveIn } from './resolve.js';
import type { ErrorRoutesRegistry, ValueOrFn } from './types.js';

export type ManyOfOwnOptions<T extends string = string, Ctx = any> = {
  /** The choices, in order; static or derived (a function, of the field context if it declares a parameter). */
  choices: ValueOrFn<OneOfChoice<T>[], Ctx>;
};

export type ManyOfFieldOptions<T extends string = string, RouteId extends string = string, Ctx = any> =
  FieldOptions<T[], T[], RouteId, Ctx> & ManyOfOwnOptions<T, Ctx>;

export interface ManyOfChoiceControls<T extends string = string> extends OneOfChoiceControls<T> {
  selected: boolean;
}

export interface ManyOfFieldControls<T extends string = string> extends FieldControls<T[], T[]> {
  choices: ManyOfChoiceControls<T>[];
  isSelected(value: T): boolean;
  /** Flips a choice's membership in the value; ignored (with a warning) for an unknown or disabled choice. */
  toggle(value: T): void;
}

/** The implicit initial value for a many-of field: `initialValue` resolved, else the empty list. */
export function manyOfInitialValue<T extends string>(
  opts: { initialValue?: ValueOrFn<T[]> },
  ctx: FieldCtx,
  id: string,
): T[] {
  return resolveIn<T[]>(opts.initialValue, [], ctx, `Field '${id}': option 'initialValue'`);
}

/**
 * A field whose value is a set of choices (moxb's ManyOf). A request (to
 * `setValue` or `toggle`) is normalized to the known choices in their order,
 * without duplicates, followed by whatever values the field already holds
 * that are no longer among the choices (kept, in their current order, so a
 * stored value naming a choice that was removed is not silently dropped). A
 * request naming a value that is neither a choice nor already held, or that
 * changes a disabled choice's membership, is ignored with a warning — as
 * useOneOfField refuses a disabled or unknown choice.
 */
export function useManyOfField<T extends string = string, RouteId extends string = string, Ctx = any>(
  opts: ManyOfFieldOptions<T, RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): ManyOfFieldControls<T> {
  const ctx = useFieldContext();
  const resolvedChoices = resolveIn<OneOfChoice<T>[]>(opts.choices, [], ctx, `Field '${opts.id}': option 'choices'`)
    .map((c) => resolveChoice(opts.id, c));
  const byValue = new Map(resolvedChoices.map((c) => [c.value, c]));
  const choiceOrder = resolvedChoices.map((c) => c.value);

  const inside = !opts.onChange && !opts.commit;
  const initialValue = inside ? manyOfInitialValue(opts, ctx, opts.id) : undefined;
  const field = useFieldCore<T[], T[], RouteId, Ctx>('manyOf', inside ? { ...opts, initialValue } : opts, registry);

  /** The normalized list a request becomes, or undefined when the request is refused (with a warning already issued). */
  const normalize = (request: T[], current: T[]): T[] | undefined => {
    const requestSet = new Set(request);
    const currentSet = new Set(current);
    const heldUnknown = current.filter((v) => !byValue.has(v));
    const heldUnknownSet = new Set(heldUnknown);
    for (const v of request) {
      if (!byValue.has(v) && !heldUnknownSet.has(v)) {
        console.warn(`Field '${opts.id}': '${v}' is not one of its choices`);
        return undefined;
      }
    }
    for (const choice of resolvedChoices) {
      if (choice.enabled) continue;
      if (currentSet.has(choice.value) !== requestSet.has(choice.value)) {
        console.warn(`Field '${opts.id}': choice '${choice.value}' is disabled — ${choice.whyDisabled ?? '(no reason)'}`);
        return undefined;
      }
    }
    return [...choiceOrder.filter((v) => requestSet.has(v)), ...heldUnknown];
  };

  const setValue = (next: T[]) => {
    const normalized = normalize(next, field.value);
    if (normalized === undefined) return;
    field.setValue(normalized);
  };

  const isSelected = (value: T): boolean => field.value.includes(value);

  const toggle = (value: T) => {
    const choice = byValue.get(value);
    if (!choice) {
      console.warn(`Field '${opts.id}': '${value}' is not one of its choices`);
      return;
    }
    if (!choice.enabled) {
      console.warn(`Field '${opts.id}': choice '${value}' is disabled — ${choice.whyDisabled ?? '(no reason)'}`);
      return;
    }
    const current = field.value;
    setValue(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  const choices: ManyOfChoiceControls<T>[] = resolvedChoices.map((c) => ({ ...c, selected: field.value.includes(c.value) }));

  return { ...field, setValue, choices, isSelected, toggle };
}
