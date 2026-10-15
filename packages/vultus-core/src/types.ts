import type React from 'react';
import type { MessageSink } from './MessageSink.js';

/**
 * Minimal structural form contract used by error-routing (antd's FormInstance is
 * assignable to this). Keeps vultus-core antd-free — see AGENTS.md.
 */
export interface FormLike {
  setFields(fields: { name: string | number | (string | number)[]; errors: string[] }[]): void;
}

export type Decision = boolean | { verdict: boolean; reason?: string };
/**
 * A value, or a function giving it, as a field's options take them. With a FieldContextProvider
 * above, a field calls every such function with its field context (the provider's value); with
 * none, a function without parameters is called with nothing and one that declares a parameter
 * throws.
 */
export type ValueOrFn<T, Ctx = any> = T | ((ctx: Ctx) => T);

/** A value, or a function of no arguments giving it, as an action's options take them: an action calls its functions with nothing. */
export type Thunk<T> = T | (() => T);

export type Severity = 'info' | 'warning' | 'error';

/** Something an action (or, later, a field's validation) has to say, with its severity. */
export interface Message {
  text: string;
  severity: Severity;
}

/**
 * What an action's `fire` receives next to its arguments: a way to report
 * messages while it runs (absorbed from the sidedao InputFields). Messages land
 * on the action's status (`messages`) and go to the MessageSink. A thrown
 * error still fails the action; `error()` reports an error without throwing.
 */
export interface ExecutionContext {
  info(text: string): void;
  warn(text: string): void;
  error(text: string): void;
}

export type ConfirmationSpec =
  | { kind: 'popconfirm'; question: string }
  | { kind: 'cascade-modal'; title: string; content: React.ReactNode }
  | {
      kind: 'typing';
      title: string;
      /** The phrase to type. Confirming (the OK button, labelled with the action's label, or Enter) needs it typed exactly. */
      entityName: string;
      description: React.ReactNode;
      /**
       * The instruction line above the input, e.g. a translated
       * `'Zum Bestätigen {phrase} eingeben:'`. Each `{phrase}` shows the phrase
       * (`entityName`) highlighted, so a translation can place it anywhere; a
       * prompt without `{phrase}` gets the phrase after it. Absent: the
       * English `Type {phrase} to confirm:`.
       */
      prompt?: string;
    };

export interface ActionOptions<TArgs = void, TResult = void, RouteId extends string = string> {
  id: string;
  label: Thunk<string>;
  icon?: Thunk<React.ReactNode>;
  variant?: Thunk<'default' | 'primary' | 'danger'>;
  enabled?: Thunk<Decision>;
  invisible?: Thunk<boolean>;
  confirmation?: Thunk<ConfirmationSpec | undefined>;
  errorRoute?: RouteId;
  fire: (args: TArgs, ctx: ExecutionContext) => Promise<TResult> | TResult;
  onSuccess?: (result: TResult) => void;
}

/** Compiles only when `A` is assignable to `B`. Not part of the package's public API: kept here as the one definition, imported directly by the files that use it (kinds.ts), and left out of index.ts's re-export of this module. */
export type Fits<A extends B, B> = A;

/**
 * A compile-time check: an action calls its options' functions with nothing, so one that takes
 * a parameter (the field context, say) must not compile, rather than crash when it is called.
 */
type ActionFunctionsTakeNoParameter = [
  // @ts-expect-error -- a function of a parameter is not a zero-argument thunk.
  Fits<(ctx: { t(key: string): string }) => string, ActionOptions['label']>,
];

// Conditional rest-tuple lets call sites omit args entirely when TArgs is
// void (e.g. plain ActionButton click) and requires the value otherwise
// (e.g. FormSubmitButton passing typed form values).
type FireArgs<TArgs> = [TArgs] extends [void] ? [] : [args: TArgs];

export interface ActionStatus<TArgs = void> {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant: 'default' | 'primary' | 'danger';
  pending: boolean;
  disabled: boolean;
  reason?: string;
  invisible: boolean;
  confirmation?: ConfirmationSpec;
  /**
   * Messages of the last run: reported through the ExecutionContext, or the thrown error.
   * Optional so hand-built statuses (adapters, test fixtures) stay valid; read it as `[]` when
   * absent. Statuses from useAction and useActionList always carry it.
   */
  messages?: Message[];
  /** The error texts among `messages` (kept for callers that only show errors). */
  errors: string[];
  fire(...args: FireArgs<TArgs>): void;
  firePromise(...args: FireArgs<TArgs>): Promise<void>;
}

export type ParsedApiError = {
  status: number;
  reason?: string;
  message?: string;
};

export type RegistryEntry = { i18nKey: string; field?: string };
export type ErrorRoutesRegistry<RouteId extends string> =
  Record<RouteId, Record<string, RegistryEntry>>;

export type ApiErrorContext<RouteId extends string> = {
  route: RouteId;
  form?: FormLike;
  setInlineError?: (text: string | null) => void;
  t: (key: string) => string;
  showError?: MessageSink;
};

export type ActionErrorCtx = {
  form: FormLike;
  setInlineError: (text: string | null) => void;
};
