import type { ReactNode } from 'react';
import { calculateEnabled } from './field.js';
import { getReason, getVerdict } from './decision.js';
import type { Decision } from './types.js';

/**
 * One choice of a one-of or many-of field, or a tree node (moxb's
 * BindOneOfChoice). Shared by useOneOfField today; useManyOfField and the
 * tree hook (later tasks) build on the same shape.
 */
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
  /** Shown after the label in secondary colour, e.g. a count ("12", "12 · 8%"). Default none. */
  note?: string;
  /** Shown faded, e.g. a choice with nothing behind it right now (no matching tasks). Default false. */
  dimmed?: boolean;
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
  note: string | undefined;
  dimmed: boolean;
}

/** Resolves a choice's `enabled` / `disabled` and defaults, as useOneOfField does for each of its choices. */
export function resolveChoice<T extends string>(fieldId: string, choice: OneOfChoice<T>): OneOfChoiceControls<T> {
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
    note: choice.note,
    dimmed: choice.dimmed ?? false,
  };
}
