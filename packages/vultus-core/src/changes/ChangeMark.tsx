import {
  Fragment, useEffect, useLayoutEffect, useReducer, type ComponentPropsWithoutRef, type ReactElement, type ReactNode,
} from 'react';
import { useVultusComponents } from '../Components.js';
import type { ChangeSpeed } from './changeDurations.js';
import type { ChangeLevel } from './changesIn.js';
import { FallbackMark } from './FallbackMark.js';

/**
 * The timeline a switch's marks run on: `removals` for a switch that shows removed letters, the
 * old letters cut away before the new ones are uncovered; `plain` for one that shows none, its
 * letters lit at once. One per switch, over all its parts: a lent mark's removal timeline may
 * light a word later than its plain one, so a switch's parts on two timelines would light apart
 * (a switch with any removal uses the removals timeline for all its letters).
 */
export type ChangeTimeline = 'plain' | 'removals';

/** A switch as its marks draw it: its number (0 outside one), its timeline (`undefined`: not
 *  decided yet, drawn `plain`), and its speed (the lent mark's `speed`; none: normal), taken as it
 *  started. */
export interface ChangeState {
  number: number;
  timeline: ChangeTimeline | undefined;
  speed?: ChangeSpeed;
}

/** Where the marks read the switch's state from: the hook's store, read-only. */
export interface ChangeSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ChangeState;
}

/** The hook's store of the switch's state: `set` replaces it, and with `notify` re-renders the
 *  marks (not the trees: no re-parse). */
export interface ChangeStore extends ChangeSource {
  set(state: ChangeState, notify: boolean): void;
}

/** A store of the switch's state, from `initial` (by default, no switch: number 0, undecided). */
export function changeStore(initial: ChangeState = { number: 0, timeline: undefined }): ChangeStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return state;
    },
    set(next, notify) {
      state = next;
      if (notify) for (const listener of Array.from(listeners)) listener();
    },
  };
}

/**
 * A change from another version of the text, as the changes plugin marks it (`changesPlugin`): a
 * changed word (`word`), its changed letters inside it (`letters`), the old letters that went
 * (`removed`), and a replacement around old letters and the new ones at their place (`replaced`),
 * each carrying `data-change`, its level. The one place the look is drawn.
 *
 * The look is the lent mark's: the `ChangeMark` an app lends through `VultusComponents`; without
 * one, vultus's fallback (`FallbackMark`), static marks. `variant="change"` on the word, lightly. On the `plain` timeline (and until it is
 * decided), `variant="change-strong"` on its letters inside it, more strongly: lit at once, then
 * faded, each mark timed from its own insertion. On the `removals` timeline, the old letters in
 * `variant="change-removed"` (cut away first) and the new ones in `variant="change-added"`
 * (uncovered after); every word takes `timeline="removals"`, so that one holding neither removed
 * nor added letters (the `vei` of `*hí*vei`, a piece of a word split by markup) waits with the rest
 * rather than lighting at once. `removed` is drawn so on either timeline: a switch that shows any is
 * on `removals`.
 *
 * A replacement (`replaced`), on the `removals` timeline, is `variant="change-replaced"` around its
 * two, which morph from the old letters to the new. A lent mark may measure both letters once, as
 * the wrapper is put in, so on `plain` and while undecided the two are drawn as they are, unwrapped
 * (a Fragment): there the new letters are `change-strong`, with no letters span to measure, and the
 * wrapper would close to no width. It is put in, and measures, in the commit that puts the switch
 * on `removals`, before the paint.
 *
 * Keyed by `number`, the switch's: a lent mark's fade may belong to the element, timed from its
 * insertion, and react-markdown keys an element by its tag's count among its siblings, so the next
 * switch's mark on the same word has the same key. A new number draws new
 * marks, lit from the start, never the switch before's, half faded or gone; a render within one
 * keeps them, fading on.
 *
 * Every mark takes the switch's `speed` (the lent mark's; none: normal), so its words and letters
 * run one timeline.
 */
export function ChangeMark({ level, number, timeline, speed, children }: {
  level: ChangeLevel;
  number: number;
  timeline: ChangeTimeline | undefined;
  speed?: ChangeSpeed;
  children?: ReactNode;
}): ReactElement {
  const Mark = useVultusComponents().ChangeMark ?? FallbackMark;
  if (level === 'replaced' && timeline !== 'removals') return <Fragment key={number}>{children}</Fragment>;
  const variant = level === 'word' ? 'change'
    : level === 'removed' ? 'change-removed'
    : level === 'replaced' ? 'change-replaced'
    : timeline === 'removals' ? 'change-added' : 'change-strong';
  return (
    <Mark key={number} variant={variant} timeline={level === 'word' && timeline === 'removals' ? 'removals' : undefined}
      speed={speed} data-change={level}>{children}</Mark>
  );
}

/** An `ins` as react-markdown gives it to its `components`: its props, and the hast `node`. */
export type InsProps = ComponentPropsWithoutRef<'ins'> & { node?: unknown };

/** The components entry an app merges into its Markdown's `components`. */
export interface ChangeComponents {
  ins: (props: InsProps) => ReactElement;
}

const LEVELS: ReadonlySet<string> = new Set<ChangeLevel>(['word', 'letters', 'removed', 'replaced']);

/** The entries made, one per source. */
const made = new WeakMap<ChangeSource, ChangeComponents>();

/**
 * The `ins` entry drawing the change marks with `source`'s state (spec 4): an `ins` whose
 * `data-change` is a change level is a `ChangeMark` with the switch's number, timeline and speed; any
 * other `ins` is drawn as itself (react-markdown's `node` dropped). One frozen object per source,
 * so its identity never changes: an app's Markdown memoises on its `components`.
 */
export function changeComponents(source: ChangeSource): ChangeComponents {
  let components = made.get(source);
  if (!components) {
    const ins = ({ node, ...rest }: InsProps): ReactElement => {
      const level = (rest as Record<string, unknown>)['data-change'];
      return typeof level === 'string' && LEVELS.has(level)
        ? <LiveMark source={source} level={level as ChangeLevel}>{rest.children}</LiveMark>
        : <ins {...rest} />;
    };
    components = Object.freeze({ ins });
    made.set(source, components);
  }
  return components;
}

// `useLayoutEffect` warns when it does nothing on the server; fall back to a plain effect there.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * A `ChangeMark` drawn with `source`'s state as it reads it in render, re-drawn on its
 * notifications alone (its parents are not re-rendered). It subscribes in a layout effect, not
 * through `useSyncExternalStore`, which subscribes in the passive phase (Ruling 4): the hook
 * decides the timeline in its own layout effect, which runs after its children's, so the marks
 * have subscribed by then and take it before the paint. At subscription it re-draws if the state
 * changed since its render.
 */
function LiveMark({ source, level, children }: { source: ChangeSource; level: ChangeLevel; children?: ReactNode }): ReactElement {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const state = source.getSnapshot();
  useIsomorphicLayoutEffect(() => {
    const unsubscribe = source.subscribe(redraw);
    // `state` is the one this effect's render read.
    if (source.getSnapshot() !== state) redraw();
    return unsubscribe;
  }, [source]);
  return <ChangeMark level={level} number={state.number} timeline={state.timeline} speed={state.speed}>{children}</ChangeMark>;
}
