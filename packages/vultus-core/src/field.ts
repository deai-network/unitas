import { useCallback, useState } from 'react';
import { getReason, getVerdict, invertDecision } from './decision.js';
import { useFieldContext } from './FieldContext.js';
import { resolveIn } from './resolve.js';
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

/** The field kinds (FieldControls.type and a FieldDefinition's `kind`). */
export type FieldKind = 'boolean' | 'mixed-boolean' | 'oneOf' | 'manyOf' | 'numeric' | 'range' | 'manyOfTree' | 'oneOfTree' | 'text';

/** The widget to render a field with: a name, or a name with display options overriding its defaults. */
export type WidgetHint = string | { name: string; [option: string]: unknown };

/** How an immediately committing field stores a change: an action that receives the requested value. */
export interface FieldCommit<TRequest, RouteId extends string = string> {
  fire: (next: TRequest, ctx: ExecutionContext) => Promise<void> | void;
  /** Confirmation before committing; may depend on the requested value (e.g. only when switching off). */
  confirmation?: ConfirmationSpec | ((next: TRequest) => ConfirmationSpec | undefined);
  errorRoute?: RouteId;
}

/** The key of a value in `valueDescriptions`: 'true' / 'false' for booleans, the value itself for strings. */
export type ValueKey<T> = T extends boolean ? `${T}` : T extends string | number ? `${T}` : never;

/**
 * What every field has, whatever its storage. `Ctx` is the field context the options' functions
 * receive (see FieldContextProvider); a function without parameters needs none.
 */
export interface FieldBaseOptions<TValue, Ctx = any> {
  id: string;
  /**
   * The field's kind, as a FieldDefinition carries it (optional here: a hook knows its own
   * kind). Given and different from the hook's own kind, it throws — a defence against passing
   * the wrong definition to a kind-specific hook.
   */
  kind?: FieldKind;
  label?: ValueOrFn<string, Ctx>;
  description?: ValueOrFn<string | undefined, Ctx>;
  /** Shown while the field is empty (moxb's Value); a widget that has no notion of "empty" ignores it. */
  placeholder?: ValueOrFn<string | undefined, Ctx>;
  /** The widget to render this field with: a name, or a name with its display options. Each kind has a default; vultus-antd's `<Field>` applies render-site overrides on top of this. */
  widget?: WidgetHint;
  /** Shown? Default true. Use `visible` or `hidden`, not contradicting each other. */
  visible?: ValueOrFn<boolean, Ctx>;
  hidden?: ValueOrFn<boolean, Ctx>;
  /** Changeable? Default true, optionally with a reason. Use `enabled` or `disabled`, not contradicting each other. */
  enabled?: ValueOrFn<Decision, Ctx>;
  disabled?: ValueOrFn<Decision, Ctx>;
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
export type FieldStorage<TValue, TRequest = TValue, RouteId extends string = string, Ctx = any> =
  /** Inside the field: its own state, starting at `initialValue` (resolved once, when the field mounts). */
  | { initialValue?: ValueOrFn<TValue, Ctx>; value?: never; onChange?: never; commit?: never; hrefFor?: never }
  /** Outside, changed locally: the caller owns the value and applies `onChange`. */
  | {
    value: TValue; onChange: (value: TRequest) => void; initialValue?: never; commit?: never;
    /** The link that requesting `value` amounts to, where the caller has one (e.g. a URL store). */
    hrefFor?: (value: TRequest) => string | undefined;
  }
  /** Outside, committed immediately: `commit.fire` stores the change (pending, messages, confirmation). */
  | {
    value: TValue; commit: FieldCommit<TRequest, RouteId>; initialValue?: never; onChange?: never;
    hrefFor?: (value: TRequest) => string | undefined;
  };

export type FieldOptions<TValue, TRequest = TValue, RouteId extends string = string, Ctx = any> =
  FieldBaseOptions<TValue, Ctx> & FieldStorage<TValue, TRequest, RouteId, Ctx>;

/** What a field widget receives: everything it shows, and the one way to change the value. */
export interface FieldControls<TValue, TRequest = TValue> {
  type: FieldKind;
  id: string;
  label: string;
  description: string | undefined;
  placeholder: string | undefined;
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
  /** The field stores through `commit` — true exactly in commit storage mode, so a widget can hold back requests while typing. */
  commits: boolean;
  /** Messages of the last commit. */
  messages: Message[];
  /** The confirmation a widget must obtain before requesting `next`, if any. */
  confirmationFor(next: TRequest): ConfirmationSpec | undefined;
  /** The link that requesting `value` amounts to, where whoever keeps the value gave one (a URL store does); `undefined` otherwise. */
  hrefFor(value: TRequest): string | undefined;
  widget: WidgetHint | undefined;
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
 * as an action (its pending state and messages become the field's). Functions
 * among the options are resolved with the field context, on every render;
 * `initialValue` once, when the field mounts. A kind's hook passes its implicit
 * initial value as a zero-argument function, so that too is computed only then.
 */
export function useFieldCore<TValue, TRequest extends TValue = TValue, RouteId extends string = string, Ctx = any>(
  type: FieldKind,
  opts: FieldOptions<TValue, TRequest, RouteId, Ctx>,
  registry?: ErrorRoutesRegistry<RouteId>,
): FieldControls<TValue, TRequest> {
  if (opts.kind !== undefined && opts.kind !== type) {
    throw new Error(`Field '${opts.id}': a definition of kind '${opts.kind}' was passed to the '${type}' hook`);
  }
  const mode = fieldStorageMode(opts.id, opts as FieldStorage<unknown, unknown, string>);
  const ctx = useFieldContext();
  const where = (name: string) => `Field '${opts.id}': option '${name}'`;
  const [inner, setInner] = useState<TValue>(
    () => resolveIn<TValue | undefined>(opts.initialValue, undefined, ctx, where('initialValue')) as TValue,
  );

  const label = resolveIn(opts.label, '', ctx, where('label'));
  const description = resolveIn<string | undefined>(opts.description, undefined, ctx, where('description'));
  const placeholder = resolveIn<string | undefined>(opts.placeholder, undefined, ctx, where('placeholder'));
  const visible = calculateVisible(
    opts.id,
    resolveIn<boolean | undefined>(opts.visible, undefined, ctx, where('visible')),
    resolveIn<boolean | undefined>(opts.hidden, undefined, ctx, where('hidden')),
  );
  const enabledDecision = calculateEnabled(
    opts.id,
    resolveIn<Decision | undefined>(opts.enabled, undefined, ctx, where('enabled')),
    resolveIn<Decision | undefined>(opts.disabled, undefined, ctx, where('disabled')),
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

  // Inside the field nothing outside keeps the value, so nothing gives a link: an `hrefFor` that
  // came anyway (untyped options; the types forbid it) is ignored.
  const hrefForOpt = mode === 'inside' ? undefined : (opts as { hrefFor?: (value: TRequest) => string | undefined }).hrefFor;
  const hrefFor = useCallback((next: TRequest) => hrefForOpt?.(next), [hrefForOpt]);

  return {
    type,
    id: opts.id,
    label,
    description,
    placeholder,
    valueDescription,
    visible,
    enabled,
    whyDisabled,
    value,
    setValue,
    pending,
    commits: mode === 'commit',
    messages: mode === 'commit' ? (setter.messages ?? []) : [],
    confirmationFor,
    hrefFor,
    widget: opts.widget,
  };
}
