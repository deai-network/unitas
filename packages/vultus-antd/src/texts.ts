import { createContext, useContext } from 'react';

/**
 * The few texts vultus-antd writes itself, in English by default. Apps
 * translate them through VultusProvider's `texts`.
 */
export interface VultusTexts {
  /**
   * Leads the current value's description in a field's tooltip, and the
   * current choice's on its segment or mark: "Current state: On".
   */
  currentState: string;
  /** Leads another choice's description on its segment or mark (what a click does): "Switch to: Off". */
  switchTo: string;
}

export const defaultVultusTexts: VultusTexts = {
  currentState: 'Current state:',
  switchTo: 'Switch to:',
};

export const VultusTextsContext = createContext<VultusTexts>(defaultVultusTexts);

export function useVultusTexts(): VultusTexts {
  return useContext(VultusTextsContext);
}
