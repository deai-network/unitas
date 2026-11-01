import { act, render } from '@testing-library/react';
import { memo, useLayoutEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeMark, changeComponents, changeStore, type ChangeTimeline } from '../changes/ChangeMark.js';
import type { ChangeSpeed } from '../changes/changeDurations.js';
import type { ChangeLevel } from '../changes/changesIn.js';
import { inertProps } from '../changes/FallbackMark.js';
import { lent, received } from './helpers/changeMarks.js';

/** `ChangeMark` at `level` on `timeline`, around a `b`, the test mark lent: the first element drawn,
 *  its tag, change level, and the variant and timeline the lent mark received. */
function drawn(level: ChangeLevel, timeline: ChangeTimeline | undefined) {
  const { container, unmount } = render(lent(<ChangeMark level={level} number={1} timeline={timeline}><b>x</b></ChangeMark>));
  const first = container.firstElementChild!;
  const found = {
    tag: first.tagName,
    change: first.getAttribute('data-change'),
    variant: first.getAttribute('data-variant'),
    timeline: first.getAttribute('data-timeline'),
  };
  unmount();
  return found;
}

describe('ChangeMark', () => {
  it('draws each level with the lent mark, carrying data-change', () => {
    for (const timeline of ['plain', undefined, 'removals'] as const) {
      const removals = timeline === 'removals';
      for (const level of ['word', 'letters', 'removed'] as const) {
        const mark = drawn(level, timeline);
        expect(mark.tag).toBe('MARK');
        expect(mark.change).toBe(level);
      }
      const word = drawn('word', timeline);
      expect(word.variant).toBe('change');
      expect(word.timeline === 'removals').toBe(removals);
      const letters = drawn('letters', timeline).variant;
      expect(letters === 'change-strong').toBe(!removals);
      expect(letters === 'change-added').toBe(removals);
      expect(drawn('removed', timeline).variant).toBe('change-removed');
      // A replacement: its children alone until the switch is on removals.
      const replaced = drawn('replaced', timeline);
      if (removals) {
        expect(replaced).toEqual({ tag: 'MARK', change: 'replaced', variant: 'change-replaced', timeline: null });
      } else {
        expect(replaced.tag).toBe('B');
      }
    }
  });

  it("gives the lent mark exactly harma-style's Highlight props: the variant, the word's timeline, the speed, data-change and the children", () => {
    const props = (level: ChangeLevel, timeline: ChangeTimeline | undefined, speed: ChangeSpeed | undefined) => {
      received.splice(0);
      const { unmount } = render(lent(<ChangeMark level={level} number={1} timeline={timeline} speed={speed}>x</ChangeMark>));
      unmount();
      return received.splice(0);
    };
    for (const speed of ['slow', 'normal', 'fast', undefined] as const) {
      const given = (variant: string, level: ChangeLevel, timeline?: 'removals') => [
        { variant, timeline, speed, 'data-change': level, children: 'x' },
      ];
      for (const timeline of ['plain', undefined] as const) {
        expect(props('word', timeline, speed)).toStrictEqual(given('change', 'word'));
        expect(props('letters', timeline, speed)).toStrictEqual(given('change-strong', 'letters'));
        expect(props('removed', timeline, speed)).toStrictEqual(given('change-removed', 'removed'));
        expect(props('replaced', timeline, speed)).toStrictEqual([]);
      }
      expect(props('word', 'removals', speed)).toStrictEqual(given('change', 'word', 'removals'));
      expect(props('letters', 'removals', speed)).toStrictEqual(given('change-added', 'letters'));
      expect(props('removed', 'removals', speed)).toStrictEqual(given('change-removed', 'removed'));
      expect(props('replaced', 'removals', speed)).toStrictEqual(given('change-replaced', 'replaced'));
    }
  });

  it('is keyed by the number: the same number keeps the mark element, another replaces it; lent or the fallback', () => {
    for (const lend of [true, false]) {
      const mark = (number: number) => {
        const element = <ChangeMark level="word" number={number} timeline="plain">x</ChangeMark>;
        return lend ? lent(element) : element;
      };
      const { container, rerender, unmount } = render(mark(1));
      const first = container.firstElementChild;
      rerender(mark(1));
      expect(container.firstElementChild).toBe(first);
      rerender(mark(2));
      expect(container.firstElementChild).not.toBe(first);
      expect(container.firstElementChild?.getAttribute('data-change')).toBe('word');
      unmount();
    }
  });
});

describe('changeComponents', () => {
  it('gives one frozen object per source', () => {
    const store = changeStore();
    const components = changeComponents(store);
    expect(changeComponents(store)).toBe(components);
    expect(Object.isFrozen(components)).toBe(true);
    expect(changeComponents(changeStore())).not.toBe(components);
  });

  it('renders an ins that is no change mark as an ins, with its props', () => {
    const { ins: Ins } = changeComponents(changeStore());
    for (const change of [undefined, 'other']) {
      const { container, unmount } = render(lent(<Ins node={{ type: 'element' }} className="own" data-x="y" data-change={change}>t</Ins>));
      const ins = container.firstElementChild!;
      expect(ins.tagName).toBe('INS');
      expect(ins.className).toBe('own');
      expect(ins.getAttribute('data-x')).toBe('y');
      expect(ins.hasAttribute('node')).toBe(false);
      expect(ins.textContent).toBe('t');
      expect(container.querySelector('mark')).toBeNull();
      unmount();
    }
  });

  it('subscribes in the layout phase: a timeline set in a parent layout effect reaches the marks before the paint', () => {
    const store = changeStore();
    const subscribe = vi.spyOn(store, 'subscribe');
    const { ins: Ins } = changeComponents(store);
    let subscribed = false;
    function Parent() {
      useLayoutEffect(() => {
        subscribed = subscribe.mock.calls.length > 0;
        store.set({ number: 0, timeline: 'removals' }, true);
      }, []);
      return <p><Ins data-change="word">x</Ins></p>;
    }
    const { container } = render(lent(<Parent />));
    expect(subscribed).toBe(true);
    expect(container.querySelector('mark')!.getAttribute('data-timeline')).toBe('removals');
  });

  it('draws a replacement in the notification that puts the switch on removals, the word mark kept', () => {
    const store = changeStore({ number: 1, timeline: undefined });
    const { ins: Ins } = changeComponents(store);
    const { container } = render(lent(
      <p>
        <Ins data-change="word">
          <Ins data-change="replaced"><Ins data-change="removed">i</Ins><Ins data-change="letters">í</Ins></Ins>
        </Ins>
      </p>,
    ));
    const word = container.querySelector('mark[data-change="word"]');
    expect(word).not.toBeNull();
    expect(container.querySelector('[data-change="replaced"]')).toBeNull();
    act(() => store.set({ number: 1, timeline: 'removals' }, true));
    const replaced = container.querySelector('mark[data-change="replaced"]')!;
    expect(Array.from(replaced.childNodes, (child) => [(child as Element).getAttribute('data-change'), child.textContent]))
      .toEqual([['removed', 'i'], ['letters', 'í']]);
    expect(container.querySelector('mark[data-change="word"]')).toBe(word);
  });

  it('a notification re-renders the marks, not their parents', () => {
    const store = changeStore({ number: 1, timeline: undefined });
    const { ins: Ins } = changeComponents(store);
    let renders = 0;
    const Child = memo(function Child() {
      return <p><Ins data-change="letters">x</Ins></p>;
    });
    function Parent() {
      renders++;
      return <Child />;
    }
    const { container } = render(lent(<Parent />));
    const counted = renders;
    expect(container.querySelector('mark')!.getAttribute('data-variant')).toBe('change-strong');
    act(() => store.set({ number: 1, timeline: 'removals' }, true));
    expect(container.querySelector('mark')!.getAttribute('data-variant')).toBe('change-added');
    expect(renders).toBe(counted);
  });
});

describe('ChangeMark without a lent mark: the fallback', () => {
  /** `ChangeMark` at `level` on `timeline`, no mark lent: the first element drawn. */
  const fallback = (level: ChangeLevel, timeline: ChangeTimeline | undefined = 'removals', speed?: ChangeSpeed) =>
    render(<ChangeMark level={level} number={1} timeline={timeline} speed={speed}>x</ChangeMark>).container.firstElementChild as HTMLElement;
  /** A CSS colour's channels (`rgba(r, g, b, a)`), alpha 1 when none is written. */
  const channels = (colour: string) => {
    const found = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(colour);
    expect(found, colour).not.toBeNull();
    const [, r, g, b, a = '1'] = found!;
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  };

  it('static marks with inline styles: a word, its letters and new letters a translucent green, removed letters a translucent red struck through', () => {
    const word = fallback('word');
    const strong = fallback('letters', 'plain');
    const added = fallback('letters', 'removals');
    const removed = fallback('removed');
    for (const [mark, level] of [[word, 'word'], [strong, 'letters'], [added, 'letters'], [removed, 'removed']] as const) {
      expect(mark.tagName).toBe('MARK');
      expect(mark.getAttribute('data-change')).toBe(level);
      // Its text's colour inherited, never a mark's own (the browser's MarkText).
      expect(mark.style.color).toBe('inherit');
      expect(mark.hasAttribute('class')).toBe(false);
    }
    const green = channels(word.style.backgroundColor);
    expect(green.g).toBeGreaterThan(green.r);
    expect(green.a).toBeGreaterThan(0);
    expect(green.a).toBeLessThan(1);
    expect(strong.style.backgroundColor).toBe(word.style.backgroundColor);
    expect(added.style.backgroundColor).toBe(word.style.backgroundColor);
    for (const mark of [word, strong, added]) expect(mark.style.textDecoration).toBe('');
    const red = channels(removed.style.backgroundColor);
    expect(red.r).toBeGreaterThan(red.g);
    expect(red.a).toBeGreaterThan(0);
    expect(red.a).toBeLessThan(1);
    expect(removed.style.textDecoration).toBe('line-through');
  });

  it('removed letters hidden from assistive technology, the tab order and a selection: aria-hidden, inert, user-select none', () => {
    for (const timeline of ['plain', undefined, 'removals'] as const) {
      const removed = fallback('removed', timeline);
      expect(removed.getAttribute('aria-hidden')).toBe('true');
      expect(removed.hasAttribute('inert')).toBe(true);
      // Prefixed too, for Safari.
      expect(removed.getAttribute('style')).toContain('-webkit-user-select: none');
      expect(removed.getAttribute('style')).toMatch(/(^|[^-])user-select: none/);
    }
    for (const mark of [fallback('word'), fallback('letters', 'plain'), fallback('letters')]) {
      expect(mark.hasAttribute('aria-hidden')).toBe(false);
      expect(mark.hasAttribute('inert')).toBe(false);
      expect(mark.getAttribute('style')).not.toContain('user-select');
    }
  });

  it('a replacement drawn as its new letters: its old letters, hidden as removed letters are, not displayed', () => {
    const store = changeStore({ number: 1, timeline: 'removals' });
    const { ins: Ins } = changeComponents(store);
    const { container } = render(
      <p>
        <Ins data-change="word">
          h<Ins data-change="replaced"><Ins data-change="removed">i</Ins><Ins data-change="letters">í</Ins></Ins>vei
          <Ins data-change="removed">x</Ins>
        </Ins>
      </p>,
    );
    const replaced = container.querySelector<HTMLElement>('mark[data-change="replaced"]')!;
    expect(replaced.style.backgroundColor).toBe('transparent');
    expect(replaced.style.color).toBe('inherit');
    const [old, letters] = Array.from(replaced.children) as HTMLElement[];
    expect([old!.getAttribute('data-change'), old!.textContent]).toEqual(['removed', 'i']);
    expect(old!.style.display).toBe('none');
    expect(old!.getAttribute('aria-hidden')).toBe('true');
    expect(old!.hasAttribute('inert')).toBe(true);
    expect([letters!.getAttribute('data-change'), letters!.textContent]).toEqual(['letters', 'í']);
    expect(letters!.style.display).toBe('');
    // A removal outside a replacement shows, struck through.
    const lone = container.querySelector<HTMLElement>('p > mark > mark[data-change="removed"]')!;
    expect(lone.textContent).toBe('x');
    expect(lone.style.display).toBe('');
  });

  it('the timeline and the speed reach no attribute: no animation', () => {
    for (const speed of ['slow', 'fast'] as const) {
      const word = fallback('word', 'removals', speed);
      expect(Array.from(word.attributes, (attribute) => attribute.name).sort()).toEqual(['data-change', 'style']);
    }
  });
});

describe('inertProps', () => {
  it('gives `inert` as the running React takes it: a boolean from 19, the empty string in 18', () => {
    expect(inertProps('19.2.4')).toEqual({ inert: true });
    expect(inertProps('20.0.0')).toEqual({ inert: true });
    expect(inertProps('18.3.1')).toEqual({ inert: '' });
  });
});
