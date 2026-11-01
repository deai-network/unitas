import type { Element, ElementContent, Properties } from 'hast';
import { describe, expect, it } from 'vitest';
import { readText } from '../changes/readText.js';
import { el, root } from './helpers/hast.js';

type Child = ElementContent | string;

/** An element maker for `name`: `p('a', em('b'))`, or with properties first, `span({ dataX: '' }, 'x')`. */
function tag(name: string) {
  return (...args: (Properties | Child)[]): Element => {
    const [first, ...rest] = args;
    if (first !== undefined && typeof first === 'object' && !('type' in first)) {
      return el(name, first as Properties, ...(rest as Child[]));
    }
    return el(name, null, ...(args as Child[]));
  };
}

const [p, h1, ul, li, blockquote, table, tr, td, th, div, hr, pre, code, span, em, sup, a] = [
  'p', 'h1', 'ul', 'li', 'blockquote', 'table', 'tr', 'td', 'th', 'div', 'hr', 'pre', 'code', 'span', 'em', 'sup', 'a',
].map(tag);
const br = el('br', null);

/** Praeceptor's footnote mark: a `sup` holding an `a` with `dataFootnoteRef`. */
const footnoteMark = (element: Element) => element.tagName === 'sup'
  && element.children.some((child) => child.type === 'element' && child.tagName === 'a' && Boolean(child.properties.dataFootnoteRef));

describe('readText', () => {
  it('collapses prose white space, soft line breaks too', () => {
    expect(readText(p('a  \t b\nc')).text).toBe('a b c');
  });

  it('puts a line feed between blocks', () => {
    const tree = root(
      h1('T'), p('a'), ul(li('b'), li('c')), blockquote(p('d')), table(tr(td('e'), th('f'))), div('g'), hr(), p('h'),
    );
    expect(readText(tree).text).toBe('T\na\nb\nc\nd\ne\nf\ng\nh');
  });

  it('puts one at a br and at each line end inside a pre', () => {
    expect(readText(p('a', br, 'b')).text).toBe('a\nb');
    expect(readText(pre(code('x  y\nz\n'))).text).toBe('x y\nz');
  });

  it('puts one between a tight item and its nested list', () => {
    expect(readText(li('a', ul(li('b')))).text).toBe('a\nb');
  });

  it('makes feeds and the white space around them one feed, none at the ends', () => {
    expect(readText(root('\n', p(' a '), '\n', p('b'), '\n')).text).toBe('a\nb');
  });

  it('reads a soft re-wrap the same', () => {
    expect(readText(p('azaz t.\ni. ez')).text).toBe(readText(p('azaz t. i. ez')).text);
  });

  it('skips data-vultus-change-skip with all it holds, adding no feed', () => {
    expect(readText(p('a', span({ dataVultusChangeSkip: '' }, 'x'), 'b')).text).toBe('ab');
    expect(readText(root(p('a'), pre({ dataVultusChangeSkip: '' }, 'x'), p('b'))).text).toBe('a\nb');
    // A skipped block adds no feed either: its neighbours' text runs on.
    expect(readText(p('a', div({ dataVultusChangeSkip: '' }, 'x'), 'b')).text).toBe('ab');
  });

  it('reads data-vultus-change-skip false or null as absent', () => {
    expect(readText(p('a', span({ dataVultusChangeSkip: false }, 'x'), 'b')).text).toBe('axb');
    expect(readText(p('a', span({ dataVultusChangeSkip: null }, 'x'), 'b')).text).toBe('axb');
  });

  it('skips what options.skip names', () => {
    const tree = p('szöveg', sup(a({ dataFootnoteRef: true }, '1')), '.');
    expect(readText(tree, { skip: footnoteMark }).text).toBe('szöveg.');
  });

  it('maps each character back to its text node', () => {
    const tree = root(p('a ', em('b'), ' ', code('c d')), ul(li('e', ul(li('f')))));
    const { text, places: { pieces, offsets } } = readText(tree);
    expect(text).toBe('a b c d\ne\nf');
    expect(offsets).toHaveLength(text.length + 1);
    expect(pieces.map(({ node, parent }) => [node.value, parent.type === 'root' ? 'root' : parent.tagName])).toEqual([
      ['a ', 'p'], ['b', 'em'], [' ', 'p'], ['c d', 'code'], ['e', 'li'], ['f', 'li'],
    ]);
    for (const { node, parent } of pieces) expect(parent.children).toContain(node);
    const starts = pieces.map((piece) => piece.start);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    const holding = (offset: number) =>
      pieces.find(({ node, start }) => start <= offset && offset < start + node.value.length);
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i]!)) continue;
      const piece = holding(offsets[i]!);
      expect(piece?.node.value[offsets[i]! - piece.start]).toBe(text[i]);
    }
    // The last entry: right past the last character kept, the end of its piece.
    const last = pieces[pieces.length - 1]!;
    expect(offsets[text.length]).toBe(last.start + last.node.value.length);
  });

  it('reads an element as its children', () => {
    const paragraph = p('a ', em('b'), '\nc');
    expect(readText(paragraph).text).toBe(readText(root(paragraph)).text);
  });
});
