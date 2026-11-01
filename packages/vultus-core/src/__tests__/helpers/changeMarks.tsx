import type { ReactElement } from 'react';
import { VultusComponentsContext, type ChangeMarkComponent, type ChangeMarkProps, type VultusComponents } from '../../Components.js';
import type { ChangeDurations, ChangeSpeed } from '../../changes/changeDurations.js';

// A change mark lent to vultus for a test, as an app lends its look (`VultusComponents`'
// `ChangeMark`): the tests read the props the lent mark received, not a look's classes.

/** The props of every `TestMark` render, in order; a test empties it (`received.splice(0)`). */
export const received: ChangeMarkProps[] = [];

/**
 * A lent mark for tests: a `mark` carrying the props it was given as attributes (`data-change`,
 * `data-variant`, `data-timeline`, `data-speed`; none for a prop not given), what it holds inside.
 * Each render's props go to `received`. No `durations`: vultus's defaults.
 */
export const TestMark: ChangeMarkComponent = (props: ChangeMarkProps) => {
  received.push(props);
  const { variant, timeline, speed, children } = props;
  return (
    <mark data-change={props['data-change']} data-variant={variant} data-timeline={timeline} data-speed={speed}>{children}</mark>
  );
};

/** `TestMark` with `durations`: a new component. */
export function timedMark(durations: (element: Element | undefined, speed: ChangeSpeed) => ChangeDurations): ChangeMarkComponent {
  const Mark: ChangeMarkComponent = (props: ChangeMarkProps) => <TestMark {...props} />;
  Mark.durations = durations;
  return Mark;
}

/** A style library's change highlight's durations at each speed, from its stylesheet: what its
 *  lent mark's `durations` gives on a page with no override and no reduced motion. */
export const STYLE_DURATIONS: Readonly<Record<ChangeSpeed, ChangeDurations>> = {
  slow: { plain: 2250, removals: 3500 },
  normal: { plain: 1550, removals: 2300 },
  fast: { plain: 1200, removals: 1700 },
};

/** A lent mark timed by `STYLE_DURATIONS`, at the speed it is asked for. */
export const SpeedMark = timedMark((_element, speed) => ({ ...STYLE_DURATIONS[speed] }));

/** The context value lending each mark: one per mark, so a re-render lends the same value. */
const values = new WeakMap<ChangeMarkComponent, VultusComponents>();

/** `element` with `mark` lent (`TestMark` by default) through `VultusComponentsContext`. */
export function lent(element: ReactElement, mark: ChangeMarkComponent = TestMark): ReactElement {
  let value = values.get(mark);
  if (!value) {
    value = { ChangeMark: mark };
    values.set(mark, value);
  }
  return <VultusComponentsContext.Provider value={value}>{element}</VultusComponentsContext.Provider>;
}
