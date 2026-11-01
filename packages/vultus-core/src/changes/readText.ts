import type { Element, Root, Text } from 'hast';
import { BLOCK_ELEMENTS } from './blocks.js';

/** What the reading leaves out besides `data-vultus-change-skip`: the app's (spec 2). */
export interface ReadTextOptions {
  /** Whether an element is left out of the reading, with all it holds. */
  skip?: (element: Element) => boolean;
}

/** A text node read; `start`: where its value begins in the source (the nodes' values in document
 *  order, one '\n' per feed). */
export interface TextPiece {
  node: Text;
  parent: Element | Root;
  start: number;
}

/** `offsets[i]`: the source offset of `text[i]` (a collapsed run's, its first); one more entry,
 *  the source offset after the last character. */
export interface TextPlaces {
  pieces: TextPiece[];
  offsets: number[];
}

/** A tree's text as `readText` reads it, and the map back to its text nodes. */
export interface Reading {
  text: string;
  places: TextPlaces;
}

/**
 * The reading of a hast tree (spec 2), which both sides of a diff use: its text nodes' values in
 * document order, prose white space collapsed to one space (soft line breaks too, so a source line
 * end inside "t. i." does not split it), and a line feed, a hard boundary for `changesIn`, exactly
 * where a line really ends: before and after every block element (`BLOCK_ELEMENTS`), at a `br`, and
 * at each line feed inside a `pre`. A run of white space becomes one '\n' where it holds a hard
 * feed, else one ' '; the text is trimmed. An element `isSkipped` names is left out with all it
 * holds, adding not even a feed. An element given as the tree reads as its children; a `pre`
 * given as the tree keeps its line feeds hard.
 *
 * `places` maps the text back: `pieces`, the text nodes read, each with its parent and where its
 * value begins in the source (the values joined in document order, one '\n' per feed); `offsets`,
 * each character's source offset, then the one after the last.
 */
export function readText(tree: Root | Element, options?: ReadTextOptions): Reading {
  const pieces: TextPiece[] = [];
  const chunks: string[] = [];
  // The source offsets of the hard feeds: those put in, and a `pre`'s line feeds.
  const hard = new Set<number>();
  let length = 0;
  const feed = () => {
    hard.add(length);
    chunks.push('\n');
    length += 1;
  };
  const visit = (parent: Root | Element, inPre: boolean) => {
    for (const child of parent.children) {
      if (child.type === 'text') {
        pieces.push({ node: child, parent, start: length });
        if (inPre) {
          for (let c = 0; c < child.value.length; c++) {
            const unit = child.value.charAt(c);
            if (unit === '\n' || unit === '\r') hard.add(length + c);
          }
        }
        chunks.push(child.value);
        length += child.value.length;
      } else if (child.type === 'element') {
        if (isSkipped(child, options)) continue;
        if (child.tagName === 'br') {
          feed();
          continue;
        }
        const block = BLOCK_ELEMENTS.has(child.tagName);
        if (block) feed();
        visit(child, inPre || child.tagName === 'pre');
        if (block) feed();
      }
    }
  };
  visit(tree, tree.type === 'element' && tree.tagName === 'pre');
  const source = chunks.join('');

  // Each white-space run one character, '\n' where it holds a hard feed; each character's source
  // offset (a run's, its first), then the source's length.
  let text = '';
  const offsets: number[] = [];
  let pos = 0;
  for (const run of source.matchAll(/\s+/g)) {
    for (let i = pos; i < run.index; i++) offsets.push(i);
    const end = run.index + run[0].length;
    let feeds = false;
    for (let at = run.index; at < end && !feeds; at++) feeds = hard.has(at);
    text += `${source.slice(pos, run.index)}${feeds ? '\n' : ' '}`;
    offsets.push(run.index);
    pos = end;
  }
  for (let i = pos; i < source.length; i++) offsets.push(i);
  text += source.slice(pos);
  offsets.push(source.length);

  // Trimmed: a run at the start goes with its offset; one at the end leaves its offset, its run's
  // first, as the one after the last character kept.
  if (/^\s/.test(text)) {
    text = text.slice(1);
    offsets.shift();
  }
  if (/\s$/.test(text)) {
    text = text.slice(0, -1);
    offsets.pop();
  }
  return { text, places: { pieces, offsets } };
}

/** Whether `element` is left out of the reading, with all it holds: `data-vultus-change-skip`
 *  present (hast `dataVultusChangeSkip`, an empty string too), or `options.skip(element)`. */
export function isSkipped(element: Element, options?: ReadTextOptions): boolean {
  const flag = element.properties.dataVultusChangeSkip;
  if (flag !== undefined && flag !== null && flag !== false) return true;
  return options?.skip?.(element) ?? false;
}
