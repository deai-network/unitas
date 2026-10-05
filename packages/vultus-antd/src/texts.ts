import { createContext, useContext } from 'react';

/**
 * The few texts vultus-antd writes itself, in English by default. Apps
 * translate them through VultusProvider's `texts`.
 */
export interface VultusTexts {
  /** Leads the current value's description in a field's tooltip: "Current state: On". */
  currentState: string;
}

export const defaultVultusTexts: VultusTexts = {
  currentState: 'Current state:',
};

export const VultusTextsContext = createContext<VultusTexts>(defaultVultusTexts);

export function useVultusTexts(): VultusTexts {
  return useContext(VultusTextsContext);
}
