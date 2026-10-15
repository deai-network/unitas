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

/**
 * The context value as the definitions' functions receive it: reading a key that no provider
 * gave throws, naming it and the keys present, so a forgotten value fails loudly instead of
 * passing `undefined` along. A key provided with the value `undefined` is fine.
 */
function guard(raw: object): object {
  return new Proxy(raw, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !isProbe(key) && !(key in target)) {
        throw new Error(`Field context: '${key}' was never provided (provided: ${Object.keys(target).join(', ')})`);
      }
      return Reflect.get(target, key, receiver);
    },
  });
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

/** The field context the hooks resolve functions with: the guarded value, or NO_FIELD_CONTEXT. */
export function useFieldContext(): FieldCtx {
  return useContext(FieldContext)?.guarded ?? NO_FIELD_CONTEXT;
}
