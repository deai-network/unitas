import { render } from '@testing-library/react';
import { StrictMode, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { innermostRange, useVisibleBlocks, type BlockRange, type VisibleBlocks } from '../changes/visibleBlocks.js';
import { FakeIntersectionObserver, installFakeIntersectionObserver } from './helpers/intersection.js';

// The visible blocks a switch's near set is taken from (`useTextChanges`' `near`): the numbered
// blocks an IntersectionObserver reports crossing the container, the innermost of them. Each case
// gives the set of blocks crossing the band, as the observer reports them.

const PARAGRAPHS = '<p data-block="1">1</p><p data-block="2">2</p><p data-block="3">3</p>';
/** A list item (1) holding its paragraph (2) and a nested item (3) with its paragraph (4); a paragraph (5) after. */
const NESTED = '<ul><li data-block="1"><p data-block="2">a</p><ul><li data-block="3"><p data-block="4">b</p></li></ul></li></ul>'
  + '<p data-block="5">c</p>';
/** A quote (1) of four paragraphs (2 to 5). */
const QUOTE = '<blockquote data-block="1"><p data-block="2">a</p><p data-block="3">b</p><p data-block="4">c</p>'
  + '<p data-block="5">d</p></blockquote>';
/** A tight list item (1), its text its own, holding a nested item (2). */
const TIGHT = '<ul><li data-block="1">a<ul><li data-block="2">b</li></ul></li></ul>';

/** The blocks of `html` numbered `numbers` (`data-block`), in that order. */
function blocks(html: string, numbers: number[]): Element[] {
  const root = document.createElement('div');
  root.innerHTML = html;
  return numbers.map((n) => root.querySelector(`[data-block="${n}"]`)!);
}

describe('innermostRange: the first and last numbers of the innermost blocks among those crossing the band', () => {
  it.each<[string, string, number[], BlockRange | undefined]>([
    ['none', PARAGRAPHS, [], undefined],
    ['one', PARAGRAPHS, [2], { first: 2, last: 2 }],
    ['a nested list item and its paragraph, inside an item crossing it too: from the paragraph, the innermost', NESTED, [1, 3, 4], { first: 4, last: 4 }],
    ['a quote spanning it: from its first paragraph crossing it, not the quote', QUOTE, [1, 3, 4], { first: 3, last: 4 }],
    ['a tight item whose first line crosses it, its nested item below: the item', TIGHT, [1], { first: 1, last: 1 }],
    ['running past the end: up to the last block', PARAGRAPHS, [2, 3], { first: 2, last: 3 }],
  ])('%s', (_, html, numbers, range) => {
    expect(innermostRange(blocks(html, numbers), 'data-block')).toEqual(range);
    // In any order: an observer's set has none.
    expect(innermostRange(blocks(html, numbers).reverse(), 'data-block')).toEqual(range);
  });

  it('no numbered blocks: none', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>no number</p>';
    expect(innermostRange(root.querySelectorAll('p'), 'data-block')).toBeUndefined();
  });

  it('a block whose number is no number is left out', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p data-block="x">x</p><p data-block="2">2</p>';
    expect(innermostRange(root.querySelectorAll('p'), 'data-block')).toEqual({ first: 2, last: 2 });
  });
});

/** A container of `count` paragraphs numbered from 1 (`data-vultus-block`), its visible blocks
 *  tracked (`onBlocks` gets them on each render); the container given as a ref object (`byRef`), or
 *  as the element (from a callback ref). */
function Probe({ count, byRef = false, rootMargin, onBlocks }: {
  count: number;
  byRef?: boolean;
  rootMargin?: string;
  onBlocks?: (blocks: VisibleBlocks) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const blocks = useVisibleBlocks(byRef ? ref : element, 'data-vultus-block', rootMargin);
  onBlocks?.(blocks);
  return (
    <div ref={byRef ? ref : setElement}>
      {Array.from({ length: count }, (_, i) => <p key={i} data-vultus-block={i + 1}>{i + 1}</p>)}
    </div>
  );
}

describe('useVisibleBlocks', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = installFakeIntersectionObserver();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    restore();
  });

  it('one observer, its root the container and its rootMargin the one given, observing every numbered block', () => {
    const { container } = render(<Probe count={5} rootMargin="-40px 0px 0px 0px" />);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.options?.root).toBe(container.firstElementChild);
    expect(observer.options?.rootMargin).toBe('-40px 0px 0px 0px');
    expect(new Set(observer.targets)).toEqual(new Set(container.querySelectorAll('p')));
  });

  it('the range of the innermost blocks reported intersecting, from one object; blocks rendered later observed, blocks gone left out', async () => {
    let tracked: VisibleBlocks | undefined;
    const onBlocks = (blocks: VisibleBlocks) => {
      tracked = blocks;
    };
    const { container, rerender } = render(<Probe count={5} onBlocks={onBlocks} />);
    const observer = FakeIntersectionObserver.instances[0]!;
    const paragraphs = Array.from(container.querySelectorAll('p'));
    const first = tracked!;
    // Nothing reported yet: no range.
    expect(first.range()).toBeUndefined();
    observer.show([paragraphs[1]!, paragraphs[2]!]);
    expect(first.range()).toEqual({ first: 2, last: 3 });

    rerender(<Probe count={6} onBlocks={onBlocks} />);
    expect(tracked).toBe(first);
    await Promise.resolve();
    const sixth = container.querySelectorAll('p')[5]!;
    expect(observer.targets.has(sixth)).toBe(true);
    observer.show([paragraphs[4]!, sixth]);
    expect(first.range()).toEqual({ first: 5, last: 6 });

    rerender(<Probe count={5} onBlocks={onBlocks} />);
    expect(first.range()).toEqual({ first: 5, last: 5 });
    await Promise.resolve();
    expect(observer.targets.has(sixth)).toBe(false);
  });

  it('set up again for another margin: the first observers disconnected, blocks rendered later observed by the new one alone', async () => {
    const { rerender } = render(<Probe count={5} rootMargin="0px" />);
    rerender(<Probe count={5} rootMargin="-40px 0px 0px 0px" />);
    rerender(<Probe count={6} rootMargin="-40px 0px 0px 0px" />);
    await Promise.resolve();
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    const [first, second] = FakeIntersectionObserver.instances;
    expect(first!.disconnected).toBe(true);
    // The first MutationObserver disconnected too: it observes nothing on the first observer.
    expect(first!.targets.size).toBe(0);
    expect(second!.targets.size).toBe(6);
  });

  it("under StrictMode: the mount's observer disconnected, the remount's observing every block", () => {
    render(<StrictMode><Probe count={5} byRef /></StrictMode>);
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    const [first, second] = FakeIntersectionObserver.instances;
    expect(first!.disconnected).toBe(true);
    expect(second!.disconnected).toBe(false);
    expect(second!.targets.size).toBe(5);
  });

  it('a block moved (taken out, put back) stays observed', async () => {
    const { container } = render(<Probe count={5} />);
    const observer = FakeIntersectionObserver.instances[0]!;
    const first = container.querySelector('p')!;
    // A removal record, then an addition.
    container.firstElementChild!.append(first);
    await Promise.resolve();
    expect(observer.targets.has(first)).toBe(true);
    expect(observer.targets.size).toBe(5);
  });

  it('a ref object as the container', () => {
    let tracked: VisibleBlocks | undefined;
    const { container } = render(<Probe count={5} byRef onBlocks={(blocks) => { tracked = blocks; }} />);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const observer = FakeIntersectionObserver.instances[0]!;
    expect(observer.options?.root).toBe(container.firstElementChild);
    expect(observer.targets.size).toBe(5);
    observer.show([container.querySelector('p')!]);
    expect(tracked!.range()).toEqual({ first: 1, last: 1 });
  });

  it('unmount disconnects', () => {
    let tracked: VisibleBlocks | undefined;
    const { container, unmount } = render(<Probe count={5} onBlocks={(blocks) => { tracked = blocks; }} />);
    const observer = FakeIntersectionObserver.instances[0]!;
    observer.show([container.querySelector('p')!]);
    unmount();
    expect(observer.disconnected).toBe(true);
    expect(tracked!.range()).toBeUndefined();
  });

  it('without an IntersectionObserver: no range, nothing thrown', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    let tracked: VisibleBlocks | undefined;
    render(<Probe count={5} onBlocks={(blocks) => { tracked = blocks; }} />);
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    expect(tracked!.range()).toBeUndefined();
  });
});
