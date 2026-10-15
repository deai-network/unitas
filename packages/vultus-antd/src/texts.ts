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
  /** Closes a many-of field's open list of choices, and a tree picker's phone panel (TreePicker `panel="drawer"`). */
  done: string;
  /** A many-of field's search box placeholder, filtering its choices. */
  search: string;
  /**
   * Joins the chosen choices' labels in a many-of field's summary, e.g. "A, B and C"; also filtered out of a free-text search,
   * and trimmed from the end of a first-words cut (TreePicker `summary="firstWords"`: "Gráfok és…" is shown "Gráfok…"),
   * compared case-insensitively.
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
