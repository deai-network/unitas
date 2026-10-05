import { useState } from 'react';
import { getReason, getVerdict, invertDecision } from './decision.js';
import { resolve } from './resolve.js';
import { useAction } from './useAction.js';
import type {
  ConfirmationSpec,
  Decision,
  ErrorRoutesRegistry,
  ExecutionContext,
  Message,
  ValueOrFn,
} from './types.js';

/**
 * Fields: the value half of vultus, on the pattern of the sidedao InputFields.
 * A field hook (useBoolField, later others) is built on useFieldCore by
 * composition, never by inheritance. A field's value lives either inside the
 * field (its own state) or outside it (the caller passes it every render);
 * from outside it is changed either locally (`onChange`, e.g. a form) or by an
 * immediate commit (`commit`), whose setter runs as an action.
 * Design notes: unitas docs/2026-10-05-vultus-field-model-design.md.
 */

/** How an immediately committing field stores a change: an action that receives the requested value. */
export interface FieldCommit<TRequest, RouteId extends string = string> {
  fire: (next: TRequest, ctx: ExecutionContext) => Promise<void> | void;
  /** Confirmation before committing; may depend on the requested value (e.g. only when switching off). */
  confirmation?: ConfirmationSpec | ((next: TRequest) => ConfirmationSpec | undefined);
  errorRoute?: RouteId;
}

/** The key of a value in `valueDescriptions`: 'true' / 'false' for booleans, the value itself for strings. */
export type ValueKey<T> = T extends boolean ? `${T}` : T extends string | number ? `${T}` : never;

interface FieldBaseOptions<TValue> {
  id: string;
  label?: ValueOrFn<string>;
  description?: ValueOrFn<string | undefined>;
  /** Shown? Default true. Use `visible` or `hidden`, not contradicting each other. */
  visible?: ValueOrFn<boolean>;
  hidden?: ValueOrFn<boolean>;
  /** Changeable? Default true, optionally with a reason. Use `enabled` or `disabled`, not contradicting each other. */
  enabled?: ValueOrFn<Decision>;
  disabled?: ValueOrFn<Decision>;
  /**
   * What each value means right now, keyed by value (for booleans `true` / `false`, and `mixed`
   * where the field can show it). Shown with the current value, next to `description`, which
   * says what the field is in general.
   */
  valueDescriptions?: Partial<Record<ValueKey<TValue>, string>>;
}

/**
 * Where the value lives, and what setting it does. Exactly one of the three. The field shows a
 * `TValue` and can be asked for a `TRequest`; usually the same type, but an aggregate can show
 * a state that cannot be requested (a boolean field showing 'mixed').
 */
export type FieldStorage<TValue, TRequest = TValue, RouteId extends string = string> =
  /** Inside the field: its own state, starting at `initialValue`. */
  | { initialValue?: TValue; value?: never; onChange?: never; commit?: never }
  /** Outside, changed locally: the caller owns the value and applies `onChange`. */
  | { value: TValue; onChange: (value: TRequest) => void; initialValue?: never; commit?: never }
  /** Outside, committed immediately: `commit.fire` stores the change (pending, messages, confirmation). */
  | { value: TValue; commit: FieldCommit<TRequest, RouteId>; initialValue?: never; onChange?: never };

export type FieldOptions<TValue, TRequest = TValue, RouteId extends string = string> =
  FieldBaseOptions<TValue> & FieldStorage<TValue, TRequest, RouteId>;

/** What a field widget receives: everything it shows, and the one way to change the value. */
export interface FieldControls<TValue, TRequest = TValue> {
  type: string;
  id: string;
  label: string;
  description: string | undefined;
  /** What the current value means (from `valueDescriptions`). */
  valueDescription: string | undefined;
  visible: boolean;
  enabled: boolean;
  whyDisabled: string | undefined;
  value: TValue;
  /** Request a new value. Ignored (with a warning) when disabled or while a commit is pending. */
  setValue(next: TRequest): void;
  /** A commit is running. */
  pending: boolean;
  /** Messages of the last commit. */
  messages: Message[];
  /** The confirmation a widget must obtain before requesting `next`, if any. */
  confirmationFor(next: TRequest): ConfirmationSpec | undefined;
}

export type FieldStorageMode = 'inside' | 'local' | 'commit';

export function fieldStorageMode(id: string, opts: FieldStorage<unknown, unknown, string>): FieldStorageMode {
  const { initialValue, value, onChange, commit } = opts as {
    initialValue?: unknown; value?: unknown; onChange?: unknown; commit?: unknown;
  };
  if (commit && onChange) throw new Error(`Field '${id}': "commit" and "onChange" are mutually exclusive`);
  if ((commit || onChange) && initialValue !== undefined) {
    throw new Error(`Field '${id}': "initialValue" is for a value inside the field; with "${commit ? 'commit' : 'onChange'}" the caller passes "value"`);
  }
  if (commit) return 'commit';
  if (onChange) return 'local';
  if (value !== undefined) throw new Error(`Field '${id}': "value" needs "onChange" or "commit"`);
  return 'inside';
}

export function calculateVisible(id: string, visible: boolean | undefined, hidden: boolean | undefined): boolean {
  if (visible === undefined) return hidden === undefined ? true : !hidden;
  if (hidden === undefined || visible !== hidden) return visible;
  throw new Error(`Field '${id}': "visible" and "hidden" contradict each other`);
}

export function calculateEnabled(id: string, enabled: Decision | undefined, disabled: Decision | undefined): Decision {
  if (enabled === undefined) return disabled === undefined ? true : invertDecision(disabled);
  if (disabled === undefined) return enabled;
  if (getVerdict(enabled, false) !== getVerdict(disabled, false)) {
    return { verdict: getVerdict(enabled, false), reason: getReason(disabled) ?? getReason(enabled) };
  }
  throw new Error(`Field '${id}': "enabled" and "disabled" contradict each other`);
}

/**
 * The shared core of every field hook: label and description, visibility and
 * enabled state (with reason), the storage mode, and in commit mode the setter
 * as an action (its pending state and messages become the field's).
 */
export function useFieldCore<TValue, TRequest extends TValue = TValue, RouteId extends string = string>(
  type: string,
  opts: FieldOptions<TValue, TRequest, RouteId>,
  registry?: ErrorRoutesRegistry<RouteId>,
): FieldControls<TValue, TRequest> {
  const mode = fieldStorageMode(opts.id, opts as FieldStorage<unknown, unknown, string>);
  const [inner, setInner] = useState<TValue>(opts.initialValue as TValue);

  const label = resolve(opts.label, '');
  const description = resolve<string | undefined>(opts.description, undefined);
  const visible = calculateVisible(
    opts.id,
    resolve<boolean | undefined>(opts.visible, undefined),
    resolve<boolean | undefined>(opts.hidden, undefined),
  );
  const enabledDecision = calculateEnabled(
    opts.id,
    resolve<Decision | undefined>(opts.enabled, undefined),
    resolve<Decision | undefined>(opts.disabled, undefined),
  );
  const enabled = getVerdict(enabledDecision, true);
  const whyDisabled = enabled ? undefined : getReason(enabledDecision);

  // Hooks run unconditionally; the setter action is only fired in commit mode.
  const setter = useAction<TRequest, void, RouteId>(
    {
      id: `${opts.id}.set`,
      label,
      enabled: enabledDecision,
      invisible: !visible,
      errorRoute: opts.commit?.errorRoute,
      fire: (next, ctx) => opts.commit?.fire(next, ctx),
    },
    registry,
  );

  const value = mode === 'inside' ? inner : (opts.value as TValue);
  const pending = mode === 'commit' && setter.pending;
  const valueDescription = (opts.valueDescriptions as Record<string, string | undefined> | undefined)?.[String(value)];

  const setValue = (next: TRequest) => {
    if (!enabled) {
      console.warn(`Field '${opts.id}': disabled — ${whyDisabled ?? '(no reason)'}`);
      return;
    }
    if (mode === 'inside') setInner(next);
    else if (mode === 'local') opts.onChange!(next);
    else (setter.fire as (args: TRequest) => void)(next);
  };

  const confirmationFor = (next: TRequest): ConfirmationSpec | undefined => {
    const spec = opts.commit?.confirmation;
    return typeof spec === 'function' ? spec(next) : spec;
  };

  return {
    type,
    id: opts.id,
    label,
    description,
    valueDescription,
    visible,
    enabled,
    whyDisabled,
    value,
    setValue,
    pending,
    messages: mode === 'commit' ? setter.messages : [],
    confirmationFor,
  };
}
