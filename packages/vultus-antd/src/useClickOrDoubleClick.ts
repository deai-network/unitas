import { useEffect, useRef } from 'react';

/** How long a widget waits after a click for a second one (a double click). */
export const DOUBLE_CLICK_MS = 300;

/**
 * Tells a click from a double click on a control whose single click must not
 * act before it is known not to be the first half of a double click. Counts
 * clicks (so two quick key presses or taps count as well), not dblclick
 * events.
 */
export function useClickOrDoubleClick(onClick: () => void, onDoubleClick: () => void, ms = DOUBLE_CLICK_MS): () => void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
      onDoubleClick();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      onClick();
    }, ms);
  };
}
