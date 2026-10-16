import { createContext, useContext, useMemo, type JSX, type ReactNode } from 'react';

/**
 * What useFieldContext gives when no FieldContextProvider is above: a field's function that
 * declares a parameter then has nothing to receive, and resolving it throws.
 */
export const NO_FIELD_CONTEXT: unique symbol = Symbol('vultus.noFieldContext');

/** The field context as the hooks hold it: the guarded value, or the mark that there is none. */
export type FieldCtx = object | typeof NO_FIELD_CONTEXT;

/** The merged value of the providers above, and the same value guarded against missing keys. */
interface Provided {
  raw: object;
  guarded: object;
}

const FieldContext = createContext<Provided | undefined>(undefined);

/**
 * Keys that libraries read to find out what an object is (a thenable, JSON, a test matcher, a
 * React element, a DOM node or element, a mock function), and the `@@`-prefixed sentinels
 * (Immutable's) that printers such as pretty-format test for. Reading them on the context is a
 * probe, not a mistake.
 */
const PROBED_KEYS = new Set([
  'then', 'toJSON', 'asymmetricMatch', '$$typeof', 'nodeType', 'tagName', 'hasAttribute', '_isMockFunction',
]);

function isProbe(key: string): boolean {
  return PROBED_KEYS.has(key) || key.startsWith('@@');
}

/** What the guard throws for a key no provider gave, so readingContext can tell it from the function's own errors. */
class MissingKeyError extends Error {}

/**
 * The context value as the definitions' functions receive it: reading a key that no provider
 * gave throws, naming it and the keys present, so a forgotten value fails loudly instead of
 * passing `undefined` along. A key provided with the value `undefined` is fine. `values` is the
 * key a field group adds (extendFieldContext), so reading it from any other context says so.
 */
function guard(raw: object): object {
  return new Proxy(raw, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !isProbe(key) && !(key in target)) {
        if (key === 'values') throw new MissingKeyError('ctx.values is only available inside a field group');
        throw new MissingKeyError(`Field context: '${key}' was never provided (provided: ${Object.keys(target).join(', ')})`);
      }
      return Reflect.get(target, key, receiver);
    },
  });
}

/**
 * Runs `read`, a call of a definition's function with the field context. A key it reads that
 * no provider gave throws with `where` (`Field '<id>': option '<name>'`) in front of the
 * guard's message, so the error names the field and the option as well as the key; any other
 * error passes through unchanged.
 */
export function readingContext<T>(where: string, read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof MissingKeyError) throw new Error(`${where}: ${error.message}`, { cause: error });
    throw error;
  }
}

/**
 * Gives the fields below a context, the argument their definitions' functions receive. Nested
 * providers merge, the inner value winning: an app can provide `t` near the root and the data
 * a page shows further down.
 */
export function FieldContextProvider({ value, children }: { value: object; children?: ReactNode }) {
  const outer = useContext(FieldContext);
  // Memoized on the outer context and `value`: a caller passing a fresh object literal gets a
  // new context every render anyway; a stable `value` keeps the fields below from re-rendering.
  const provided = useMemo(() => {
    const raw = { ...outer?.raw, ...value };
    return { raw, guarded: guard(raw) };
  }, [outer, value]);
  return <FieldContext.Provider value={provided}>{children}</FieldContext.Provider>;
}

/**
 * A FieldContextProvider typed for the context `Ctx` an app's definitions are written against.
 * It is the same provider (one React context), so typed providers nest and merge with each
 * other and with the untyped one; each gives part of the context.
 */
export function createFieldContext<Ctx extends object>(): {
  Provider: (props: { value: Partial<Ctx>; children?: ReactNode }) => JSX.Element;
} {
  return { Provider: FieldContextProvider };
}

/**
 * A field context with `base`'s keys (none for NO_FIELD_CONTEXT) and `extra`'s, guarded as a
 * provider's value is: how a field group gives its fields' functions `values` beside the app's
 * own keys. `extra`'s properties are copied as defined, so a getter among them runs when its
 * key is read, not here. A key of `extra` that `base` already has throws, `where` in front,
 * instead of shadowing the app's value.
 */
export function extendFieldContext(base: FieldCtx, extra: Record<string, unknown>, where: string): object {
  const raw: object = base === NO_FIELD_CONTEXT ? {} : { ...base };
  for (const key of Object.keys(extra)) {
    if (Object.hasOwn(raw, key)) throw new Error(`${where}: the field context already has '${key}'; a field group provides it`);
  }
  return guard(Object.defineProperties(raw, Object.getOwnPropertyDescriptors(extra)));
}

/** The context withFieldContext gives the hooks it is running, if any. */
let override: FieldCtx | undefined;

/**
 * Runs `run` with `ctx` as the field context: a hook it calls gets `ctx` from useFieldContext
 * instead of the providers' value. It is for a hook that calls other hooks in its own render,
 * each with its own context (a field group runs each field's kind hook with the group's); the
 * components rendered below do not see it. `run` must be synchronous: the previous context
 * comes back when it returns or throws. Calls nest.
 */
export function withFieldContext<T>(ctx: FieldCtx, run: () => T): T {
  const previous = override;
  override = ctx;
  try {
    return run();
  } finally {
    override = previous;
  }
}

/**
 * The field context the hooks resolve functions with: the one withFieldContext gives while it
 * runs, else the providers' guarded value, or NO_FIELD_CONTEXT.
 */
export function useFieldContext(): FieldCtx {
  // Called under an override too, so that the hooks' order never depends on one.
  const provided = useContext(FieldContext);
  return override ?? provided?.guarded ?? NO_FIELD_CONTEXT;
}
