import { createContext, useContext, type ReactNode } from 'react';
import type { ArgStore } from './argStore.js';

const ArgStoreContext = createContext<ArgStore | undefined>(undefined);

/** Gives the subtree below an ArgStore (Praeceptor: the URL store around the module page, localStorage around the print dialog). */
export function ArgStoreProvider({ store, children }: { store: ArgStore; children?: ReactNode }) {
  return <ArgStoreContext.Provider value={store}>{children}</ArgStoreContext.Provider>;
}

/** The nearest ArgStoreProvider's store; a hook with none above it fails loudly rather than reading nothing. */
export function useArgStore(): ArgStore {
  const store = useContext(ArgStoreContext);
  if (store === undefined) throw new Error('No ArgStoreProvider is above this component');
  return store;
}
