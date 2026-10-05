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

/** How an immediately committing field stores a change: an action that receives the new value. */
export interface FieldCommit<T, RouteId extends string = string> {
  fire: (next: T, ctx: ExecutionContext) => Promise<void> | void;
  /** Confirmation before committing; may depend on the requested value (e.g. only when switching off). */
  confirmation?: ConfirmationSpec | ((next: T) => ConfirmationSpec | undefined);
  errorRoute?: RouteId;
}

interface FieldBaseOptions {
  id: string;
  label?: ValueOrFn<string>;
  description?: ValueOrFn<string | undefined>;
  /** Shown? Default true. Use `visible` or `hidden`, not contradicting each other. */
  visible?: ValueOrFn<boolean>;
  hidden?: ValueOrFn<boolean>;
  /** Changeable? Default true, optionally with a reason. Use `enabled` or `disabled`, not contradicting each other. */
  enabled?: ValueOrFn<Decision>;
  disabled?: ValueOrFn<Decision>;
}

/** Where the value lives, and what setting it does. Exactly one of the three. */
export type FieldStorage<T, RouteId extends string = string> =
  /** Inside the field: its own state, starting at `initialValue`. */
  | { initialValue?: T; value?: never; onChange?: never; commit?: never }
  /** Outside, changed locally: the caller owns the value and applies `onChange`. */
  | { value: T; onChange: (value: T) => void; initialValue?: never; commit?: never }
  /** Outside, committed immediately: `commit.fire` stores the change (pending, messages, confirmation). */
  | { value: T; commit: FieldCommit<T, RouteId>; initialValue?: never; onChange?: never };

export type FieldOptions<T, RouteId extends string = string> = FieldBaseOptions & FieldStorage<T, RouteId>;

/** What a field widget receives: everything it shows, and the one way to change the value. */
export interface FieldControls<T> {
  type: string;
  id: string;
  label: string;
  description: string | undefined;
  visible: boolean;
  enabled: boolean;
  whyDisabled: string | undefined;
  value: T;
  /** Request a new value. Ignored (with a warning) when disabled or while a commit is pending. */
  setValue(next: T): void;
  /** A commit is running. */
  pending: boolean;
  /** Messages of the last commit. */
  messages: Message[];
  /** The confirmation a widget must obtain before requesting `next`, if any. */
  confirmationFor(next: T): ConfirmationSpec | undefined;
}

export type FieldStorageMode = 'inside' | 'local' | 'commit';

export function fieldStorageMode(id: string, opts: FieldStorage<unknown, string>): FieldStorageMode {
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
export function useFieldCore<T, RouteId extends string = string>(
  type: string,
  opts: FieldOptions<T, RouteId>,
  registry?: ErrorRoutesRegistry<RouteId>,
): FieldControls<T> {
  const mode = fieldStorageMode(opts.id, opts as FieldStorage<unknown, string>);
  const [inner, setInner] = useState<T>(opts.initialValue as T);

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
  const setter = useAction<T, void, RouteId>(
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

  const value = mode === 'inside' ? inner : (opts.value as T);
  const pending = mode === 'commit' && setter.pending;

  const setValue = (next: T) => {
    if (!enabled) {
      console.warn(`Field '${opts.id}': disabled — ${whyDisabled ?? '(no reason)'}`);
      return;
    }
    if (mode === 'inside') setInner(next);
    else if (mode === 'local') opts.onChange!(next);
    else (setter.fire as (args: T) => void)(next);
  };

  const confirmationFor = (next: T): ConfirmationSpec | undefined => {
    const spec = opts.commit?.confirmation;
    return typeof spec === 'function' ? spec(next) : spec;
  };

  return {
    type,
    id: opts.id,
    label,
    description,
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
