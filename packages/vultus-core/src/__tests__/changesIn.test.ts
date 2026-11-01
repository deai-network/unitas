import type { Element, ElementContent, Root } from 'hast';
import { describe, expect, it } from 'vitest';
import { changesIn, tokens } from '../changes/changesIn.js';
import { readText } from '../changes/readText.js';
import { el, root } from './helpers/hast.js';

/** U+0308, the combining diaeresis: written as a code, since typed it is invisible and an editor may compose it. */
const DIAERESIS = String.fromCharCode(0x308);

/** The texts of `to` under each level's spans, and the old letters removed, each with its place in `to`. */
function lit(from: string, to: string): { words: string[]; letters: string[]; removed: [number, string][] } {
  const changes = changesIn(from, to);
  const texts = (level: string) =>
    changes.filter((c) => c.level === level).map((c) => to.slice(c.start, c.end));
  for (const c of changes) if (c.level === 'removed') expect(c.end).toBe(c.start);
  return {
    words: texts('word'),
    letters: texts('letters'),
    removed: changes.filter((c) => c.level === 'removed').map((c): [number, string] => [c.start, c.text!]),
  };
}

const CASES: [string, string, string[], string[]][] = [
  ['a hivei b', 'a hívei b', ['hívei'], ['í']],
  ['szent Péter', 'Szent Péter', ['Szent'], ['S']],
  ['a katholikus b', 'a katolikus b', ['katolikus'], []],
  ['a szent áldozásban', 'a szentáldozásban', ['szentáldozásban'], []],
  // A split: one span over the new run, the space put in among its letters.
  ['a jóhirű b', 'a jó hírű b', ['jó hírű'], [' ', 'í']],
  ['napról-napra', 'napról napra', [], []],
  ['a pünkösd-ünnepén', 'a pünkösdünnepén', ['pünkösdünnepén'], []],
  ['az ó-kor', 'az ókor', ['ókor'], []],
  ['azaz t. i. ez', 'azaz tudniillik ez', ['tudniillik'], ['tudniillik']],
  // A word put in holds the space beside it (the one before the next token; at the end, the one
  // after the token before), unless the word before took it.
  ['a b', 'a új b', ['új '], ['új ']],
  ['a b', 'a b új', [' új'], [' új']],
  ['a b', 'a új szó b', ['új ', 'szó '], ['új ', 'szó ']],
  ['a b', 'a b új szó', ['új ', 'szó'], ['új ', 'szó']],
  // And a word marked whole with no old text before it, in a change that replaced something.
  ['a kegyelem b', 'a nagy kegyelemmel b', ['nagy ', 'kegyelemmel'], ['nagy ', 'mel']],
  ['a hivei b', 'a hívei új b', ['hívei', 'új '], ['í', 'új ']],
  // Replaced whole, but longer than one piece may be (WHOLE_RUN_LENGTH): word by word.
  ['a x b', 'a egészen hosszú új mondatot b', ['egészen', 'hosszú ', 'új ', 'mondatot '], ['egészen', 'hosszú ', 'új ', 'mondatot ']],
  // A word's span from white space to white space: the punctuation touching it inside, lit lightly
  // alone; the changed words of one run of non-space characters in one span.
  ['a hivei, b', 'a hívei, b', ['hívei,'], ['í']],
  ['a „hivei” b', 'a „hívei” b', ['„hívei”'], ['í']],
  ['a b', 'a új, b', ['új,'], ['új']],
  ['a hivei-szent b', 'a hívei-Szent b', ['hívei-Szent'], ['í', 'S']],
  ['same text', 'same text', [], []],
  ['a kegyelem b', 'a kegyelemmel b', ['kegyelemmel'], ['mel']],
];

// The old letters each change removed, at their place in the new text: inside
// the changed word, before the letters that replaced them; before a word lit whole, the old text it
// replaced; a word removed altogether with the space that separated it, after it, or before it
// where it went at the end or right before punctuation. Never a line feed: white space collapsed.
const REMOVALS: [string, string, [number, string][]][] = [
  ['a katholikus b', 'a katolikus b', [[5, 'h']]],
  ['a hivei b', 'a hívei b', [[3, 'i']]],
  ['a szent áldozásban', 'a szentáldozásban', [[7, ' ']]],
  ['azaz t. i. ez', 'azaz tudniillik ez', [[5, 't. i.']]],
  ['a b c', 'a c', [[2, 'b ']]],
  ['a b c', 'a b', [[3, ' c']]],
  ['mondta ő, hogy', 'mondta, hogy', [[6, ' ő']]],
  // A run touching the token before it (punctuation first): at that token's end, no space after it.
  ['Péter, a halász, mondta', 'Péter mondta', [[5, ', a halász,']]],
  // A run of words after an opening quote or parenthesis: before the next word, its space after it.
  ['a „szent b” c', 'a „b” c', [[3, 'szent ']]],
  ['a (szent b) c', 'a (b) c', [[3, 'szent ']]],
  ['mondta: „szent Péter jött”', 'mondta: „Péter jött”', [[9, 'szent ']]],
  ['a pünkösd-ünnepén', 'a pünkösdünnepén', [[9, '-']]],
  ['a b\nc d', 'a d', [[2, 'b c ']]],
  // Removed at a line's end, where the new text keeps the line end: it stays on its line.
  ['a b\nc d', 'a\nc d', [[1, ' b']]],
  // At a line's start: before the next word, as anywhere.
  ['a\nb c d', 'a\nc d', [[2, 'b ']]],
  // A whole line: at the end of the line before.
  ['a\nb\nc', 'a\nc', [[1, ' b']]],
  // At the punctuation touching the word: inside its span.
  ['a hivei; b', 'a hívei, b', [[3, 'i'], [7, ';']]],
  ['a „hivei b', 'a »hívei b', [[2, '„'], [4, 'i']]],
  ['napról-napra', 'napról napra', []],
  ['a b', 'a új b', []],
  ['same text', 'same text', []],
];

/**
 * Each word span of the switch from `from` to `to` written out: its text, the letters removed in
 * it as `[-…]` at their place, the letters lit in it as `[+…]`.
 */
function written(from: string, to: string): string[] {
  const changes = changesIn(from, to);
  return changes.filter((c) => c.level === 'word').map((word) => {
    const inside = changes
      .filter((c) => c.level !== 'word' && c.start >= word.start && c.end <= word.end)
      .sort((a, b) => a.start - b.start || (a.level === 'removed' ? -1 : 1));
    let out = '';
    let at = word.start;
    for (const c of inside) {
      out += to.slice(at, c.start);
      out += c.level === 'removed' ? `[-${c.text}]` : `[+${to.slice(c.start, c.end)}]`;
      at = c.end;
    }
    return out + to.slice(at, word.end);
  });
}

// Only the letters that differ are marked: Pongrácz's spellings to the modern ones, and back.
const MARKS: [string, string, string[]][] = [
  ['a szent b', 'a Szent b', ['[-s][+S]zent']],
  ['a Ferencz b', 'a Ferenc b', ['Ferenc[-z]']],
  ['a hivei b', 'a hívei b', ['h[-i][+í]vei']],
  ['a jóhirű b', 'a jó hírű b', ['jó[+ ]h[-i][+í]rű']],
  ['a katholikus b', 'a katolikus b', ['kat[-h]olikus']],
  ['azaz t. i. ez', 'azaz tudniillik ez', ['[-t. i.][+tudniillik]']],
  ['a Szent b', 'a szent b', ['[-S][+s]zent']],
  ['a Ferenc b', 'a Ferencz b', ['Ferenc[+z]']],
  ['a hívei b', 'a hivei b', ['h[-í][+i]vei']],
  ['a jó hírű b', 'a jóhirű b', ['jó[- ]h[-í][+i]rű']],
  ['a katolikus b', 'a katholikus b', ['kat[+h]olikus']],
  // Replaced whole both ways: more than half of the new run's letters put in, or of the old run's
  // removed.
  ['azaz tudniillik ez', 'azaz t. i. ez', ['[-tudniillik][+t. i.]']],
];

describe('changesIn', () => {
  it.each(MARKS)('%s -> %s: the marks', (from, to, marks) => {
    expect(written(from, to)).toEqual(marks);
  });

  it.each(CASES)('%s -> %s', (from, to, words, letters) => {
    const found = lit(from, to);
    expect({ words: found.words, letters: found.letters }).toEqual({ words, letters });
  });

  it.each(REMOVALS)('%s -> %s: the letters removed, at their place', (from, to, removed) => {
    expect(lit(from, to).removed).toEqual(removed);
  });

  it("a line feed in the new text is a hard boundary: no run lit whole across it, no split, no new word's space on it", () => {
    const lit = (from: string, to: string, level: 'word' | 'letters' = 'letters') =>
      changesIn(from, to).filter((c) => c.level === level).map((c) => to.slice(c.start, c.end));
    expect(lit('foo x bar', 'foo y z bar')).toEqual(['y z']);
    expect(lit('foo x bar', 'foo y\nz bar')).toEqual(['y', 'z ']);
    expect(lit('foo bar', 'foo új\nbar')).toEqual(['új']);
    expect(lit('a jóhirű b', 'a jó\nhírű b', 'word')).toEqual(['jó', 'hírű']);
    expect(lit('a jóhirű b', 'a jó\nhírű b')).toEqual(['í']);
  });

  it('only hard boundaries moved lights nothing', () => {
    expect(changesIn('a b', 'a\nb')).toEqual([]);
    expect(changesIn('a\nb', 'a b')).toEqual([]);
  });

  describe('hard boundaries from the reading', () => {
    const p = (...children: (ElementContent | string)[]) => el('p', null, ...children);
    const pre = (...children: (ElementContent | string)[]) => el('pre', null, ...children);
    const code = (...children: (ElementContent | string)[]) => el('code', null, ...children);
    const br = el('br', null);
    const read = (tree: Root | Element) => readText(tree).text;

    it('a block', () => {
      expect(lit(read(root(p('a b'), p('c d'))), read(root(p('a'), p('c d')))).removed).toEqual([[1, ' b']]);
    });

    it('a br', () => {
      expect(lit(read(p('a b', br, 'c d')), read(p('a', br, 'c d'))).removed).toEqual([[1, ' b']]);
    });

    it('a pre', () => {
      expect(lit(read(pre(code('a b\nc d'))), read(pre(code('a\nc d')))).removed).toEqual([[1, ' b']]);
    });

    it('no boundary at a soft line break', () => {
      expect(written(read(p('azaz t.\ni. ez')), read(p('azaz tudniillik ez')))).toEqual(['[-t. i.][+tudniillik]']);
    });
  });

  it('a word removed altogether: in a word span of no width, at its place', () => {
    const changes = changesIn('a b c', 'a c');
    expect(changes).toEqual([
      { start: 2, end: 2, level: 'word' },
      { start: 2, end: 2, level: 'removed', text: 'b ' },
    ]);
  });

  it('a removal never between a letter and its combining mark: at the character, before its letters', () => {
    expect(lit('a abcdox c', `a abcdo${DIAERESIS} c`)).toEqual({
      words: [`abcdo${DIAERESIS}`],
      letters: [`o${DIAERESIS}`],
      removed: [[6, 'x']],
    });
    const changes = changesIn('a abcdox c', `a abcdo${DIAERESIS} c`);
    expect(changes.map((c) => c.level)).toEqual(['word', 'removed', 'letters']);
  });

  it('finds 100 scattered one-letter changes in a 20 000-word text, within two seconds', () => {
    const words = Array.from({ length: 20000 }, (_, i) => `szó${i}`);
    const changed = words.map((w, i) => (i % 200 === 100 ? `${w}x` : w));
    const started = Date.now();
    const found = lit(words.join(' '), changed.join(' '));
    // The aim is one second; the bound allows two, as CI hosts are slower.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(found.words).toEqual(changed.filter((_, i) => i % 200 === 100));
    expect(found.words).toHaveLength(100);
  });

  it('gives a change of a hundred thousand words without throwing', () => {
    const text = Array.from({ length: 100000 }, (_, i) => `w${i % 1000}`).join(' ');
    expect(changesIn('', text)).toHaveLength(200000);
    // And the x removed, before the first word.
    expect(changesIn('x', text)).toHaveLength(200001);
  });

  it('lights a letter with its combining mark, whole', () => {
    expect(lit('a abcdo c', `a abcdo${DIAERESIS} c`)).toEqual({
      words: [`abcdo${DIAERESIS}`],
      letters: [`o${DIAERESIS}`],
      removed: [],
    });
  });

  it('gives nothing, without throwing, past the code units available', () => {
    const many = Array.from({ length: 70000 }, (_, i) => `w${i}`).join(' ');
    expect(changesIn(many, `${many} extra`)).toEqual([]);
  });
});

describe('tokens', () => {
  it('splits words from punctuation, one token per punctuation character', () => {
    const text = 'ő, ű.';
    const found = tokens(text).map((t) => [text.slice(t.start, t.end), t.word]);
    expect(found).toEqual([
      ['ő', true],
      [',', false],
      ['ű', true],
      ['.', false],
    ]);
  });

  it('keeps a letter and its combining mark in one word', () => {
    expect(tokens(`o${DIAERESIS}`)).toEqual([{ start: 0, end: 2, word: true }]);
  });
});
