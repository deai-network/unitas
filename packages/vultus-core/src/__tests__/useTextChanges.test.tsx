import { act, cleanup, render } from '@testing-library/react';
import type { Element as HastElement, Root } from 'hast';
import { StrictMode, createRef, memo, useMemo, type ReactElement } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeMarkComponent } from '../Components.js';
import type { ChangeSpeed } from '../changes/changeDurations.js';
import type { ChangeLevel } from '../changes/changesIn.js';
import { useTextChanges, type TextChanges, type TextChangesOptions, type TextChangesPart } from '../changes/useTextChanges.js';
import { lent, SpeedMark, TestMark, timedMark } from './helpers/changeMarks.js';
import { FakeIntersectionObserver, installFakeIntersectionObserver } from './helpers/intersection.js';

// A switch's lifecycle through the hook: the key deciding what animates, the parts sharing one
// switch, the identities an app's Markdown memoises on, the near set frozen per switch, the timer
// from the lent mark's timings, else vultus's defaults. Praeceptor's task panel change cases,
// through the hook. The marks are drawn by a lent test mark, which shows the props it received.

const REMARK = [remarkGfm];
/** The pane the trees are in: `near`'s container. */
const pane = createRef<HTMLDivElement>();
/** The parses of the memo'd trees (`counting`). */
let parses = 0;
/** A rehype plugin counting the parses it runs in. */
const counting = () => () => {
  parses++;
};
const MemoMarkdown = memo(Markdown);
type Plugin = TextChangesPart['rehypePlugin'];
const NO_PLUGINS: Plugin[] = [];
/** A rehype plugin numbering each `p` as `data-block` 1, 2, 3...: an app's own numbering. */
const numberParagraphs = () => (tree: Root) => {
  let n = 0;
  const walk = (node: Root | HastElement) => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'p') child.properties.dataBlock = ++n;
      walk(child);
    }
  };
  walk(tree);
};

interface DocProps {
  body: string;
  heading?: string;
  /** Two parts, a heading and a body; without, the default part draws the body. */
  parts?: boolean;
  k: string;
  animate?: boolean;
  near?: TextChangesOptions['near'];
  skip?: TextChangesOptions['skip'];
  blockAttribute?: TextChangesOptions['blockAttribute'];
  speed?: TextChangesOptions['speed'];
  /** Plugins run before the body's part. */
  before?: Plugin[];
  onChanges?: (changes: TextChanges) => void;
  /** The trees memo'd, on a stable plugin list ending in `counting`. */
  memo?: boolean;
}

/** `markdown` with `part`'s plugin (after `before`) and drawing: parsed on each render, as
 *  react-markdown does, or memo'd on its props. */
function Tree({ markdown, part, memoised, before = NO_PLUGINS }: { markdown: string; part: TextChangesPart; memoised: boolean; before?: Plugin[] }) {
  const plugins = useMemo(() => [...before, part.rehypePlugin, counting], [before, part.rehypePlugin]);
  return memoised
    ? <MemoMarkdown remarkPlugins={REMARK} rehypePlugins={plugins} components={part.components}>{markdown}</MemoMarkdown>
    : <Markdown remarkPlugins={REMARK} rehypePlugins={[...before, part.rehypePlugin]} components={part.components}>{markdown}</Markdown>;
}

/** A text of a heading and a body, in the pane: with `parts`, the heading (when given) a level-2
 *  heading of its own, its part `heading`, and the body its part `body`; without, the body alone,
 *  the default part's. */
function Doc({ body, heading, parts = false, k, animate, near, skip, blockAttribute, speed, before, onChanges, memo: memoised = false }: DocProps) {
  const changes = useTextChanges(`${heading ?? ''}\n\n${body}`, { key: k, animate, near, skip, blockAttribute, speed });
  onChanges?.(changes);
  return (
    <div ref={pane}>
      {parts && heading !== undefined && <Tree markdown={`## ${heading}`} part={changes.part('heading')} memoised={memoised} />}
      <Tree markdown={body} part={parts ? changes.part('body') : changes} memoised={memoised} before={before} />
    </div>
  );
}

/** `Doc` rendered (inside `wrap`, if given), `mark` lent for its life (`TestMark` by default; `null`,
 *  none: vultus's fallback): the container, each render's result (`last`, the latest), a re-render
 *  with other props, and the unmount. */
function doc(props: DocProps, wrap?: (element: ReactElement) => ReactElement, mark: ChangeMarkComponent | null = TestMark) {
  const results: TextChanges[] = [];
  const element = (next: DocProps) => {
    const shown = <Doc {...next} onChanges={(changes) => results.push(changes)} />;
    const drawn = mark ? lent(shown, mark) : shown;
    return wrap ? wrap(drawn) : drawn;
  };
  const { container, rerender, unmount } = render(element(props));
  return {
    container, results, unmount,
    last: () => results[results.length - 1]!,
    rerender: (next: DocProps) => rerender(element(next)),
  };
}

/** `node`'s text as the new version has it: without the old letters shown going inside it. */
function shown(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  for (const removed of copy.querySelectorAll('[data-change="removed"]')) removed.remove();
  return copy.textContent ?? '';
}
/** The change marks at `level` in `scope`, their text in document order (`shown`). */
const marks = (scope: ParentNode, level: ChangeLevel) => Array.from(scope.querySelectorAll(`[data-change="${level}"]`), shown);
const lit = (scope: ParentNode) => scope.querySelector('[data-change]') !== null;
/** The variant and the timeline the lent test mark at `selector` in `scope` received. */
const variantOf = (scope: ParentNode, selector: string) => scope.querySelector(selector)!.getAttribute('data-variant');
const timelineOf = (scope: ParentNode, selector: string) => scope.querySelector(selector)!.getAttribute('data-timeline');
/** Whether a mark in `scope` received the removals timeline (a word on it). */
const onRemovals = (scope: ParentNode) => scope.querySelector('[data-timeline="removals"]') !== null;
const advance = (ms: number) => act(() => {
  vi.advanceTimersByTime(ms);
});

beforeEach(() => {
  parses = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTextChanges: the key', () => {
  it('the first render lights nothing', () => {
    const { container, last } = doc({ body: 'a hívei b', k: 's' });
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
  });

  it('same key, new text: what changed lit, on the removals timeline for its duration, then nothing; a render after lights nothing again', () => {
    const { container, rerender, last } = doc({ body: 'a hivei b', k: 's' });
    rerender({ body: 'a hívei b', k: 's' });
    expect(marks(container, 'word')).toEqual(['hívei']);
    expect(marks(container, 'letters')).toEqual(['í']);
    expect(marks(container, 'removed')).toEqual(['i']);
    expect(timelineOf(container, '[data-change="word"]')).toBe('removals');
    expect(last().active).toBe(true);

    advance(2299);
    expect(marks(container, 'word')).toEqual(['hívei']);
    advance(1);
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
    expect(container.textContent).toBe('a hívei b');

    // A render for another reason (a search typed).
    rerender({ body: 'a hívei b', k: 's', skip: () => false });
    expect(lit(container)).toBe(false);
  });

  it('without removals: the plain timeline, its letters strong, for its duration', () => {
    const { container, rerender } = doc({ body: 'a b', k: 's' });
    rerender({ body: 'a új b', k: 's' });
    expect(marks(container, 'letters')).toEqual(['új ']);
    expect(variantOf(container, '[data-change="letters"]')).toBe('change-strong');
    expect(onRemovals(container)).toBe(false);
    advance(1549);
    expect(marks(container, 'letters')).toEqual(['új ']);
    advance(1);
    expect(lit(container)).toBe(false);
  });

  it('a new key: plainly; within a switch, its marks dropped in that render; the next same-key change compared with its text', () => {
    const { container, rerender, last } = doc({ body: 'a hivei b', k: 's' });
    rerender({ body: 'a hívei b', k: 't' });
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);

    rerender({ body: 'a hivei b', k: 't' });
    expect(marks(container, 'word')).toEqual(['hivei']);
    advance(1000);
    rerender({ body: 'x hívei y', k: 'u' });
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
    advance(4000);
    expect(lit(container)).toBe(false);

    rerender({ body: 'x hivei y', k: 'u' });
    expect(marks(container, 'word')).toEqual(['hivei']);
    expect(marks(container, 'removed')).toEqual(['í']);
    advance(2299);
    expect(marks(container, 'word')).toEqual(['hivei']);
  });

  it('the same text under the same key: nothing lit, no identity changed', () => {
    const { container, rerender, last } = doc({ body: 'a hivei b', k: 's' });
    const before = last();
    rerender({ body: 'a hivei b', k: 's' });
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
    expect(last().rehypePlugin).toBe(before.rehypePlugin);
    expect(last().components).toBe(before.components);
  });

  it('animate: false swaps plainly, under the same key too, and replaces the reading; within a switch, it ends it', () => {
    const { container, rerender, last } = doc({ body: 'a hivei b c', k: 's' });
    rerender({ body: 'a hívei b c', k: 's', animate: false });
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
    rerender({ body: 'a hívei b d', k: 's' });
    expect(marks(container, 'word')).toEqual(['d']);
    expect(last().active).toBe(true);
    rerender({ body: 'a hívei b e', k: 's', animate: false });
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
  });
});

describe('useTextChanges: parts', () => {
  const first = { parts: true, heading: 'Szent Péter', body: 'a katholikus b', k: 's' };
  const second = { parts: true, heading: 'Szent Péter új', body: 'a katolikus b', k: 's' };

  it('two parts, one switch: one timeline (a removal in the body puts the heading on it too), one timer', () => {
    const { container, rerender } = doc(first);
    rerender(second);
    const heading = container.querySelector('h2')!;
    const body = container.querySelector('p')!;
    expect(marks(heading, 'letters')).toEqual([' új']);
    expect(variantOf(heading, '[data-change="letters"]')).toBe('change-added');
    expect(timelineOf(heading, '[data-change="word"]')).toBe('removals');
    expect(heading.querySelector('[data-change="removed"]')).toBeNull();
    expect(body.querySelector('[data-change="removed"]')?.textContent).toBe('h');

    advance(2299);
    expect(lit(heading)).toBe(true);
    expect(lit(body)).toBe(true);
    advance(1);
    expect(lit(container)).toBe(false);
  });

  it('a second switch gives both parts new mark elements', () => {
    const { container, rerender } = doc(first);
    rerender(second);
    const words = () => [container.querySelector('h2 [data-change="word"]'), container.querySelector('p [data-change="word"]')];
    const [heading, body] = words();
    expect(heading).not.toBeNull();
    expect(body).not.toBeNull();
    advance(2000);
    rerender(first);
    const [nextHeading, nextBody] = words();
    expect(nextHeading).not.toBeNull();
    expect(nextHeading).not.toBe(heading);
    expect(nextBody).not.toBeNull();
    expect(nextBody).not.toBe(body);
  });

  it('a part new in this version is all new; one absent from the text before is never compared with an older reading', () => {
    const added = doc({ parts: true, body: 'a b', k: 's' });
    added.rerender({ parts: true, heading: 'Új cím', body: 'a b', k: 's' });
    expect(marks(added.container.querySelector('h2')!, 'letters')).toEqual(['Új ', 'cím']);
    expect(lit(added.container.querySelector('p')!)).toBe(false);
    added.unmount();

    // Within the switch that took it away, and after it.
    for (const wait of [1000, 5000]) {
      const { container, rerender, unmount } = doc({ parts: true, heading: 'Szent Péter', body: 'a b', k: 's' });
      rerender({ parts: true, body: 'a b', k: 's' });
      expect(container.querySelector('h2')).toBeNull();
      advance(wait);
      rerender({ parts: true, heading: 'Szent Pál', body: 'a b', k: 's' });
      const heading = container.querySelector('h2')!;
      expect(marks(heading, 'letters')).toEqual(['Szent ', 'Pál']);
      expect(heading.querySelector('[data-change="removed"]')).toBeNull();
      unmount();
    }
  });
});

describe('useTextChanges: identities', () => {
  it('kept through re-renders with new inline skip, near functions and near objects; new as a switch starts and as it ends, not as its timeline is decided; components never', () => {
    const props = { parts: true, heading: 'Cím', body: 'a hivei b', k: 's' };
    const { container, rerender, results, last } = doc(props);
    const idle = last();
    const heading = idle.part('heading');
    expect(idle.part('heading')).toBe(heading);
    const kept = (expected: TextChanges, part: TextChangesPart) => {
      expect(last().rehypePlugin).toBe(expected.rehypePlugin);
      expect(last().part('heading')).toBe(part);
      expect(last().components).toBe(idle.components);
    };
    for (const extra of [{ skip: () => false }, { near: () => true }, { near: { container: pane, blocks: 3 } }]) {
      rerender({ ...props, ...extra });
      kept(idle, heading);
    }

    const before = results.length;
    rerender({ ...props, body: 'a hívei b' });
    const started = last();
    expect(started.rehypePlugin).not.toBe(idle.rehypePlugin);
    expect(started.part('heading')).not.toBe(heading);
    expect(started.part('heading').components).toBe(idle.components);
    expect(started.components).toBe(idle.components);
    // The timeline decided (the removals one) in the same commit, by the marks alone: every
    // render since the switch's start gave its objects.
    expect(timelineOf(container, 'p [data-change="word"]')).toBe('removals');
    for (const result of results.slice(before)) expect(result.rehypePlugin).toBe(started.rehypePlugin);
    const startedHeading = started.part('heading');
    for (const extra of [{ skip: () => false }, { near: () => true }, { near: { container: pane, blocks: 3 } }]) {
      rerender({ ...props, body: 'a hívei b', ...extra });
      kept(started, startedHeading);
    }

    advance(5000);
    expect(lit(container)).toBe(false);
    expect(last().rehypePlugin).not.toBe(started.rehypePlugin);
    expect(last().part('heading')).not.toBe(startedHeading);
    expect(last().components).toBe(idle.components);
  });

  it('memo\'d trees: one parse as a switch starts and one as it ends, none as its timeline is decided or for a render with new inline options', () => {
    const { container, rerender } = doc({ body: 'a hivei b', k: 's', memo: true });
    expect(parses).toBe(1);
    rerender({ body: 'a hivei b', k: 's', memo: true, skip: () => false, near: () => true });
    expect(parses).toBe(1);

    rerender({ body: 'a hívei b', k: 's', memo: true });
    expect(parses).toBe(2);
    expect(timelineOf(container, '[data-change="word"]')).toBe('removals');
    rerender({ body: 'a hívei b', k: 's', memo: true, skip: () => false, near: { container: pane, blocks: 3 } });
    expect(parses).toBe(2);

    advance(5000);
    expect(lit(container)).toBe(false);
    expect(parses).toBe(3);
  });

  it("memo'd trees: a part unchanged through a plain swap keeps its reading, so the next switch does not light it whole", () => {
    for (const plainly of [{ k: 't' }, { k: 's', animate: false }]) {
      const props = { parts: true, memo: true, heading: 'Cím', k: 's' };
      const { container, rerender, unmount } = doc({ ...props, body: 'a b' });
      rerender({ ...props, ...plainly, body: 'x y' });
      expect(lit(container)).toBe(false);
      rerender({ ...props, k: plainly.k, body: 'x új y' });
      expect(marks(container, 'letters')).toEqual(['új ']);
      expect(lit(container.querySelector('h2')!)).toBe(false);
      unmount();
    }
  });
});

describe('useTextChanges: the near set', () => {
  const OLD = 'Egy hivei.\n\nKettő hivei.\n\nHárom hivei.\n\nNégy hivei.\n\nÖt hivei.';
  const NEW = OLD.replace(/hivei/g, 'hívei');
  /** The numbered blocks holding a change mark. */
  const marked = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-vultus-block]'))
    .filter((block) => lit(block))
    .map((block) => Number(block.getAttribute('data-vultus-block')));
  let restore: () => void;
  beforeEach(() => {
    restore = installFakeIntersectionObserver();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restore();
  });

  it('frozen per switch: the innermost blocks crossing the container as it starts, widened by blocks, held through a re-parse', () => {
    const near = { container: pane, blocks: 1, rootMargin: '-40px 0px 0px 0px' };
    const { container, rerender } = doc({ body: OLD, k: 's', near });
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.options?.root).toBe(pane.current);
    expect(observer.options?.rootMargin).toBe('-40px 0px 0px 0px');
    observer.show([container.querySelectorAll('p')[2]!]);

    rerender({ body: NEW, k: 's', near: { ...near } });
    expect(marked(container)).toEqual([2, 3, 4]);
    // Nothing crossing now, and a re-parse: the set taken as the switch started.
    observer.show([]);
    rerender({ body: NEW, k: 's', near: { ...near } });
    expect(marked(container)).toEqual([2, 3, 4]);
  });

  it('a function: as it is', () => {
    const { container, rerender } = doc({ body: OLD, k: 's', near: (n) => n === 1 });
    rerender({ body: NEW, k: 's', near: (n) => n === 1 });
    expect(marked(container)).toEqual([1]);
  });

  it('nothing reported yet (the first switch right after mount): all of it', () => {
    const near = { container: pane, blocks: 1 };
    const { container, rerender } = doc({ body: OLD, k: 's', near });
    rerender({ body: NEW, k: 's', near });
    expect(marked(container)).toEqual([1, 2, 3, 4, 5]);
  });

  it('without an IntersectionObserver: all of it, nothing thrown', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const near = { container: pane, blocks: 1 };
    const { container, rerender } = doc({ body: OLD, k: 's', near });
    rerender({ body: NEW, k: 's', near });
    expect(marked(container)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('useTextChanges: skip and blockAttribute, through the hook', () => {
  it('skip, a new inline function each render: what it names is neither read nor marked', () => {
    const skip = (element: HastElement) => element.tagName === 'code';
    const { container, rerender } = doc({ body: 'a `x` hivei', k: 's', skip });
    rerender({ body: 'a `y` hívei', k: 's', skip: (element) => skip(element) });
    expect(marks(container, 'word')).toEqual(['hívei']);
    expect(container.querySelector('code [data-change]')).toBeNull();
  });

  it("blockAttribute: the observer and the plugin use the app's numbering, and add none of their own", () => {
    const restore = installFakeIntersectionObserver();
    try {
      const OLD = 'Egy hivei.\n\nKettő hivei.\n\nHárom hivei.';
      const props = { body: OLD, k: 's', blockAttribute: 'data-block' as const, near: { container: pane, blocks: 0 }, before: [numberParagraphs] };
      const { container, rerender } = doc(props);
      const observer = FakeIntersectionObserver.instances[0]!;
      expect(observer.targets.size).toBe(3);
      observer.show([container.querySelectorAll('p')[1]!]);

      rerender({ ...props, body: OLD.replace(/hivei/g, 'hívei') });
      expect(Array.from(container.querySelectorAll('p'), (p) => lit(p))).toEqual([false, true, false]);
      expect(container.querySelector('[data-vultus-block]')).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('useTextChanges: the timer', () => {
  it('a second switch within one compares the text shown with the next, in marks of its own, lit for its duration from then', () => {
    const { container, rerender } = doc({ body: 'a hivei b', k: 's' });
    rerender({ body: 'a hívei b', k: 's' });
    const word = container.querySelector('[data-change="word"]');
    const letters = container.querySelector('[data-change="letters"]');
    // Within the first (2.3 s).
    advance(1500);

    rerender({ body: 'a hivei b', k: 's' });
    expect(marks(container, 'word')).toEqual(['hivei']);
    expect(marks(container, 'removed')).toEqual(['í']);
    expect(container.querySelector('[data-change="word"]')).not.toBe(word);
    expect(container.querySelector('[data-change="letters"]')).not.toBe(letters);
    // A render within it keeps its marks.
    const second = container.querySelector('[data-change="word"]');
    rerender({ body: 'a hivei b', k: 's', skip: () => false });
    expect(container.querySelector('[data-change="word"]')).toBe(second);
    advance(2299);
    expect(marks(container, 'word')).toEqual(['hivei']);
    advance(1);
    expect(lit(container)).toBe(false);
  });

  it('each switch decides its own timeline: within one on removals, one that only puts in goes plain, lit for its duration from then', () => {
    const { container, rerender } = doc({ body: 'a katholikus b', k: 's' });
    rerender({ body: 'a katolikus b', k: 's' });
    expect(onRemovals(container)).toBe(true);
    advance(1500);

    rerender({ body: 'a katolikus új b', k: 's' });
    expect(marks(container, 'letters')).toEqual(['új ']);
    expect(variantOf(container, '[data-change="letters"]')).toBe('change-strong');
    expect(onRemovals(container)).toBe(false);
    advance(1549);
    expect(marks(container, 'letters')).toEqual(['új ']);
    advance(1);
    expect(lit(container)).toBe(false);
  });

  it("the timeline counts only this switch's reports: a part gone since a removal holds the next switch on none", () => {
    const { container, rerender } = doc({ parts: true, heading: 'Szent Péter', body: 'a b', k: 's' });
    rerender({ parts: true, heading: 'Szent Pál', body: 'a b', k: 's' });
    expect(container.querySelector('h2 [data-change="removed"]')).not.toBeNull();
    advance(1000);

    rerender({ parts: true, body: 'a új b', k: 's' });
    expect(container.querySelector('h2')).toBeNull();
    expect(marks(container, 'letters')).toEqual(['új ']);
    expect(variantOf(container, '[data-change="letters"]')).toBe('change-strong');
    advance(1549);
    expect(lit(container)).toBe(true);
    advance(1);
    expect(lit(container)).toBe(false);
  });

  it("the timer is the lent mark's durations(element, speed): no element without near, near.container's with it", () => {
    const ends = (lastLit: number) => {
      advance(lastLit);
      expect(lit(document.body)).toBe(true);
      advance(1);
      expect(lit(document.body)).toBe(false);
    };
    const asked: [Element | undefined, ChangeSpeed][] = [];
    const Mark = timedMark((element, speed) => {
      asked.push([element, speed]);
      return { plain: 2500, removals: 3250 };
    });
    const plain = doc({ body: 'a b', k: 's' }, undefined, Mark);
    plain.rerender({ body: 'a új b', k: 's' });
    ends(2499);
    plain.unmount();
    const removals = doc({ body: 'a katholikus b', k: 's', speed: 'fast' }, undefined, Mark);
    removals.rerender({ body: 'a katolikus b', k: 's', speed: 'fast' });
    ends(3249);
    removals.unmount();
    expect(asked).toEqual([[undefined, 'normal'], [undefined, 'fast']]);

    asked.splice(0);
    const near = { container: pane, blocks: 3 };
    const { rerender } = doc({ body: 'a b', k: 's', near }, undefined, Mark);
    rerender({ body: 'a új b', k: 's', near });
    ends(2499);
    expect(asked).toEqual([[pane.current, 'normal']]);
    expect(asked[0]![0]).toBeInstanceOf(HTMLDivElement);
  });

  it('a lent mark without durations, and none lent: the fallback timings, 2.3 s with removals and 1.55 s without, at every speed', () => {
    for (const mark of [TestMark, null]) {
      for (const speed of ['slow', 'normal', 'fast', undefined] as const) {
        for (const [from, to, ends] of [['a katholikus b', 'a katolikus b', 2300], ['a b', 'a új b', 1550]] as const) {
          const { container, rerender, unmount } = doc({ body: from, k: 's', speed }, undefined, mark);
          rerender({ body: to, k: 's', speed });
          advance(ends - 1);
          expect(lit(container), `${String(speed)} ${ends}`).toBe(true);
          advance(1);
          expect(lit(container), `${String(speed)} ${ends}`).toBe(false);
          unmount();
        }
      }
    }
  });

  it('unmount within a switch: nothing fires after, the observer disconnected', () => {
    const restore = installFakeIntersectionObserver();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const near = { container: pane, blocks: 1 };
      const { rerender, unmount } = doc({ body: 'a hivei b', k: 's', near });
      rerender({ body: 'a hívei b', k: 's', near });
      advance(1000);
      unmount();
      expect(FakeIntersectionObserver.instances).toHaveLength(1);
      expect(FakeIntersectionObserver.instances[0]!.disconnected).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      advance(10000);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      restore();
    }
  });

  it('under StrictMode: the same marks, one timer, lit for the same time', () => {
    const strict = (element: ReactElement) => <StrictMode>{element}</StrictMode>;
    const { container, rerender, last } = doc({ body: 'a hivei b', k: 's' }, strict);
    rerender({ body: 'a hívei b', k: 's' });
    expect(marks(container, 'word')).toEqual(['hívei']);
    expect(marks(container, 'letters')).toEqual(['í']);
    expect(marks(container, 'removed')).toEqual(['i']);
    expect(timelineOf(container, '[data-change="word"]')).toBe('removals');
    expect(last().active).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    const word = container.querySelector('[data-change="word"]');
    rerender({ body: 'a hívei b', k: 's', skip: () => false });
    expect(container.querySelector('[data-change="word"]')).toBe(word);

    advance(2299);
    expect(marks(container, 'word')).toEqual(['hívei']);
    advance(1);
    expect(lit(container)).toBe(false);
    expect(last().active).toBe(false);
  });
});

describe('useTextChanges: the speed', () => {
  /** The speed each change mark in `scope` received (none: `none`). */
  const speedsOf = (scope: ParentNode) => Array.from(scope.querySelectorAll('[data-change]'), (mark) => mark.getAttribute('data-speed') ?? 'none');
  /** Whether every change mark in `scope` runs at `speed` (and there is one). */
  const allAt = (scope: ParentNode, speed: string) => {
    const speeds = speedsOf(scope);
    expect(speeds.length).toBeGreaterThan(0);
    expect(new Set(speeds), speed).toEqual(new Set([speed]));
  };
  /** `doc` with the speeds' timings lent: a style library's, through its mark's `durations`. */
  const speedDoc = (props: DocProps) => doc(props, undefined, SpeedMark);

  it("every mark of a switch receives the switch's speed: slow, normal or fast; normal by default", () => {
    for (const speed of ['slow', 'normal', 'fast', undefined] as const) {
      // With removals (a word, a replacement, its removed and added letters), and plain (a word and its letters).
      for (const [from, to, levels] of [['a hivei b', 'a hívei b', ['letters', 'removed', 'replaced', 'word']], ['a b', 'a új b', ['letters', 'word']]] as const) {
        const { container, rerender, unmount } = speedDoc({ body: from, k: 's', speed });
        rerender({ body: to, k: 's', speed });
        expect(Array.from(container.querySelectorAll('[data-change]'), (mark) => mark.getAttribute('data-change')).sort()).toEqual(levels);
        allAt(container, speed ?? 'normal');
        unmount();
      }
    }
  });

  it("the timer at the switch's speed, the lent mark's durations at it: with removals slow 3.5 s, normal 2.3 s, fast 1.7 s; plain 2.25 s, 1.55 s, 1.2 s", () => {
    for (const [speed, removals, plain] of [['slow', 3500, 2250], ['normal', 2300, 1550], ['fast', 1700, 1200]] as const) {
      for (const [from, to, ends] of [['a katholikus b', 'a katolikus b', removals], ['a b', 'a új b', plain]] as const) {
        const { container, rerender, unmount } = speedDoc({ body: from, k: 's', speed });
        rerender({ body: to, k: 's', speed });
        advance(ends - 1);
        expect(lit(container), `${speed} ${ends}`).toBe(true);
        advance(1);
        expect(lit(container), `${speed} ${ends}`).toBe(false);
        unmount();
      }
    }
  });

  it('frozen per switch: a new speed within one changes neither its marks nor its timer, nor parses; the next switch takes it', () => {
    const { container, rerender, last } = speedDoc({ body: 'a katholikus b', k: 's', speed: 'fast', memo: true });
    rerender({ body: 'a katolikus b', k: 's', speed: 'fast', memo: true });
    allAt(container, 'fast');
    const started = last();
    const parsed = parses;
    advance(1000);
    rerender({ body: 'a katolikus b', k: 's', speed: 'slow', memo: true });
    allAt(container, 'fast');
    expect(last().rehypePlugin).toBe(started.rehypePlugin);
    expect(parses).toBe(parsed);
    // Gone at fast's 1.7 s, not slow's 3.5 s.
    advance(699);
    expect(lit(container)).toBe(true);
    advance(1);
    expect(lit(container)).toBe(false);

    // The next switch (plain: it only puts in) at the speed given since: slow's 2.25 s.
    rerender({ body: 'a katolikus új b', k: 's', speed: 'slow', memo: true });
    allAt(container, 'slow');
    advance(2249);
    expect(lit(container)).toBe(true);
    advance(1);
    expect(lit(container)).toBe(false);
  });

  it('a new speed while idle: no identity changed, no parse', () => {
    const { rerender, last } = speedDoc({ parts: true, heading: 'Cím', body: 'a hivei b', k: 's', memo: true });
    const idle = last();
    const heading = idle.part('heading');
    const parsed = parses;
    for (const speed of ['fast', 'slow', 'normal', undefined] as const) {
      rerender({ parts: true, heading: 'Cím', body: 'a hivei b', k: 's', memo: true, speed });
      expect(last().rehypePlugin, speed).toBe(idle.rehypePlugin);
      expect(last().part('heading'), speed).toBe(heading);
      expect(last().components, speed).toBe(idle.components);
    }
    expect(parses).toBe(parsed);
  });
});
