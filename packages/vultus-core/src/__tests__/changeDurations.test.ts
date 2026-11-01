import { describe, expect, it, vi } from 'vitest';
import type { ChangeMarkComponent } from '../Components.js';
import { changeDurations, type ChangeDurations, type ChangeSpeed } from '../changes/changeDurations.js';

// When a switch's marks may go: the timings belong to the look, so they come from the lent mark's
// `durations`; without a mark, or one that gives none, vultus's defaults (a change highlight's
// normal timings, at every speed), so a page without a look still ends a switch.

const SPEEDS = ['slow', 'normal', 'fast'] as const;
const DEFAULTS = { plain: 1550, removals: 2300 };

/** A lent mark drawing nothing, with `durations` if given. */
function mark(durations?: (element: Element | undefined, speed: ChangeSpeed) => ChangeDurations): ChangeMarkComponent {
  const Mark: ChangeMarkComponent = () => null;
  if (durations) Mark.durations = durations;
  return Mark;
}

describe('changeDurations', () => {
  it('without a mark: 1.55 s without removals, 2.3 s with them, at every speed, with an element or not', () => {
    const pane = document.createElement('div');
    expect(changeDurations()).toEqual(DEFAULTS);
    for (const speed of SPEEDS) {
      expect(changeDurations(undefined, speed), speed).toEqual(DEFAULTS);
      expect(changeDurations(pane, speed), speed).toEqual(DEFAULTS);
    }
  });

  it("a lent mark's durations, asked with the element and the speed (normal by default)", () => {
    const durations = vi.fn((_element: Element | undefined, speed: ChangeSpeed) => (
      speed === 'fast' ? { plain: 1200, removals: 1700 } : { plain: 100, removals: 200 }));
    const lent = mark(durations);
    const pane = document.createElement('div');
    expect(changeDurations(pane, 'fast', lent)).toEqual({ plain: 1200, removals: 1700 });
    expect(durations).toHaveBeenLastCalledWith(pane, 'fast');
    expect(changeDurations(undefined, undefined, lent)).toEqual({ plain: 100, removals: 200 });
    expect(durations).toHaveBeenLastCalledWith(undefined, 'normal');
    expect(durations).toHaveBeenCalledTimes(2);
  });

  it('a lent mark without durations: the defaults, at every speed', () => {
    for (const speed of SPEEDS) expect(changeDurations(document.body, speed, mark()), speed).toEqual(DEFAULTS);
  });

  it('the defaults, a new object each time: a caller changing one changes no other', () => {
    const first = changeDurations();
    first.plain = 0;
    expect(changeDurations()).toEqual(DEFAULTS);
  });
});
