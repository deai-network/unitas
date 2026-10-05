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
export type ValueOrFn<T> = T | (() => T);

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
  | { kind: 'typing'; title: string; entityName: string; description: React.ReactNode };

export interface ActionOptions<TArgs = void, TResult = void, RouteId extends string = string> {
  id: string;
  label: ValueOrFn<string>;
  icon?: ValueOrFn<React.ReactNode>;
  variant?: ValueOrFn<'default' | 'primary' | 'danger'>;
  enabled?: ValueOrFn<Decision>;
  invisible?: ValueOrFn<boolean>;
  confirmation?: ValueOrFn<ConfirmationSpec | undefined>;
  errorRoute?: RouteId;
  fire: (args: TArgs, ctx: ExecutionContext) => Promise<TResult> | TResult;
  onSuccess?: (result: TResult) => void;
}

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
