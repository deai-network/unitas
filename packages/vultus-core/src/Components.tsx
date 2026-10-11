import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/** A spinner an app lends to vultus/optio, rendered in place of their native loading indicators. */
export interface SpinnerProps {
  /** The spinner's identity: stable across re-renders and remounts, unique on the page (after scoping). */
  spinnerKey: string;
  /** antd's names (the height of antd's Spin indicator) or a height in px. */
  size?: 'small' | 'default' | 'large' | number;
  /** Accessible label; the spinner's own default when omitted. */
  label?: string;
}
export type SpinnerComponent = ComponentType<SpinnerProps>;

/** Components an app lends to the libraries. */
export interface VultusComponents {
  Spinner?: SpinnerComponent;
}

/**
 * The components an app lends to vultus/optio in place of their own UI. Default is `{}`
 * (none lent) so vultus-core stays framework-neutral; vultus-antd's `VultusProvider` merges
 * in whatever an app passes as `components`.
 */
export const VultusComponentsContext = createContext<VultusComponents>({});

export function useVultusComponents(): VultusComponents {
  return useContext(VultusComponentsContext);
}

/** The scope path (segment names, outermost first) that `useSpinnerKey` prefixes onto local keys. */
const SpinnerScopeContext = createContext<string[]>([]);

/** Prefixes every spinner key below with `name` (scopes nest: outer/inner). */
export function SpinnerScope({ name, children }: { name: string; children?: ReactNode }) {
  const outer = useContext(SpinnerScopeContext);
  return (
    <SpinnerScopeContext.Provider value={[...outer, name]}>{children}</SpinnerScopeContext.Provider>
  );
}

/** The scoped key for a library-local key: 'outer/inner/local', or 'local' outside any scope. */
export function useSpinnerKey(localKey: string): string {
  const scope = useContext(SpinnerScopeContext);
  return [...scope, localKey].join('/');
}
