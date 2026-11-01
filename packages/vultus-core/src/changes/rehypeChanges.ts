import type { Element, ElementContent, Root, Text } from 'hast';
import { BLOCK_ELEMENTS, HOLDS_BLOCKS, NUMBERED_BLOCKS } from './blocks.js';
import { changesIn, type ChangeLevel } from './changesIn.js';
import { isSkipped, readText, type Reading, type ReadTextOptions } from './readText.js';

/** The attribute the plugin numbers the blocks with (`NUMBERED_BLOCKS`), unless it is given an
 *  existing numbering's (`blockAttribute`). */
export const BLOCK_NUMBER_ATTRIBUTE = 'data-vultus-block';

/** A data attribute holding a block's number. */
export type BlockAttribute = `data-${string}`;

/** 'data-block' → 'dataBlock', 'data-vultus-block' → 'dataVultusBlock': hast's property for the
 *  attribute (property-information's rule: each dash before a lowercase letter goes, the letter
 *  capitalised). */
export function blockProperty(attribute: BlockAttribute): string {
  const rest = attribute.slice(5).replace(/-[a-z]/g, (dash) => dash.charAt(1).toUpperCase());
  return `data${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

/** The property the plugin's own numbering sets. */
const OWN_PROPERTY = blockProperty(BLOCK_NUMBER_ATTRIBUTE);

/** What one run of the plugin read (`onRead`): the part's reading (`readText`'s text), taken
 *  before any mark; and whether it cut in a removed mark (`ins[data-change=removed]`). */
export interface ReadReport {
  reading: string;
  removals: boolean;
}

export interface ChangesPluginOptions {
  /** The part's previous reading; none: read and report only. */
  from?: string;
  /** The frozen near set, by block number; none: all marked. */
  near?: (block: number) => boolean;
  /** An existing numbering's attribute; none: the plugin numbers as `data-vultus-block`. */
  blockAttribute?: BlockAttribute;
  /** What the reading leaves out besides `data-vultus-change-skip` (`readText`). */
  skip?: (element: Element) => boolean;
  /** Called once per run, with what it read. */
  onRead?: (report: ReadReport) => void;
}

/** A span of the source (`readText`'s), `start`-`end`. */
interface Span {
  start: number;
  end: number;
}

/** A piece's part of a span, `from`-`to` in its own text; `goesOn`, whether the span goes on past
 *  the piece's end. */
interface Cut {
  from: number;
  to: number;
  goesOn: boolean;
}

/** Where old letters went (`removed`), in the source or a piece's own, and those letters. */
interface Gone {
  at: number;
  text: string;
}

/**
 * A rehype plugin (spec 3) marking in a hast tree what changed from its part's previous reading,
 * `from`. Each run of its transformer:
 * - numbers the blocks (`NUMBERED_BLOCKS`, pre-order from 1, as `data-vultus-block`), a skipped
 *   element and all it holds left out, unless `blockAttribute` names an existing numbering;
 * - reads the tree (`readText`, with `skip`) before any mark is cut in, so the reading never holds
 *   removed text, on a re-parse during the light-up too, and the same tree gives the same reading;
 * - without `from`, reports it (`onRead`) and is done;
 * - with it, compares the two (`changesIn`), maps the spans back to the text nodes through the
 *   reading's `places`, cuts the marks in, and reports the reading and whether it cut in a removed
 *   mark (for the switch's timeline: removals anywhere put every part on `removals`).
 *
 * Each piece's part of a changed word goes in an `<ins data-change="word">`, inside its own element
 * (an emphasis, a link, a code token: a word split over elements is marked piece by piece, `*hí*vei`
 * gives two), and its part of the word's changed letters in an `<ins data-change="letters">` inside
 * that. Never a piece between blocks (remark-rehype's line ends, where a mark would draw an empty
 * line: `between`). The reading's line feeds are hard boundaries for `changesIn`, so nothing is lit
 * across a block's edge, a `br` or a code line's end, and a word removed at a paragraph's end stays
 * in that paragraph.
 *
 * The old letters that went are put in at their place, as text in an `<ins data-change="removed">`
 * inside their word's mark, before the letters there; at a place where two pieces of the word meet,
 * in the earlier. A word removed altogether is a word mark of its own holding only them, in the
 * piece where its place is (where two meet, at the end of the earlier: the text before it, not an
 * emphasis starting after it), so removed text never gets a block of its own. A line feed in a
 * `letters` or `removed` mark is put in as a space: the lent mark may keep the white space of their
 * pieces, and would break the line there.
 *
 * A replacement, old letters and the new ones that took their place ("hivei" → "hívei": the "i"
 * and the "í"; "t. i." → "tudniillik", whole), is one `<ins data-change="replaced">` around the
 * two, inside their word's mark, holding nothing else (the lent mark's `change-replaced`). Only when
 * both are in one piece and the new letters end there: one split over pieces (an emphasis between
 * the old letters and the new, "*h*ívei", or among the new ones, "*tudni*illik") is left as two, as
 * is a pure removal or insertion.
 *
 * `ins`, not `mark`: a tag of their own, which `changeComponents`' `ins` entry draws (as the lent
 * mark, or vultus's fallback, a `<mark>`). react-markdown keys an element by its tag's count among
 * its siblings (`mark-0`, `mark-1`), so a search hit put in before a change mark (a search typed
 * during the light-up) would change its key, and React would draw it anew, its fade starting over;
 * counted apart, it keeps its key and its element.
 *
 * With `near` (the switch's frozen near set), only the pieces whose nearest numbered block (by
 * `blockAttribute`, or the own numbering: the innermost holding them) has a number it takes are
 * marked; the others show the new text as it is. The whole text is still compared, so what is
 * marked is what it would be without it. A piece in no numbered block is marked.
 *
 * **Plugin order (a contract, not enforced):** after any plugin that reads or marks text first (a
 * passage's marks: a change is then marked inside the passage's mark), and before plugins that add
 * search marks, which must skip `[data-change=removed]` (the removed letters are no text of the
 * page's).
 */
export function changesPlugin(options: ChangesPluginOptions): () => (tree: Root) => void {
  return () => (tree) => {
    const { from, near, blockAttribute, skip, onRead } = options;
    const reads: ReadTextOptions = { skip };
    if (blockAttribute === undefined) numbered(tree, reads);
    const reading = readText(tree, reads);
    if (from === undefined) {
      onRead?.({ reading: reading.text, removals: false });
      return;
    }
    const far = near ? outside(tree, near, blockProperty(blockAttribute ?? BLOCK_NUMBER_ATTRIBUTE)) : new Set<Text>();
    const removals = marked(reading, from, far);
    onRead?.({ reading: reading.text, removals });
  };
}

/** `tree`'s `NUMBERED_BLOCKS`, numbered in pre-order from 1 as `data-vultus-block`; a skipped element
 *  (`isSkipped`) and all it holds left out. */
function numbered(tree: Root, options: ReadTextOptions): void {
  let n = 0;
  const visit = (parent: Root | Element) => {
    for (const child of parent.children) {
      if (child.type !== 'element' || isSkipped(child, options)) continue;
      if (NUMBERED_BLOCKS.has(child.tagName)) child.properties[OWN_PROPERTY] = ++n;
      visit(child);
    }
  };
  visit(tree);
}

/** The text of `tree` whose nearest numbered block (`property`, the innermost holding it) has a
 *  number `near` refuses; none of the text in no numbered block. */
function outside(tree: Root, near: (block: number) => boolean, property: string): Set<Text> {
  const found = new Set<Text>();
  const visit = (parent: Root | Element, block: number | undefined) => {
    for (const child of parent.children) {
      if (child.type === 'text') {
        if (block !== undefined && !near(block)) found.add(child);
      } else if (child.type === 'element') {
        const own = child.properties[property];
        visit(child, own === undefined || own === null || own === false ? block : Number(own));
      }
    }
  };
  visit(tree, undefined);
  return found;
}

/** The changes from `old` marked in the tree `reading` was read from: its `text`, and its `places`
 *  (the text nodes, `pieces`, and each character's source offset, `map`); `far`, the text not to
 *  mark (`outside`). Whether it cut in a removed mark. */
function marked({ text, places: { pieces, offsets: map } }: Reading, old: string, far: Set<Text>): boolean {
  const changes = changesIn(old, text);
  if (!changes.length) return false;
  // A span maps from its first character to its last: a space at its edge (a new word's), or all
  // of it (a split's), is one of the source's, of a run the one beside the word; a space inside it
  // (a split's word), the run. A place (no width) maps to the character after it.
  const spans = (level: ChangeLevel) => changes
    .filter((change) => change.level === level && change.start < change.end)
    .map(({ start, end }): Span => ({ start: start + 1 < end ? map[start + 1]! - 1 : map[start]!, end: map[end - 1]! + 1 }));
  const places = (level: ChangeLevel) => changes
    .filter((change) => change.level === level && change.start === change.end)
    .map(({ start, text: went }): Gone => ({ at: map[start]!, text: went ?? '' }));
  const words = cutter(spans('word'));
  const letters = cutter(spans('letters'));
  const lone = places('word');
  const gone = places('removed');
  let removals = false;
  // The cutters and the places' pointers go on past a piece left out, to the next one's.
  let w = 0;
  let r = 0;
  for (const { node, parent, start } of pieces) {
    if (between(node, parent) || far.has(node)) continue;
    const end = start + node.value.length;
    const own = words(start, end);
    // A word removed altogether in the first piece reaching its place.
    for (; w < lone.length && lone[w]!.at <= end; w++) {
      if (lone[w]!.at >= start) own.push({ from: lone[w]!.at - start, to: lone[w]!.at - start, goesOn: false });
    }
    if (!own.length) continue;
    own.sort((a, b) => a.from - b.from);
    // The old letters in each word's cut, at its edges too, in the first piece reaching them.
    const removed: Gone[] = [];
    for (const word of own) {
      for (; r < gone.length && gone[r]!.at - start <= word.to; r++) {
        if (gone[r]!.at - start >= word.from) removed.push({ at: gone[r]!.at - start, text: gone[r]!.text });
      }
    }
    const i = parent.children.indexOf(node);
    if (i < 0) continue;
    parent.children.splice(i, 1, ...markedPiece(node.value, own, letters(start, end), removed));
    if (removed.length) removals = true;
  }
  return removals;
}

/** Whether the text `node`, in `parent`, is between blocks (`changesPlugin`): white space whose
 *  parent holds blocks (`HOLDS_BLOCKS`, or the root), or white space right before or after a
 *  block (a loose list item's or a note's line ends around its paragraph, a tight item's before
 *  its nested list). The white space between two inline elements is not, in an item holding a
 *  nested list too. Text that is more than white space never is, even directly in a block
 *  holder (raw HTML, an app's own tree): it is read, so it is marked. */
function between(node: Text, parent: Element | Root): boolean {
  if (/\S/.test(node.value)) return false;
  if (parent.type === 'root' || HOLDS_BLOCKS.has(parent.tagName)) return true;
  const i = parent.children.indexOf(node);
  return [parent.children[i - 1], parent.children[i + 1]]
    .some((sibling) => sibling?.type === 'element' && BLOCK_ELEMENTS.has(sibling.tagName));
}

/** For the pieces in document order, each piece's cuts of `spans` (in order, none overlapping): a
 *  function of the piece's place in the source, `start`-`end`, called in that order. */
function cutter(spans: Span[]): (start: number, end: number) => Cut[] {
  let first = 0;
  return (start, end) => {
    while (first < spans.length && spans[first]!.end <= start) first++;
    const cuts: Cut[] = [];
    for (let i = first; i < spans.length && spans[i]!.start < end; i++) {
      const from = Math.max(spans[i]!.start, start) - start;
      const to = Math.min(spans[i]!.end, end) - start;
      if (from < to) cuts.push({ from, to, goesOn: spans[i]!.end > end });
    }
    return cuts;
  };
}

/** `value` as text, its `words` (in order) each in an `<ins data-change="word">`, and its
 *  `letters` (each inside one of them) in an `<ins data-change="letters">` inside it, and the old
 *  letters that went (`removed`, each inside one of them, at an edge too) in an `<ins
 *  data-change="removed">` at their place, before the letters there; a word of no width holds
 *  only those. A replacement, old letters and the letters right after them at their place (no
 *  other old letters there in between) whose span ends in this piece, is one `<ins
 *  data-change="replaced">` around the two (`changesPlugin`). */
function markedPiece(value: string, words: Cut[], letters: Cut[], removed: Gone[]): ElementContent[] {
  const out: ElementContent[] = [];
  let pos = 0;
  let l = 0;
  let g = 0;
  for (const word of words) {
    if (word.from > pos) out.push(textNode(value.slice(pos, word.from)));
    const inside: ElementContent[] = [];
    let at = word.from;
    const textTo = (to: number) => {
      if (to > at) inside.push(textNode(value.slice(at, to)));
      at = Math.max(at, to);
    };
    // The next letters' mark, the word's text and its letters going on past them.
    const takeLetters = (letter: Cut) => {
      at = letter.to;
      l++;
      return changeMark('letters', [textNode(spaced(value.slice(letter.from, letter.to)))]);
    };
    for (;;) {
      const gone = g < removed.length && removed[g]!.at <= word.to ? removed[g]! : undefined;
      const letter = l < letters.length && letters[l]!.from < word.to ? letters[l]! : undefined;
      if (gone && (!letter || gone.at <= letter.from)) {
        textTo(gone.at);
        const old = changeMark('removed', [textNode(spaced(gone.text))]);
        g++;
        const replaced = letter?.from === gone.at && removed[g]?.at !== gone.at && !letter.goesOn;
        inside.push(replaced ? changeMark('replaced', [old, takeLetters(letter)]) : old);
      } else if (letter) {
        textTo(letter.from);
        inside.push(takeLetters(letter));
      } else break;
    }
    textTo(word.to);
    out.push(changeMark('word', inside));
    pos = word.to;
  }
  if (pos < value.length) out.push(textNode(value.slice(pos)));
  return out;
}

/** A text node of `value`. */
function textNode(value: string): Text {
  return { type: 'text', value };
}

/** `text` with each line feed in it a space (`changesPlugin`). */
function spaced(text: string): string {
  return text.replace(/\r\n?|\n/g, ' ');
}

/** A change's mark at `level`, around `children`: an `ins` (see `changesPlugin`). */
function changeMark(level: ChangeLevel, children: ElementContent[]): Element {
  return { type: 'element', tagName: 'ins', properties: { dataChange: level }, children };
}
