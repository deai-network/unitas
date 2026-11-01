import { render } from '@testing-library/react';
import type { Element as HastElement, Root, Text as HastText } from 'hast';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';
import type { ChangeMarkComponent } from '../Components.js';
import { ChangeMark, changeComponents, changeStore, type ChangeComponents } from '../changes/ChangeMark.js';
import type { ChangeLevel } from '../changes/changesIn.js';
import { changesPlugin, type ChangesPluginOptions, type ReadReport } from '../changes/rehypeChanges.js';
import { lent, TestMark } from './helpers/changeMarks.js';
import { el, text as textNode } from './helpers/hast.js';

// What changed from another version of the text, as the changes plugin marks it in rendered
// Markdown (`<ins data-change>`) and the `ins` entry draws it (`changeComponents`, through the lent
// mark, else vultus's fallback, each a `<mark>`): the old version read as the plugin reads it
// (`readingOf`), the new one from its rendered tree.

type Plugin = () => (tree: Root) => void;

/** The plugin's options in a test, the plugins around it (`before`, which mark the tree first;
 *  `after`, which run on its marks), the drawing (`components`) and the mark lent to it (`mark`;
 *  none, vultus's fallback). */
interface Setup extends ChangesPluginOptions {
  before?: Plugin[];
  after?: Plugin[];
  components?: ChangeComponents;
  mark?: ChangeMarkComponent;
}

/** The elements of `parent`, in document order. */
function* elements(parent: Root | HastElement): Generator<HastElement> {
  for (const child of parent.children) {
    if (child.type !== 'element') continue;
    yield child;
    yield* elements(child);
  }
}

/** An element's classes (hast's `className`). */
function classNames(element: HastElement): string[] {
  const value = element.properties.className;
  return Array.isArray(value) ? value.map(String) : String(value ?? '').split(/\s+/);
}

/** Praeceptor's skip for notes: a footnote's mark (a `sup` holding an `a` with `dataFootnoteRef`), a
 *  note's back link (an `a` with `dataFootnoteBackref`, present though empty), the notes'
 *  screen-reader heading (an `h2` of class `sr-only`). */
const NOTES = (element: HastElement) => (element.tagName === 'sup'
    && element.children.some((child) => child.type === 'element' && child.tagName === 'a' && Boolean(child.properties.dataFootnoteRef)))
  || (element.tagName === 'a' && element.properties.dataFootnoteBackref !== undefined)
  || (element.tagName === 'h2' && classNames(element).includes('sr-only'));

/** `text` rendered by react-markdown with GFM, the `before` plugins, the changes plugin (the notes
 *  skipped, `NOTES`) and the `after` plugins, drawn by `components`, `mark` lent; the container,
 *  the plugin's reports, and a re-render (a re-parse), with another setup if given. */
function rendered(text: string, setup: Setup = {}) {
  const reports: ReadReport[] = [];
  const element = ({ before = [], after = [], components, mark, ...options }: Setup) => {
    const markdown = (
      <Markdown remarkPlugins={[remarkGfm]} components={components}
        rehypePlugins={[...before, changesPlugin({ skip: NOTES, onRead: (report) => reports.push(report), ...options }), ...after]}>
        {text}
      </Markdown>
    );
    return mark ? lent(markdown, mark) : markdown;
  };
  const { container, rerender, unmount } = render(element(setup));
  return { container, reports, rerender: (next: Setup = setup) => rerender(element(next)), unmount };
}

/** The reading the plugin reports for `markdown` without `from`. */
function readingOf(markdown: string, setup?: Setup): string {
  const { reports, unmount } = rendered(markdown, { ...setup, from: undefined });
  unmount();
  return reports[reports.length - 1]!.reading;
}

/** `text` rendered with the changes from `old`, both ways: the raw marks, and drawn by the `ins`
 *  entry on the timeline a switch would take (`removals` with a removed mark cut in, as the raw
 *  render reports), where every mark the plugin puts in is drawn, a replacement's too; drawn twice,
 *  through a lent test mark and through vultus's fallback. */
function both(old: string, text: string, setup?: Setup): HTMLElement[] {
  const from = readingOf(old, setup);
  const raw = rendered(text, { ...setup, from });
  const removals = raw.reports[raw.reports.length - 1]!.removals;
  const components = changeComponents(changeStore({ number: 1, timeline: removals ? 'removals' : 'plain' }));
  return [
    raw.container,
    rendered(text, { ...setup, from, components, mark: TestMark }).container,
    rendered(text, { ...setup, from, components }).container,
  ];
}

/** `node`'s text as the new version has it: without the old letters shown going inside it. */
function shown(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  for (const removed of copy.querySelectorAll('[data-change="removed"]')) removed.remove();
  return copy.textContent ?? '';
}
/** The change marks at `level`, their text in document order (the new text's: `shown`). */
const marks = (container: HTMLElement, level: ChangeLevel) =>
  Array.from(container.querySelectorAll(`[data-change="${level}"]`), shown);
/** `node`'s children: the change level of each mark among them (none, a text or another element)
 *  and its text. */
const children = (node: Element) => Array.from(node.childNodes, (child) =>
  [child instanceof Element ? child.getAttribute('data-change') : null, child.textContent]);

describe('changesPlugin', () => {
  it('a changed letter: its word marked, the old letter and the new one at their place in one replacement mark inside it', () => {
    for (const container of both('a hivei b', 'a hívei b')) {
      expect(marks(container, 'word')).toEqual(['hívei']);
      expect(marks(container, 'letters')).toEqual(['í']);
      expect(marks(container, 'removed')).toEqual(['i']);
      expect(children(container.querySelector('[data-change="word"]')!))
        .toEqual([[null, 'h'], ['replaced', 'ií'], [null, 'vei']]);
      expect(children(container.querySelector('[data-change="word"] > [data-change="replaced"]')!))
        .toEqual([['removed', 'i'], ['letters', 'í']]);
    }
  });

  it('a letter removed: the old one inside the word, at its place', () => {
    for (const container of both('a katholikus b', 'a katolikus b')) {
      expect(marks(container, 'letters')).toEqual([]);
      expect(children(container.querySelector('[data-change="word"]')!))
        .toEqual([[null, 'kat'], ['removed', 'h'], [null, 'olikus']]);
    }
  });

  it('a replacement mark only where both are: a pure removal, a pure insertion, a word removed or put in whole have none', () => {
    for (const [old, text] of [['a katholikus b', 'a katolikus b'], ['a b', 'a új b'], ['a b c', 'a c'], ['a jóhirű b', 'a jó hirű b']] as const) {
      for (const container of both(old, text)) {
        expect(container.querySelector('[data-change="word"]')).not.toBeNull();
        expect(container.querySelector('[data-change="replaced"]')).toBeNull();
      }
    }
  });

  it('a run replaced whole: one replacement mark, the old run and the new one in it', () => {
    for (const container of both('a t. i. b', 'a tudniillik b')) {
      expect(children(container.querySelector('[data-change="word"]')!)).toEqual([['replaced', 't. i.tudniillik']]);
      expect(children(container.querySelector('[data-change="replaced"]')!)).toEqual([['removed', 't. i.'], ['letters', 'tudniillik']]);
    }
  });

  it('a replacement split over two pieces of its word (an emphasis between the old letters and the new, or among the new): no replacement mark', () => {
    for (const container of both('hivei', '*h*ívei')) {
      expect(container.querySelector('[data-change="replaced"]')).toBeNull();
      expect(children(container.querySelector('em > [data-change="word"]')!)).toEqual([[null, 'h'], ['removed', 'i']]);
      expect(children(container.querySelector('p > [data-change="word"]')!)).toEqual([['letters', 'í'], [null, 'vei']]);
    }
    for (const container of both('a t. i. b', 'a *tudni*illik b')) {
      expect(container.querySelector('[data-change="replaced"]')).toBeNull();
      expect(children(container.querySelector('em > [data-change="word"]')!)).toEqual([['removed', 't. i.'], ['letters', 'tudni']]);
      expect(children(container.querySelector('p > [data-change="word"]')!)).toEqual([['letters', 'illik']]);
    }
  });

  it('a word removed altogether: a word mark of its own between its neighbours, holding only it and its space', () => {
    for (const container of both('a b c', 'a c')) {
      const paragraph = container.querySelector('p')!;
      expect(children(paragraph)).toEqual([[null, 'a '], ['word', 'b '], [null, 'c']]);
      expect(children(paragraph.querySelector('[data-change="word"]')!)).toEqual([['removed', 'b ']]);
    }
  });

  it("a word's mark runs from white space to white space: the punctuation touching it inside, never among its letters", () => {
    for (const container of both('a „hivei”, b', 'a „hívei”, b')) {
      expect(marks(container, 'word')).toEqual(['„hívei”,']);
      expect(marks(container, 'letters')).toEqual(['í']);
    }
  });

  it('a line feed in a mark of letters is put in as a space (a word put in, with its space, before a soft line break)', () => {
    for (const container of both('a b', 'a új\nb')) {
      expect(marks(container, 'letters')).toEqual(['új ']);
      expect(container.querySelector('p')!.textContent).toBe('a új b');
    }
  });

  it("a word put in at a code line's end takes no line feed as its space: the lines stay apart", () => {
    for (const container of both('```\nfoo\nbar\n```', '```\nfoo új\nbar\n```')) {
      expect(marks(container, 'letters')).toEqual(['új']);
      expect(container.querySelector('pre')!.textContent).toBe('foo új\nbar\n');
    }
  });

  it("a run replaced whole across a code line's end: lit word by word, the lines kept apart", () => {
    for (const container of both('```\nfoo x\nbar\n```', '```\nfoo y\nz bar\n```')) {
      expect(marks(container, 'letters')).toEqual(['y', 'z ']);
      expect(marks(container, 'removed')).toEqual(['x']);
      expect(shown(container.querySelector('pre')!)).toBe('foo y\nz bar\n');
    }
  });

  it('a split: one word mark over the new run, the space put in among its letters', () => {
    for (const container of both('a jóhirű b', 'a jó hírű b')) {
      expect(marks(container, 'word')).toEqual(['jó hírű']);
      expect(children(container.querySelector('[data-change="word"]')!))
        .toEqual([[null, 'jó'], ['letters', ' '], [null, 'h'], ['replaced', 'ií'], [null, 'rű']]);
    }
  });

  it('a run removed touching the word before it: at its end, the space after it kept outside', () => {
    for (const container of both('Péter, a halász, mondta', 'Péter mondta')) {
      expect(children(container.querySelector('p')!)).toEqual([[null, 'Péter'], ['word', ', a halász,'], [null, ' mondta']]);
    }
  });

  it("the raw marks are ins, a tag of their own beside the search's and the passage's marks; drawn, the lent mark's or the fallback's mark", () => {
    const [raw, ...drawings] = both('a hivei b', 'a hívei b');
    for (const mark of raw!.querySelectorAll('[data-change]')) expect(mark.tagName).toBe('INS');
    expect(drawings).toHaveLength(2);
    for (const drawn of drawings) {
      for (const mark of drawn.querySelectorAll('[data-change]')) expect(mark.tagName).toBe('MARK');
      expect(drawn.querySelector('ins')).toBeNull();
    }
  });

  it('a word split by an emphasis: marked piece by piece, each inside its own element (a replacement in one piece, in its replacement mark)', () => {
    for (const container of both('hivei', '*hí*vei')) {
      expect(marks(container, 'word')).toEqual(['hí', 'vei']);
      expect(shown(container.querySelector('em > [data-change="word"]')!)).toBe('hí');
      expect(container.querySelector('p > [data-change="word"]')?.textContent).toBe('vei');
      expect(marks(container, 'letters')).toEqual(['í']);
      expect(children(container.querySelector('em > [data-change="word"] > [data-change="replaced"]')!))
        .toEqual([['removed', 'i'], ['letters', 'í']]);
    }
  });

  it('a note changed, the body not: one reading, marked in the notes alone', () => {
    const old = 'A hivei szöveg[^1].\n\n[^1]: A hivei jegyzet.';
    for (const container of both(old, 'A hivei szöveg[^1].\n\n[^1]: A hívei jegyzet.')) {
      expect(marks(container, 'word')).toEqual(['hívei']);
      expect(marks(container, 'letters')).toEqual(['í']);
      for (const mark of container.querySelectorAll('[data-change]')) expect(mark.closest('section[data-footnotes]')).not.toBeNull();
    }
  });

  it("a word right before a footnote's mark: the word marked, nothing inside the mark", () => {
    const note = '\n\n[^1]: Jegyzet.';
    for (const container of both(`a hivei[^1] b${note}`, `a hívei[^1] b${note}`)) {
      expect(marks(container, 'word')).toEqual(['hívei']);
      expect(marks(container, 'letters')).toEqual(['í']);
      expect(container.querySelector('sup')?.textContent).toBe('1');
      expect(container.querySelector('sup [data-change]')).toBeNull();
    }
  });

  it('inline code: marked inside the code', () => {
    for (const container of both('Írd `hivei` ide.', 'Írd `hívei` ide.')) {
      expect(shown(container.querySelector('code > [data-change="word"]')!)).toBe('hívei');
      expect(marks(container, 'letters')).toEqual(['í']);
    }
  });

  it('never inside a skipped element: the words around it compared, the element left out, changed or not', () => {
    // Skipped by its attribute, set by a plugin before; or by the app's `skip`.
    const skipCode: Plugin = () => (tree) => {
      for (const element of elements(tree)) if (element.tagName === 'code') element.properties.dataVultusChangeSkip = '';
    };
    for (const setup of [{ before: [skipCode] }, { skip: (element: HastElement) => element.tagName === 'code' }]) {
      for (const text of ['`x` hívei', '`y` hívei']) {
        for (const container of both('`x` hivei', text, setup)) {
          expect(marks(container, 'word')).toEqual(['hívei']);
          expect(container.querySelector('code [data-change]')).toBeNull();
        }
      }
    }
  });

  it('a change in a list: marked in its items, nothing between the blocks', () => {
    for (const container of both('- egy\n- kettő', '- egy\n- három\n- négy')) {
      expect(marks(container, 'word')).toEqual(['három', 'négy']);
      expect(container.querySelector('ul > [data-change]')).toBeNull();
    }
  });

  it("each switch's marks are new elements (the number); a render within one keeps them, a hit put in before them too", () => {
    // A lent mark may fade from the element's own insertion: a mark kept from the switch before
    // would show faded, and one drawn anew, or moved in the DOM, starts over.
    // A search after the changes: the paragraph's first 'a' in a `mark`.
    const hit: Plugin = () => (tree) => {
      const paragraph = Array.from(elements(tree)).find((element) => element.tagName === 'p')!;
      const i = paragraph.children.findIndex((child) => child.type === 'text' && child.value.includes('a'));
      const node = paragraph.children[i] as HastText;
      const at = node.value.indexOf('a');
      const parts = [textNode(node.value.slice(0, at)), el('mark', null, 'a'), textNode(node.value.slice(at + 1))];
      paragraph.children.splice(i, 1, ...parts.filter((part) => part.type !== 'text' || part.value !== ''));
    };
    const store = changeStore({ number: 1, timeline: 'removals' });
    const components = changeComponents(store);
    const from = readingOf('a hivei b');
    const shownMarks = (container: HTMLElement) =>
      [container.querySelector('[data-change="word"]'), container.querySelector('[data-change="letters"]')];
    const { container, rerender } = rendered('a hívei b', { from, components, mark: TestMark });
    const [word, letters] = shownMarks(container);
    // What React takes out of the paragraph: a moved element is taken out and put back.
    const observer = new MutationObserver(() => {});
    observer.observe(word!.parentElement!, { childList: true });
    rerender({ from, components, mark: TestMark, after: [hit] });
    const removed = observer.takeRecords().flatMap((record) => Array.from(record.removedNodes));
    observer.disconnect();
    expect(container.querySelector('p > mark:not([data-change])')?.textContent).toBe('a');
    expect(shownMarks(container)[0]).toBe(word);
    expect(shownMarks(container)[1]).toBe(letters);
    expect(removed).not.toContain(word);
    store.set({ number: 2, timeline: 'removals' }, false);
    rerender({ from, components, mark: TestMark, after: [hit] });
    expect(marks(container, 'word')).toEqual(['hívei']);
    expect(shownMarks(container)[0]).not.toBe(word);
    expect(shownMarks(container)[1]).not.toBe(letters);
  });

  it('near: only the numbered blocks it takes, numbered by the plugin or by a given attribute; none numbered, all of it', () => {
    const old = 'Egy hivei.\n\nKettő hivei.\n\nHárom hivei.';
    const text = 'Egy hívei.\n\nKettő hívei.\n\nHárom hívei.';
    const near = (block: number) => block === 2;
    const lit = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('p'), (p) => p.querySelector('[data-change]') !== null);
    // An existing numbering, Praeceptor's rehypeBlocks's: the paragraphs as `data-block`.
    const numberParagraphs: Plugin = () => (tree) => {
      let n = 0;
      for (const element of elements(tree)) if (element.tagName === 'p') element.properties.dataBlock = ++n;
    };
    for (const container of both(old, text, { near })) {
      expect(lit(container)).toEqual([false, true, false]);
      expect(marks(container, 'word')).toEqual(['hívei.']);
      expect(marks(container, 'removed')).toEqual(['i']);
      expect(Array.from(container.querySelectorAll('p'), (p) => p.getAttribute('data-vultus-block'))).toEqual(['1', '2', '3']);
    }
    for (const container of both(old, text, { near, blockAttribute: 'data-block', before: [numberParagraphs] })) {
      expect(lit(container)).toEqual([false, true, false]);
      expect(marks(container, 'word')).toEqual(['hívei.']);
      expect(marks(container, 'removed')).toEqual(['i']);
      expect(container.querySelector('[data-vultus-block]')).toBeNull();
    }
    for (const container of both(old, text, { near, blockAttribute: 'data-block' })) {
      expect(lit(container)).toEqual([true, true, true]);
    }
    // A number of null or false is none: the paragraph's text in no numbered block, marked.
    for (const none of [null, false]) {
      const unnumberSecond: Plugin = () => (tree) => {
        const paragraphs = Array.from(elements(tree)).filter((element) => element.tagName === 'p');
        paragraphs[1]!.properties.dataBlock = none;
      };
      const setup = { near: () => false, blockAttribute: 'data-block' as const, before: [numberParagraphs, unnumberSecond] };
      for (const container of both(old, text, setup)) {
        expect(lit(container)).toEqual([false, true, false]);
      }
    }
  });

  it('the notes, numbered on after the body, by the same blocks', () => {
    const text = 'Egy hívei[^1] van.\n\n[^1]: Jegyzet hívei.';
    const old = 'Egy hivei[^1] van.\n\n[^1]: Jegyzet hivei.';
    // The body's paragraph is block 1; the note, its item 2 and its paragraph 3.
    const marked = (first: number, last: number, inNotes: boolean[]) => {
      for (const container of both(old, text, { near: (block) => first <= block && block <= last })) {
        expect(Array.from(container.querySelectorAll('[data-change="word"]'), (mark) => mark.closest('section[data-footnotes]') !== null))
          .toEqual(inNotes);
      }
    };
    marked(1, 1, [false]);
    marked(2, 3, [true]);
    marked(1, 3, [false, true]);
    // By the nearest numbered block, the innermost holding the text: the note's paragraph, not its item.
    marked(3, 3, [true]);
    marked(2, 2, []);
  });

  it("a word removed at a block's end stays in its block: marked with it, not without it", () => {
    for (const near of [undefined, (block: number) => block === 1]) {
      for (const container of both('a b\n\nc d', 'a\n\nc d', { near })) {
        const first = container.querySelector('p')!;
        expect(children(first)).toEqual([[null, 'a'], ['word', ' b']]);
        expect(children(first.querySelector('[data-change="word"]')!)).toEqual([['removed', ' b']]);
      }
    }
    for (const container of both('a b\n\nc d', 'a\n\nc d', { near: (block) => block === 2 })) {
      expect(container.querySelector('[data-change]')).toBeNull();
    }
  });

  it("a word removed at the start of a loose list item's or a note's paragraph: in the paragraph, not on the item's line end", () => {
    for (const [old, text] of [['- a\n\n- b c', '- a\n\n- c'], ['x[^1] y\n\n[^1]: b c', 'x[^1] y\n\n[^1]: c']] as const) {
      for (const container of both(old, text)) {
        expect(container.querySelector('li > [data-change]')).toBeNull();
        const mark = container.querySelector('p > [data-change="word"]')!;
        expect(children(mark)).toEqual([['removed', 'b ']]);
        expect(mark.nextSibling?.textContent).toMatch(/^c/);
      }
    }
  });

  it('a word removed between two inline elements: in the space between them, not inside the next one; in a tight list item holding a nested list too', () => {
    for (const [old, text, scope] of [
      ['*x* b *y*', '*x* *y*', 'p'],
      ['- *x* b *y*\n  - z', '- *x* *y*\n  - z', 'li'],
      ['- [x](u) b `y`\n  - z', '- [x](u) `y`\n  - z', 'li'],
    ] as const) {
      for (const container of both(old, text)) {
        expect(children(container.querySelector(scope)!).slice(0, 4)).toEqual([[null, 'x'], [null, ' '], ['word', 'b '], [null, 'y']]);
        expect(container.querySelector('em [data-change], a [data-change], code [data-change]')).toBeNull();
      }
    }
  });

  it('a word put in between two emphases takes the space between them; in a tight list item holding a nested list too', () => {
    for (const [old, text] of [['a *x*', 'a *y* *x*'], ['- a *x*\n  - z', '- a *y* *x*\n  - z']] as const) {
      for (const container of both(old, text)) expect(marks(container, 'letters').join('')).toBe('y ');
    }
  });

  it('without from no change mark; from the same reading, the text as without it', () => {
    const text = '## Cím\n\nA *hívei* `kód` szöveg[^1].\n\n- egy\n- kettő\n\n[^1]: A jegyzet.';
    const plain = rendered(text).container;
    expect(plain.querySelector('[data-change]')).toBeNull();
    expect(rendered(text, { from: readingOf(text) }).container.innerHTML).toBe(plain.innerHTML);
  });

  it('reads before marking, the same reading for the same tree', () => {
    const { container, reports, rerender } = rendered('a c', { from: readingOf('a b c') });
    expect(container.querySelector('[data-change="removed"]')?.textContent).toBe('b ');
    expect(reports).toEqual([{ reading: 'a c', removals: true }]);
    rerender();
    expect(reports).toHaveLength(2);
    expect(reports[1]).toEqual(reports[0]);
  });

  it('reports removals only for a removed mark cut in', () => {
    const removals = (old: string, text: string, near?: (block: number) => boolean) => {
      const { reports } = rendered(text, { from: readingOf(old), near });
      expect(reports).toHaveLength(1);
      return reports[0]!.removals;
    };
    expect(removals('katholikus', 'katolikus')).toBe(true);
    expect(removals('a b', 'a új b')).toBe(false);
    expect(removals('a b\n\nkatholikus', 'a új b\n\nkatolikus', (block) => block === 1)).toBe(false);
    expect(removals('a b\n\nkatholikus', 'a új b\n\nkatolikus', (block) => block === 2)).toBe(true);
  });

  it('numbers the blocks in document order, skipped elements left out', () => {
    const { container } = rendered('# T\n\n> a\n\n- b\n\n```\nc\n```\n\n| d |\n| - |\n| e |');
    expect(Array.from(container.querySelectorAll('[data-vultus-block]'), (block) => [block.tagName, block.getAttribute('data-vultus-block')]))
      .toEqual([['H1', '1'], ['BLOCKQUOTE', '2'], ['P', '3'], ['LI', '4'], ['PRE', '5'], ['TH', '6'], ['TD', '7']]);
    const heading = rendered('a[^1]\n\n[^1]: n').container.querySelector('h2.sr-only');
    expect(heading).not.toBeNull();
    expect(heading!.hasAttribute('data-vultus-block')).toBe(false);
  });

  it("numbers no block inside a skipped element: the skipped quote's paragraph unnumbered, the next one 1", () => {
    // Skipped by its attribute, set by a plugin before; or by the app's `skip`.
    const skipQuote: Plugin = () => (tree) => {
      for (const element of elements(tree)) if (element.tagName === 'blockquote') element.properties.dataVultusChangeSkip = '';
    };
    for (const setup of [{ before: [skipQuote] }, { skip: (element: HastElement) => element.tagName === 'blockquote' }]) {
      const { container } = rendered('> a\n\nb', setup);
      expect(Array.from(container.querySelectorAll('[data-vultus-block]'), (block) => [block.tagName, block.getAttribute('data-vultus-block')]))
        .toEqual([['P', '1']]);
      expect(container.querySelector('blockquote > p')!.hasAttribute('data-vultus-block')).toBe(false);
    }
  });

  it("drawn through ChangeMark, the lent mark: the word's variant, its letters' strong one inside it", () => {
    const components = changeComponents(changeStore({ number: 1, timeline: 'plain' }));
    const { container } = rendered('a hívei b', { from: readingOf('a hivei b'), components, mark: TestMark });
    const word = container.querySelector('[data-change="word"]')!;
    const letters = word.querySelector(':scope > [data-change="letters"]')!;
    /** The props the lent mark received, as the test mark writes them. */
    const props = (mark: Element) => ['data-variant', 'data-timeline', 'data-speed'].map((name) => mark.getAttribute(name));
    for (const [mark, level] of [[word, 'word'], [letters, 'letters']] as const) {
      expect(mark.tagName).toBe('MARK');
      // ChangeMark's own drawing, whatever it is: the one place it is drawn.
      const own = render(lent(<ChangeMark level={level} number={1} timeline="plain">x</ChangeMark>)).container.firstElementChild!;
      expect(own.getAttribute('data-change')).toBe(level);
      expect(props(mark)).toEqual(props(own));
    }
    expect(word.getAttribute('data-variant')).toBe('change');
    expect(letters.getAttribute('data-variant')).toBe('change-strong');
  });
});

describe('text directly in a block holder', () => {
  // Raw HTML or an app's own tree can put text straight into a div (or the root); it is read and
  // diffed, so it is marked too. Only white space between blocks is left alone (until 2026-10-29,
  // such text was read but never marked).
  it('is marked like text in a paragraph', () => {
    const tree: Root = { type: 'root', children: [el('div', null, 'a hívei b'), el('p', null, 'c hívei d')] };
    changesPlugin({ from: 'a hivei b\nc hivei d', onRead: () => {} })()(tree);
    const kinds = (block: unknown) => (block as HastElement).children.map((child) => (child.type === 'element' ? child.properties.dataChange : child.type));
    expect(kinds(tree.children[0])).toEqual(['text', 'word', 'text']);
    expect(kinds(tree.children[1])).toEqual(['text', 'word', 'text']);
  });

  it('leaves white space between blocks unmarked', () => {
    const tree: Root = { type: 'root', children: [el('p', null, 'a'), textNode('\n'), el('p', null, 'b')] };
    changesPlugin({ from: 'a b', onRead: () => {} })()(tree);
    expect(tree.children.map((child) => child.type)).toEqual(['element', 'text', 'element']);
  });
});
