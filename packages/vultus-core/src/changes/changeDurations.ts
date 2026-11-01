import type { ChangeMarkComponent } from '../Components.js';

/** How fast a switch's marks run (the lent mark's `speed`, `useTextChanges`' `speed`): `normal` by
 *  default. What each speed's times are is the lent mark's: its look, and its `durations`. */
export type ChangeSpeed = 'slow' | 'normal' | 'fast';

/** When a switch's marks may go, in ms from the commit that shows the new text: on the `plain`
 *  timeline (no removed letters) and on `removals`. */
export interface ChangeDurations {
  plain: number;
  removals: number;
}

/** vultus's timings, in ms, for a page whose mark gives none: harma-style's change highlight's at
 *  normal speed, the end of its timeline plus 0.5 s. `plain`: hold 0.3 s and fade 0.75 s;
 *  `removals`: remove-hold 0.15 s, squeeze 0.3 s and grow 0.3 s before them. */
const DEFAULTS: Readonly<ChangeDurations> = { plain: 1550, removals: 2300 };

/**
 * When a switch's marks may go (spec 6): the lent mark's (`mark`, the `ChangeMark` an app lends
 * through `VultusComponents`) `durations(element, speed)`, the timings of its look, read at
 * `element` (the near container, else none) at `speed` (`normal` by default).
 *
 * Without a mark, or one that gives no `durations`, vultus's defaults: 1.55 s on the plain timeline
 * and 2.3 s on removals, at every speed, so a page without a look still ends a switch and its marks
 * go. A new object each call.
 */
export function changeDurations(element?: Element, speed: ChangeSpeed = 'normal', mark?: ChangeMarkComponent): ChangeDurations {
  return mark?.durations ? mark.durations(element, speed) : { ...DEFAULTS };
}
