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
  /** Closes TreePicker's phone panel (`panel="drawer"`), the button at its top. */
  done: string;
  /**
   * A tree widget's search box placeholder, filtering its nodes by label
   * (TreeChecklist's own search box; TreePicker `panel="drawer"`'s, which
   * holds a TreeChecklist). No many-of widget has a search box of its own
   * today (ManyOfSelect's is antd's unlabelled one).
   */
  search: string;
  /**
   * Words a first-words cut does not end on (TreePicker `summary="firstWords"`: "Gráfok és…" is
   * shown "Gráfok…"), compared case-insensitively.
   */
  joiningWords: string[];
  /** Names a range field's lower-end handle to assistive tech, after its label: "School years, from". */
  from: string;
  /** Names a range field's upper-end handle to assistive tech, after its label: "School years, to". */
  to: string;
}

export const defaultVultusTexts: VultusTexts = {
  currentState: 'Current state:',
  switchTo: 'Switch to:',
  done: 'Done',
  search: 'Search',
  joiningWords: ['and', 'of', 'the'],
  from: 'from',
  to: 'to',
};

export const VultusTextsContext = createContext<VultusTexts>(defaultVultusTexts);

export function useVultusTexts(): VultusTexts {
  return useContext(VultusTextsContext);
}
