import type { ReactNode } from 'react';
import { calculateEnabled, useFieldCore, type FieldControls, type FieldOptions } from './field.js';
import { getReason, getVerdict } from './decision.js';
import { resolve } from './resolve.js';
import type { Decision, ErrorRoutesRegistry, ValueOrFn } from './types.js';

/** One choice of a one-of field (moxb's BindOneOfChoice). */
export interface OneOfChoice<T extends string = string> {
  value: T;
  /** Shown for the choice; default: the value. */
  label?: string;
  /** What choosing it does (moxb's `help`), markdown; also the field's current state when it is chosen. */
  description?: string;
  /** Shown before the label (or instead of it, for an icon-only widget), like an action's icon. */
  icon?: ReactNode;
  /** Choosable? Default true, optionally with a reason. Use `enabled` or `disabled`, not contradicting each other. */
  enabled?: Decision;
  disabled?: Decision;
  /** Shown as the main or a dangerous choice, like an action's variant. Default 'default'. */
  variant?: 'default' | 'primary' | 'danger';
  /** A heading the choice is listed under, after the choices without one (OneOfSelect); default none. */
  group?: string;
}

/** A choice as the widgets get it. */
export interface OneOfChoiceControls<T extends string = string> {
  value: T;
  label: string;
  description: string | undefined;
  icon: ReactNode | undefined;
  enabled: boolean;
  whyDisabled: string | undefined;
  variant: 'default' | 'primary' | 'danger';
  group: string | undefined;
}

export type OneOfFieldOptions<T extends string = string, RouteId extends string = string> =
  FieldOptions<T, T, RouteId> & {
    /** The choices, in order; static or derived. */
    choices: ValueOrFn<OneOfChoice<T>[]>;
  };

export interface OneOfFieldControls<T extends string = string> extends FieldControls<T, T> {
  choices: OneOfChoiceControls<T>[];
  /** The choice the value is, if it is one of them. */
  current: OneOfChoiceControls<T> | undefined;
}

function resolveChoice<T extends string>(fieldId: string, choice: OneOfChoice<T>): OneOfChoiceControls<T> {
  const decision = calculateEnabled(`${fieldId}.${choice.value}`, choice.enabled, choice.disabled);
  const enabled = getVerdict(decision, true);
  return {
    value: choice.value,
    label: choice.label ?? choice.value,
    description: choice.description,
    icon: choice.icon,
    enabled,
    whyDisabled: enabled ? undefined : getReason(decision),
    variant: choice.variant ?? 'default',
    group: choice.group,
  };
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
export function useOneOfField<T extends string = string, RouteId extends string = string>(
  opts: OneOfFieldOptions<T, RouteId>,
  registry?: ErrorRoutesRegistry<RouteId>,
): OneOfFieldControls<T> {
  const choices = resolve<OneOfChoice<T>[]>(opts.choices, []).map((c) => resolveChoice(opts.id, c));
  const inside = !opts.onChange && !opts.commit;
  const initialValue = opts.initialValue ?? choices.find((c) => c.enabled)?.value;
  const field = useFieldCore<T, T, RouteId>('oneOf', inside ? { ...opts, initialValue } : opts, registry);
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
