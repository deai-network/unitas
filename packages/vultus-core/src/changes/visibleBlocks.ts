import { useEffect, useState } from 'react';

/** Block numbers from `first` to `last`, both included. */
export interface BlockRange {
  first: number;
  last: number;
}

/** Where the blocks are: an element, a ref object holding one, or none yet. */
export type ContainerOption = HTMLElement | null | { readonly current: HTMLElement | null };

/** `element`'s number in `attribute`; none for a missing or non-numeric one. */
function numberOf(element: Element, attribute: string): number | undefined {
  const value = element.getAttribute(attribute);
  const number = value === null || value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * The range of the innermost of `elements` (numbered blocks crossing the band, in any order): each
 * one containing another of them is dropped, so a quote or an outer list item spanning the band
 * pulls nothing back (a quote of 200 paragraphs, 150 to 153 in the band, gives 150 to 153, not 1
 * to 153); the first and last of the rest's numbers. A block holding blocks only outside the band
 * counts: a tight list item whose first line is in it, its nested items below. None numbered (by
 * `attribute`), none. It works on a set of elements (those the observer reports crossing the band),
 * not on laid-out boxes.
 */
export function innermostRange(elements: Iterable<Element>, attribute: string): BlockRange | undefined {
  const blocks = Array.from(elements).filter((element) => numberOf(element, attribute) !== undefined);
  let range: BlockRange | undefined;
  for (const block of blocks) {
    if (blocks.some((other) => other !== block && block.contains(other))) continue;
    const number = numberOf(block, attribute)!;
    range = range ? { first: Math.min(range.first, number), last: Math.max(range.last, number) } : { first: number, last: number };
  }
  return range;
}

/** The visible blocks as `useVisibleBlocks` tracks them. */
export interface VisibleBlocks {
  /** The range of the innermost blocks crossing the container now (`innermostRange`); none without
   *  an IntersectionObserver or a container, before its first report, or with none crossing. */
  range(): BlockRange | undefined;
}

/** What one tracking sees: its container, the numbering's attribute, and the blocks reported
 *  intersecting. */
interface Seen {
  root: HTMLElement | null;
  attribute: string;
  visible: Set<Element>;
}

/**
 * The numbered blocks (`attribute`) crossing `container`, tracked with an IntersectionObserver
 * whose root is the container (`rootMargin`: a sticky bar over its top, say), for the near set a
 * switch takes (`useTextChanges`' `near`). Every numbered block inside the container is observed,
 * those rendered later too (a MutationObserver sees them come and go). Set up in a passive effect,
 * when an ancestor's ref is attached; again when the container (the ref object or the element), the
 * attribute or the margin change. One object for the hook's life: read `range()` when it is needed.
 * Without an IntersectionObserver (an old browser, jsdom) or a container, no range.
 *
 * The container is the scrolling element (the pane), the observer's root: blocks scrolled out of it
 * are clipped away. Given an element that does not scroll (the content inside the pane), every block
 * in it counts as crossing, and the near limit does nothing. A ref object is read when the effect
 * runs, so a container that appears or changes later is given as the element (from a callback ref,
 * kept in state).
 */
export function useVisibleBlocks(container: ContainerOption | undefined, attribute: string, rootMargin?: string): VisibleBlocks {
  const [{ seen, blocks }] = useState(() => {
    const seen: Seen = { root: null, attribute, visible: new Set() };
    const blocks: VisibleBlocks = {
      range() {
        const { root } = seen;
        if (!root) return undefined;
        return innermostRange(Array.from(seen.visible).filter((block) => block.isConnected && root.contains(block)), seen.attribute);
      },
    };
    return { seen, blocks };
  });
  useEffect(() => {
    const root = container && 'current' in container ? container.current : container ?? null;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const selector = `[${attribute}]`;
    const intersection = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) seen.visible.add(entry.target);
        else seen.visible.delete(entry.target);
      }
    }, { root, rootMargin });
    // The numbered blocks at or under a node.
    const blocksAt = (node: Node): Element[] => {
      if (node.nodeType !== Node.ELEMENT_NODE) return [];
      const element = node as Element;
      return [...(element.matches(selector) ? [element] : []), ...element.querySelectorAll(selector)];
    };
    for (const block of root.querySelectorAll(selector)) intersection.observe(block);
    // In order, so that a block moved (taken out, put back) stays observed.
    const mutation = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          for (const block of blocksAt(node)) {
            intersection.unobserve(block);
            seen.visible.delete(block);
          }
        }
        for (const node of record.addedNodes) for (const block of blocksAt(node)) intersection.observe(block);
      }
    });
    mutation.observe(root, { childList: true, subtree: true });
    seen.root = root;
    seen.attribute = attribute;
    return () => {
      intersection.disconnect();
      mutation.disconnect();
      seen.visible.clear();
      seen.root = null;
    };
  }, [container, attribute, rootMargin, seen]);
  return blocks;
}
