import type { Element, Root } from 'hast';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVultusComponents } from '../Components.js';
import { changeComponents, changeStore, type ChangeComponents, type ChangeStore, type ChangeTimeline } from './ChangeMark.js';
import { changeDurations, type ChangeSpeed } from './changeDurations.js';
import { BLOCK_NUMBER_ATTRIBUTE, changesPlugin, type BlockAttribute, type ReadReport } from './rehypeChanges.js';
import { useVisibleBlocks, type ContainerOption, type VisibleBlocks } from './visibleBlocks.js';

/** `near` as the blocks on screen: those crossing `container` (the scrolling pane) as a switch
 *  starts, `blocks` more on each side; `rootMargin`, the observer's (a sticky bar over the pane's
 *  top). A ref object is read once, after mount: a pane that mounts later or is replaced is given
 *  as the element (a callback ref kept in state), or `near` limits nothing. */
export interface NearBlocks {
  container: ContainerOption;
  blocks: number;
  rootMargin?: string;
}

export interface TextChangesOptions {
  /** The content's identity: same key, new text animates; a new key swaps plainly. */
  key: string;
  /** `false`: swap plainly once, under the same key too, replacing the reading. */
  animate?: boolean;
  /** The blocks a switch marks, by number: a function, or the blocks on screen (`NearBlocks`);
   *  none, all. Frozen per switch. */
  near?: ((block: number) => boolean) | NearBlocks;
  /** An existing numbering's attribute; none: the plugin numbers as `data-vultus-block`. */
  blockAttribute?: BlockAttribute;
  /** What the reading leaves out besides `data-vultus-change-skip`. */
  skip?: (element: Element) => boolean;
  /** How fast a switch's marks run (the lent mark's `speed`): `normal` by default. Taken as a
   *  switch starts and held for it, marks and timer alike. */
  speed?: ChangeSpeed;
}

/** One tree's plugin and drawing: `rehypePlugin` for its Markdown's `rehypePlugins`, `components`
 *  merged into its `components`. */
export interface TextChangesPart {
  rehypePlugin: () => (tree: Root) => void;
  components: ChangeComponents;
}

/** The default part's plugin and drawing, the other parts (`part`), and whether a switch's marks
 *  are shown (`active`). */
export interface TextChanges extends TextChangesPart {
  part(name: string): TextChangesPart;
  active: boolean;
}

/** The part `rehypePlugin` and `components` on the result belong to. */
export const DEFAULT_PART = 'default';

/** A switch: its number, each part's previous reading (by part), the near set frozen as it
 *  started (none: all marked), and the speed taken then. */
interface Switch {
  number: number;
  from: Map<string, string>;
  near: ((block: number) => boolean) | undefined;
  speed: ChangeSpeed;
}

/** The text shown, under its key; the switches so far (`count`); the switch running, if any. */
interface Shown {
  key: string;
  text: string;
  count: number;
  current: Switch | undefined;
}

/** A part's last report: what its plugin read, for which content text, in which switch (0: none). */
interface Report extends ReadReport {
  text: string;
  number: number;
}

/** The objects of one phase (a switch, or the idle text): its parts, made on demand, and the result. */
interface Phase {
  key: Switch | string;
  parts: Map<string, TextChangesPart>;
  result: TextChanges;
}

/** What the hook keeps for its life. */
interface Kept {
  store: ChangeStore;
  components: ChangeComponents;
  reports: Map<string, Report>;
  /** The content text of the render, for the reports. */
  holder: { text: string };
  phase: Phase | undefined;
}

// `useLayoutEffect` warns when it does nothing on the server; fall back to a plain effect there.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * What changed between two versions of a text, lit up. `text` is the whole content, all
 * its parts; `key` its identity, the app's decision of which changes are related:
 * - same key, new text: a switch. Each part diffs its previous reading against this one, and the
 *   switch animates;
 * - a new key: the text appears plainly, and a running switch stops at once (its marks go in that
 *   render). This text is the start for the next related change;
 * - same key, same text (`===`): nothing;
 * - `animate: false`: swaps plainly once, under the same key too, and replaces the reading.
 * The first render has nothing read before it, so nothing animates.
 *
 * Parts: `part(name)` gives one tree's `{ rehypePlugin, components }`; `rehypePlugin` and
 * `components` on the result are the default part's. Each part keeps its own previous reading (the
 * one its plugin reported for the text shown before; none, a part new in this version, all new
 * against `''`) and diffs on its own. One switch has one number, one timer and one timeline over
 * all its parts.
 *
 * A switch's timeline is decided after its parts render, before the paint: in a layout effect,
 * from the plugins' reports (a removed mark cut in anywhere: `removals`; else `plain`), set in the
 * hook's store, from which the marks re-render alone: the trees are not parsed again. The timer
 * starts there, for `changeDurations()` on that timeline: the lent mark's `durations` (the
 * `ChangeMark` in `VultusComponents` as the switch starts), at `near`'s container (else none) and
 * the switch's speed, or vultus's defaults; at its end, the text renders without marks. A second
 * switch within one diffs the text shown against the next, in marks of its own, and its timer
 * replaces the first's.
 *
 * `speed` (`normal` by default; the lent mark's, which gives each one's times) is taken as a switch
 * starts and held for that switch, like the near set: every mark of it (through the store) and its
 * timer run at that speed, so they always agree. A new speed counts from the next switch on; it
 * changes no identity and parses nothing.
 *
 * Identities: `rehypePlugin`, `components` and each part's object are kept while nothing changes:
 * an app's Markdown memoises on them, and a big section takes 0.1 s or more to parse. They change as
 * a switch starts and as it ends, and with a plain swap (a new text shown plainly): every part shown
 * then parses again and reports its reading of the new text. A memo'd part whose own text did not
 * change would otherwise keep its report of an older text, and diff all of itself as new at the
 * next switch. `components` never changes. Inline `skip` and `near` functions, `near` objects and a
 * new `speed` change nothing: `skip` and `blockAttribute` are read as a plugin runs, `near` and
 * `speed` as a switch starts.
 *
 * `near`: a function of the block number, as it is; or `{ container, blocks, rootMargin? }`, the
 * innermost blocks crossing the container (`useVisibleBlocks`) as the switch starts, `blocks` more
 * each way. Frozen for the switch: a re-parse during the light-up keeps it. With no range (no
 * IntersectionObserver, nothing reported yet), none: all of it marked.
 *
 * `active`: whether a switch's marks are shown.
 */
export function useTextChanges(text: string, options: TextChangesOptions): TextChanges {
  const [kept] = useState<Kept>(() => {
    const store = changeStore();
    return { store, components: changeComponents(store), reports: new Map(), holder: { text }, phase: undefined };
  });
  // The options as this render has them, for the plugins as they run and the switch's effect.
  const latest = useRef(options);
  latest.current = options;
  const { key, animate, near, blockAttribute, speed = 'normal' } = options;
  // The lent mark, whose `durations` time a switch; the switch's effect reads the one of the render
  // that starts it.
  const { ChangeMark: mark } = useVultusComponents();
  const nearBlocks = typeof near === 'object' ? near : undefined;
  const visible = useVisibleBlocks(nearBlocks?.container, blockAttribute ?? BLOCK_NUMBER_ATTRIBUTE, nearBlocks?.rootMargin);

  // Worked out as the text changes, in the render that shows it, so it never shows unlit first.
  const [stored, setShown] = useState<Shown>(() => ({ key, text, count: 0, current: undefined }));
  let shown = stored;
  if (key !== shown.key || text !== shown.text) {
    const number = shown.count + 1;
    shown = key === shown.key && animate !== false
      ? { key, text, count: number, current: { number, from: readings(kept.reports, shown.text), near: frozen(near, visible), speed } }
      : { key, text, count: shown.count, current: undefined };
    setShown(shown);
  }
  kept.holder.text = shown.text;
  const { current } = shown;
  // The new switch's marks drawn with its number and speed, plain until its timeline is decided.
  if (current && kept.store.getSnapshot().number !== current.number) {
    kept.store.set({ number: current.number, timeline: undefined, speed: current.speed }, false);
  }
  const phaseKey = current ?? shown.text;
  let made = kept.phase;
  if (!made || made.key !== phaseKey) {
    made = phase(phaseKey, current, kept, latest);
    kept.phase = made;
  }

  useIsomorphicLayoutEffect(() => {
    if (!current) return undefined;
    const { number, speed: switchSpeed } = current;
    const removals = Array.from(kept.reports.values()).some((report) => report.number === number && report.removals);
    const timeline: ChangeTimeline = removals ? 'removals' : 'plain';
    kept.store.set({ number, timeline, speed: switchSpeed }, true);
    const now = latest.current.near;
    const container = now && typeof now === 'object' ? now.container : undefined;
    const element = container && 'current' in container ? container.current : container;
    const timer = setTimeout(() => {
      setShown((then) => (then.current?.number === number ? { ...then, current: undefined } : then));
    }, changeDurations(element ?? undefined, switchSpeed, mark)[timeline]);
    return () => clearTimeout(timer);
  }, [current]);

  return made.result;
}

/** Each part's reading of `text`: the reports read for it (a part absent from it has none). */
function readings(reports: Map<string, Report>, text: string): Map<string, string> {
  const from = new Map<string, string>();
  for (const [name, report] of reports) if (report.text === text) from.set(name, report.reading);
  return from;
}

/** The near set a switch takes now: a function as it is; the blocks on screen, `blocks` more each
 *  way; none without a range. */
function frozen(near: TextChangesOptions['near'], visible: VisibleBlocks): ((block: number) => boolean) | undefined {
  if (typeof near !== 'object') return near;
  const range = visible.range();
  if (!range) return undefined;
  const { blocks } = near;
  return (block) => range.first - blocks <= block && block <= range.last + blocks;
}

/** The objects of a phase, `key` (a switch, `current`, or the idle text): each part's plugin, with
 *  the switch's previous reading, near set and number in it, reporting to `kept`; and the result. */
function phase(key: Switch | string, current: Switch | undefined, kept: Kept, latest: { readonly current: TextChangesOptions }): Phase {
  const parts = new Map<string, TextChangesPart>();
  const number = current?.number ?? 0;
  const part = (name: string): TextChangesPart => {
    let made = parts.get(name);
    if (!made) {
      const from = current ? current.from.get(name) ?? '' : undefined;
      const skip = (element: Element) => latest.current.skip?.(element) ?? false;
      const onRead = (report: ReadReport) => {
        kept.reports.set(name, { ...report, text: kept.holder.text, number });
      };
      made = {
        rehypePlugin: () => changesPlugin({ from, near: current?.near, blockAttribute: latest.current.blockAttribute, skip, onRead })(),
        components: kept.components,
      };
      parts.set(name, made);
    }
    return made;
  };
  const { rehypePlugin, components } = part(DEFAULT_PART);
  return { key, parts, result: { rehypePlugin, components, part, active: current !== undefined } };
}
