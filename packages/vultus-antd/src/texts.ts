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
  /** Closes ManyOfTreePicker's phone panel (`panel="drawer"`), the button at its top. */
  done: string;
  /**
   * A tree widget's search box placeholder, filtering its nodes by label
   * (ManyOfTreeChecklist's own search box; ManyOfTreePicker `panel="drawer"`'s, which
   * holds a ManyOfTreeChecklist). No many-of widget has a search box of its own
   * today (ManyOfSelect's is antd's unlabelled one).
   */
  search: string;
  /**
   * Words a first-words cut does not end on (ManyOfTreePicker `summary="firstWords"`: "Gráfok és…" is
   * shown "Gráfok…"), compared case-insensitively.
   */
  joiningWords: string[];
  /** Names a range field's lower-end handle to assistive tech, after its label: "School years, from". */
  from: string;
  /** Names a range field's upper-end handle to assistive tech, after its label: "School years, to". */
  to: string;
  /** Joins the labels of a one-of tree node's path (OneOfTreePicker `summary="path"`): "Geometria › Síkgeometria". */
  pathSeparator: string;
  /** Names the empty value of an optional one-of tree field where a widget lists it as a row of its own and the field has no placeholder. */
  none: string;
}

export const defaultVultusTexts: VultusTexts = {
  currentState: 'Current state:',
  switchTo: 'Switch to:',
  done: 'Done',
  search: 'Search',
  joiningWords: ['and', 'of', 'the'],
  from: 'from',
  to: 'to',
  pathSeparator: ' › ',
  none: 'None',
};

export const VultusTextsContext = createContext<VultusTexts>(defaultVultusTexts);

export function useVultusTexts(): VultusTexts {
  return useContext(VultusTextsContext);
}
