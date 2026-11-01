import { DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch } from 'diff-match-patch';

/** How much of a change is marked: the changed word whole, or only its changed letters; or the
 *  old letters that went (`removed`), at their place. And, a mark's alone (`rehypeChanges`'s; no
 *  `Change` has it), a replacement (`replaced`): the old letters and the new ones that took their
 *  place, in one mark around the two. */
export type ChangeLevel = 'word' | 'letters' | 'removed' | 'replaced';

/** A span of the new text (UTF-16 offsets, `end` exclusive) that differs from the old one; a
 *  `removed` one has no width (`start === end`), its place in the new text. */
export interface Change {
  start: number;
  end: number;
  level: ChangeLevel;
  /** The old letters that went at this place: a `removed` change's alone. */
  text?: string;
}

/** A word, or one punctuation character, of a text, by its offsets. */
export interface Token {
  start: number;
  end: number;
  word: boolean;
}

/** diff-match-patch's time budget for one diff, in seconds (praeceptor's spec 6). Past it the diff is coarser, not wrong. */
const DIFF_TIMEOUT_S = 0.2;

/**
 * The share of letters past which something is replaced whole rather than letter by letter. A
 * change is replaced whole, its old run removed whole before its new one, lit whole, when more than
 * this share of the new run's letters were put in or of the old run's letters removed, both ways
 * alike ("t. i." to "tudniillik": `[-t. i.][+tudniillik]`; back: `[-tudniillik][+t. i.]`). In a
 * change that is not, a word more than this share of whose letters were put in is marked whole.
 * Half is harma-style's maintainer's suggestion (2026-10-28), which the owner kept (2026-10-29: "it's
 * fine as it is now"); this is the one place to change it.
 */
const WHOLE_WORD_SHARE = 0.5;

/**
 * The longest new run (UTF-16 units, first token to last) a change replaced whole is lit as: one
 * piece of the lent mark's, which may not wrap, so no longer than fits a phone's line with room to
 * spare. A longer one is lit word by word (each word with more than `WHOLE_WORD_SHARE` of its
 * letters put in, whole).
 */
const WHOLE_RUN_LENGTH = 24;

const WORD_RUN = /[\p{L}\p{M}\p{N}]+|\S/gu;

/**
 * Splits a text into the units the comparison works on: a word is a run of letters, combining
 * marks and digits, every other run of non-space characters is punctuation, one token per
 * character, white space is no token. So "napról-napra" is a word, a hyphen and a word, and the
 * hyphen's going is a change of its own that marks no word.
 */
export function tokens(text: string): Token[] {
  return Array.from(text.matchAll(WORD_RUN), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    word: /^[\p{L}\p{M}\p{N}]/u.test(match[0]),
  }));
}

/**
 * Whether the character at an offset of `text` is white space that ends a line: each character of
 * a white-space run holding '\n' or '\r' (a hard boundary, `changesIn`). Computed once per text.
 */
export function lineEnds(text: string): (at: number) => boolean {
  const ends = new Set<number>();
  for (const run of text.matchAll(/\s+/g)) {
    if (!/[\n\r]/.test(run[0])) continue;
    for (let at = run.index; at < run.index + run[0].length; at++) ends.add(at);
  }
  return (at) => ends.has(at);
}

/**
 * What changed between two versions of a text, as spans of the new one at two levels (GitHub-diff
 * style): `word` spans, the changed words whole, never overlapping; and inside them `letters`
 * spans, the changed letters. Compared word by word (each distinct token one character of an
 * alphabet, so diff-match-patch's line-of-characters speed carries over to words), then, per
 * change, letter by letter. A change that only inserts marks its words at both levels; one that
 * replaces words is compared letter by letter, only the letters that differ marked (the owner, via
 * harma-style's maintainer, 2026-10-28: "Ferencz" to "Ferenc", the "z" removed and nothing lit).
 * A change replaced whole (`WHOLE_WORD_SHARE` of the new run's letters put in, or of the old
 * run's removed: "t. i." to "tudniillik" and back) is one span, its new run lit whole and the old
 * one removed whole before it, when short (`WHOLE_RUN_LENGTH`); otherwise a word more than
 * `WHOLE_WORD_SHARE` of whose letters are new is marked whole at the letter level, the old text it
 * stands for removed before it. A split, one old word become several ("jóhirű" to "jó
 * hírű": a space put in between two old letters), is one `word` span over the new run, the space
 * among its letters, growing in as they do (the owner, the same day). Punctuation alone is never
 * marked: a change of punctuation alone marks nothing ("napról-napra" to "napról napra").
 *
 * A changed word's `word` span runs from white space to white space (harma-style's maintainer's
 * ruling, 2026-10-28, for every switch): the punctuation touching it (a comma, an opening quote)
 * is inside its mark, lit lightly with it ("hivei," to "hívei,": "hívei,"), never at the letter
 * level; a line may break around the lent mark's removal pieces, so a comma outside the mark could
 * start the next line. The changed words of one run of non-space characters share one span. A new
 * word in place of nothing (put in, or marked whole with no old text before it) holds one space
 * beside it in both its spans, the one between it and the next token (at the end, the one between
 * the token before and it: "a b" to "a b új", " új"), so that growing in from no width it leaves
 * one space between its neighbours, not two (the maintainer, 2026-10-28).
 *
 * A line feed in `to` is a hard boundary (`lineEnds`: every character of a white-space run holding
 * '\n' or '\r'). The reading (`readText`) puts one exactly where a line really ends: between
 * blocks, at a `br`, at a code line's end. A line feed in a mark would be written as a space and
 * join the lines, so a new word takes no such space, and neither a split nor a run replaced whole
 * is one span across one (the run is lit word by word, as a long one is). Only hard boundaries
 * moved (a paragraph split or joined) is no change: white space is no token.
 *
 * And what went (praeceptor's spec 11, "Removed letters"): the old letters each change removed, as
 * `removed` changes of no width at their place in the new text, carrying them (`text`, its white
 * space collapsed: never a line feed, which the lent mark's pieces may keep as a break). Inside a
 * changed word, before the letters that replaced them ("hivei" to "hívei": the "i" before the "í";
 * "katholikus" to "katolikus": the "h" between "t" and "o"), white space and punctuation too (a
 * space joined away: "szent áldozásban" to "szentáldozásban"), never between a letter and its
 * combining mark; at a word marked whole, the old text it replaced, whole, before it ("t. i."
 * before "tudniillik"). What went outside every word's span is not shown. A change that removed
 * words and put in none (a word removed altogether) gets a `word` span of no width at the start
 * of the token after it (past the last one, at the end of the text), holding the run with the
 * space that separated it: after it ("a b c" to "a c": "b "), or before it where nothing separates
 * the place from the token before it (at the end: "a b c" to "a b", " c"; before punctuation:
 * "mondta ő, hogy" to "mondta, hogy", " ő"), so it sits between its neighbours as it did. A run
 * that touched the token before it (punctuation first) goes at that token's end instead, with no
 * space after it ("Péter, a halász, mondta" to "Péter mondta": ", a halász,"). So does a run that
 * ended its line, where the new text keeps that line end, with the space before it: a word removed
 * at a paragraph's end stays in that paragraph ("a b\nc d" to "a\nc d": " b"); a line end only the
 * old text had places nothing ("a b\nc d" to "a d": "b c "). More distinct tokens than there are
 * code units to stand for them gives `[]`: no marks rather than a wrong or a slow diff.
 */
export function changesIn(from: string, to: string): Change[] {
  const fromTokens = tokens(from);
  const toTokens = tokens(to);

  const alphabet = new Map<string, string>();
  let next = 1;
  const unitFor = (text: string): string | undefined => {
    const known = alphabet.get(text);
    if (known !== undefined) return known;
    if (next === 0xd800) next = 0xe000;
    if (next > 0xffff) return undefined;
    const unit = String.fromCharCode(next++);
    alphabet.set(text, unit);
    return unit;
  };
  const encode = (source: string, list: Token[]): string | undefined => {
    let encoded = '';
    for (const token of list) {
      const unit = unitFor(source.slice(token.start, token.end));
      if (unit === undefined) return undefined;
      encoded += unit;
    }
    return encoded;
  };
  const a = encode(from, fromTokens);
  const b = a === undefined ? undefined : encode(to, toTokens);
  if (a === undefined || b === undefined) return [];

  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = DIFF_TIMEOUT_S;
  // One deadline for the whole call, shared by every diff in it.
  const deadline = Date.now() + DIFF_TIMEOUT_S * 1000;
  const diffs = dmp.diff_main(a, b, false, deadline);
  const lineEnd = lineEnds(to);
  const fromLineEnd = lineEnds(from);

  const changes: Change[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (k < diffs.length) {
    const [op, text] = diffs[k];
    if (op === DIFF_EQUAL) {
      i += text.length;
      j += text.length;
      k++;
      continue;
    }
    const deletedFrom = i;
    const insertedFrom = j;
    while (k < diffs.length && diffs[k][0] !== DIFF_EQUAL) {
      if (diffs[k][0] === DIFF_DELETE) i += diffs[k][1].length;
      else j += diffs[k][1].length;
      k++;
    }
    const deleted = fromTokens.slice(deletedFrom, i);
    const inserted = toTokens.slice(insertedFrom, j);
    if (inserted.some((token) => token.word)) addChange(changes, from, deleted, to, inserted, toTokens[j], lineEnd, dmp, deadline);
    else if (deleted.some((token) => token.word)) {
      addRemoval(changes, from, deleted, toTokens[insertedFrom - 1], toTokens[insertedFrom], lineEnd, fromLineEnd);
    }
  }
  return toWhiteSpace(changes, to);
}

/**
 * `changes` (in the order `addChange` and `addRemoval` give them, each level's in place order)
 * with each word's span widened from white space to white space in `to` (`changesIn`), an edge
 * that holds a space already left as it is, and the words of one run of non-space characters
 * merged into one span; a word removed altogether inside one of them (beside a changed word) is
 * no word of its own there, and what went outside every word's span is dropped.
 */
function toWhiteSpace(changes: Change[], to: string): Change[] {
  const spans: Change[] = [];
  for (const change of changes) {
    if (change.level !== 'word' || change.start === change.end) continue;
    let { start, end } = change;
    if (!/\s/.test(to.charAt(start))) while (start > 0 && !/\s/.test(to.charAt(start - 1))) start--;
    if (!/\s/.test(to.charAt(end - 1))) while (end < to.length && !/\s/.test(to.charAt(end))) end++;
    const last = spans[spans.length - 1];
    if (last && start < last.end) last.end = Math.max(last.end, end);
    else spans.push({ start, end, level: 'word' });
  }
  // The places come in order: one pointer finds the span each is in, at an edge too.
  let s = 0;
  const inSpan = (at: number) => {
    while (s < spans.length && spans[s]!.end < at) s++;
    return s < spans.length && spans[s]!.start <= at;
  };
  const out: Change[] = [];
  let next = 0;
  let lone: number | undefined;
  for (const change of changes) {
    if (change.level === 'letters') out.push(change);
    else if (change.level === 'word' && change.start < change.end) {
      // Its widened span, put in at the first of its words.
      if (next < spans.length && spans[next]!.start <= change.start) out.push(spans[next++]!);
    } else if (change.level === 'word') {
      lone = inSpan(change.start) ? undefined : change.start;
      if (lone !== undefined) out.push(change);
    } else if (change.start === lone || inSpan(change.start)) out.push(change);
  }
  return out;
}

/**
 * One change that put in a word: the old tokens it removed, the new ones it inserted (`after`, the
 * token of `to` after them), appended to `changes` as `word` spans (on the words alone, widened
 * later: `toWhiteSpace`), their `letters` and what went (`removed`, in place order, before the
 * letters at the same place); `lineEnd`, `to`'s line ends (`lineEnds`). Appends one by one: a
 * change of a hundred thousand words must not become a call's arguments.
 */
function addChange(
  changes: Change[],
  from: string,
  deleted: Token[],
  to: string,
  inserted: Token[],
  after: Token | undefined,
  lineEnd: (at: number) => boolean,
  dmp: InstanceType<typeof diff_match_patch>,
  deadline: number,
): void {
  // Whether a token comes after the inserted one at `n`, for the space a new word takes.
  const followed = (n: number) => (inserted[n + 1] ?? after) !== undefined;
  // Whether `to`'s `start`-`end` holds a line end that must stay one (`changesIn`).
  const crossesLineEnd = (start: number, end: number) => {
    for (let at = start; at < end; at++) if (/\s/.test(to.charAt(at)) && lineEnd(at)) return true;
    return false;
  };
  if (deleted.length === 0) {
    let taken = 0;
    for (let n = 0; n < inserted.length; n++) {
      const word = inserted[n]!;
      if (!word.word) continue;
      const { start, end } = withSpace(word, followed(n), to, taken, lineEnd);
      changes.push({ start, end, level: 'word' });
      changes.push({ start, end, level: 'letters' });
      taken = end;
    }
    return;
  }

  // The old run's text as it stands, its white space collapsed, so what went reads as it was
  // ("t. i.", not "t . i ."); the new run's tokens joined by single spaces, as the offsets below
  // count them (where the new text joins a word and a comma, the diff sees a space put in, which
  // marks nothing). For each character of the new side, whether the letter diff inserted it; for
  // each place of it, where the old side is there, past what went at it; and what went at a place.
  const oldText = from.slice(deleted[0]!.start, deleted[deleted.length - 1]!.end).replace(/\s+/g, ' ');
  const newText = inserted.map((token) => to.slice(token.start, token.end)).join(' ');
  const diffs = dmp.diff_main(oldText, newText, false, deadline);
  const isNew: boolean[] = new Array<boolean>(newText.length).fill(false);
  const oldAt: number[] = [];
  const went = new Map<number, { start: number; end: number }>();
  let position = 0;
  let old = 0;
  for (const [op, text] of diffs) {
    if (op === DIFF_DELETE) {
      const there = went.get(position);
      if (there) there.end += text.length;
      else went.set(position, { start: old, end: old + text.length });
      old += text.length;
      continue;
    }
    for (let c = 0; c < text.length; c++) oldAt.push(op === DIFF_EQUAL ? old + c : old);
    if (op === DIFF_INSERT) isNew.fill(true, position, position + text.length);
    else old += text.length;
    position += text.length;
  }
  oldAt.push(old);

  // Replaced whole, a short run on one line: the old run removed whole before the new one, lit
  // whole.
  const first = inserted[0]!;
  const last = inserted[inserted.length - 1]!;
  if (last.end - first.start <= WHOLE_RUN_LENGTH && !crossesLineEnd(first.start, last.end) && replacedWhole(diffs)) {
    changes.push({ start: first.start, end: last.end, level: 'word' });
    changes.push({ start: first.start, end: first.start, level: 'removed', text: oldText });
    changes.push({ start: first.start, end: last.end, level: 'letters' });
    return;
  }

  // Letters lit, `start`-`end`, run on from the ones just before them, in one word's span (a word
  // marked whole has letters of its own: one piece over several words could not wrap).
  const addLetters = (start: number, end: number) => {
    const last = changes[changes.length - 1]!;
    if (last.level === 'letters' && last.end === start && span !== undefined && last.start >= span.start) last.end = end;
    else changes.push({ start, end, level: 'letters' });
  };

  // A place of the joined new side belongs to the token it is in or at an edge of (the space
  // joining two tokens has a place at each end).
  let offset = 0;
  let taken = 0;
  let span: Change | undefined;
  for (let n = 0; n < inserted.length; n++) {
    const token = inserted[n]!;
    const length = token.end - token.start;
    if (token.word) {
      const word = to.slice(token.start, token.end);
      const marked = wholeCharacters(word, isNew.slice(offset, offset + length));
      const count = marked.filter(Boolean).length;
      const whole = count > length * WHOLE_WORD_SHARE;
      // A new word: the old text it stands for, from before what went at its start to past what
      // went at its end, removed before it whole; with none, it holds the space beside it, as a
      // word put in does.
      const text = whole ? oldText.slice(went.get(offset)?.start ?? oldAt[offset]!, oldAt[offset + length]!) : '';
      const { start, end } = whole && !text ? withSpace(token, followed(n), to, taken, lineEnd) : token;
      // A split ("jóhirű" to "jó hírű"): the space between this word and the one before was put in
      // between two old letters (on one line); the span before goes on over both, the space among
      // its letters.
      const previous = inserted[n - 1];
      const joint = offset - 1;
      if (previous?.word && span?.end === previous.end && isNew[joint] && !isNew[joint - 1] && !isNew[offset]
        && !crossesLineEnd(previous.end, token.start)) {
        span.end = end;
        addLetters(previous.end, token.start);
      } else changes.push(span = { start, end, level: 'word' });
      taken = end;
      if (whole) {
        if (text) changes.push({ start, end: start, level: 'removed', text });
        changes.push({ start, end, level: 'letters' });
      } else {
        // What went inside the word, each at the start of the character it went in.
        const removed = new Map<number, string>();
        for (let c = 0; c <= length; c++) {
          const gone = went.get(offset + c);
          if (!gone) continue;
          const at = characterStart(word, c);
          removed.set(at, (removed.get(at) ?? '') + oldText.slice(gone.start, gone.end));
        }
        for (let c = 0; c <= length; c++) {
          const lost = removed.get(c);
          if (lost) changes.push({ start: token.start + c, end: token.start + c, level: 'removed', text: lost });
          if (c < length && marked[c]) addLetters(token.start + c, token.start + c + 1);
        }
      }
    } else {
      // Punctuation: what went at it shows where it touches a changed word, inside the word's span.
      for (let c = 0; c <= length; c++) {
        const gone = went.get(offset + c);
        if (gone) changes.push({ start: token.start + c, end: token.start + c, level: 'removed', text: oldText.slice(gone.start, gone.end) });
      }
    }
    offset += length + 1;
  }
}

/**
 * One change that removed words and put in none (punctuation at most), appended to `changes`: a
 * `word` span of no width where it went, holding the run `removed` with the space that separated
 * it, its white space collapsed (`changesIn`). `before` and `after` are the tokens of the new text
 * around the place: the start of `after`, or at the end the end of `before`; the end of `before`
 * too where the run touched it, or where it ended its line (`fromLineEnd` after it) and the new
 * text keeps a line end after `before` (`toLineEnd`). The space after the run unless the place is
 * at the end, the run touched `before` or ended its line; the space before it where no space
 * separates the place from `before` (at the end, before punctuation, at a line's end).
 */
function addRemoval(
  changes: Change[],
  from: string,
  deleted: Token[],
  before: Token | undefined,
  after: Token | undefined,
  toLineEnd: (at: number) => boolean,
  fromLineEnd: (at: number) => boolean,
): void {
  const first = deleted[0]!;
  const last = deleted[deleted.length - 1]!;
  // A run that touched the token before it in the old text (punctuation: "Péter, a halász,
  // mondta" to "Péter mondta") goes at that token's end, the space after it left where it is.
  const touching = before !== undefined && !first.word && first.start > 0 && !/\s/.test(from.charAt(first.start - 1));
  // Ruling 2: a run that ended its line stays on it where the new text keeps the line end.
  const endedLine = !touching && before !== undefined && after !== undefined
    && toLineEnd(before.end) && fromLineEnd(last.end);
  const place = touching || endedLine ? before!.end : after?.start ?? before?.end ?? 0;
  const glued = before !== undefined && before.end === place;
  const spaceBefore = glued && /\s/.test(from.charAt(first.start - 1)) ? ' ' : '';
  const spaceAfter = !touching && !endedLine && after !== undefined && /\s/.test(from.charAt(last.end)) ? ' ' : '';
  const run = from.slice(first.start, last.end).replace(/\s+/g, ' ');
  changes.push({ start: place, end: place, level: 'word' });
  changes.push({ start: place, end: place, level: 'removed', text: spaceBefore + run + spaceAfter });
}

/** Whether a letter diff replaced its texts whole: more than `WHOLE_WORD_SHARE` of the new side's
 *  letters (letters, marks, digits) put in, or of the old side's removed. */
function replacedWhole(diffs: [number, string][]): boolean {
  let old = 0;
  let removed = 0;
  let now = 0;
  let put = 0;
  for (const [op, text] of diffs) {
    let letters = 0;
    for (const character of text) if (/[\p{L}\p{M}\p{N}]/u.test(character)) letters++;
    if (op === DIFF_DELETE) removed += letters;
    else now += letters;
    if (op === DIFF_INSERT) put += letters;
    else old += letters;
  }
  return put > now * WHOLE_WORD_SHARE || removed > old * WHOLE_WORD_SHARE;
}

/** `word`'s span with the space beside it (`changesIn`): the one between it and the next token when
 *  one comes after it (`followed`), else the one between the token before and it, unless a span
 *  before took that one (`taken`, the end of the last); none where the word touches punctuation,
 *  nor where that space is a line end that must stay one (`lineEnd`). */
function withSpace(word: Token, followed: boolean, to: string, taken: number, lineEnd: (at: number) => boolean): { start: number; end: number } {
  const space = (at: number) => /\s/.test(to.charAt(at)) && !lineEnd(at);
  if (followed) return { start: word.start, end: space(word.end) ? word.end + 1 : word.end };
  const before = word.start - 1 >= taken && space(word.start - 1);
  return { start: before ? word.start - 1 : word.start, end: word.end };
}

/** The start of the character `word`'s offset `c` is in: `c` moved back past a combining mark or
 *  the second half of a surrogate pair, so a removal there never cuts a character. */
function characterStart(word: string, c: number): number {
  let at = c;
  while (at > 0 && at < word.length) {
    const unit = word.charCodeAt(at);
    if (!(unit >= 0xdc00 && unit <= 0xdfff) && !/^\p{M}/u.test(word.slice(at, at + 2))) break;
    at--;
  }
  return at;
}

/**
 * `marked` (one flag per UTF-16 unit of `word`) widened to whole characters: a surrogate pair is
 * marked whole, and a combining mark goes with the letter before it, so a span never cuts a
 * character ("o" + U+0308 is lit together).
 */
function wholeCharacters(word: string, marked: boolean[]): boolean[] {
  const widened = marked.slice();
  let clusterStart = 0;
  let position = 0;
  const close = (end: number) => {
    if (marked.slice(clusterStart, end).some(Boolean)) widened.fill(true, clusterStart, end);
  };
  for (const character of word) {
    if (position > 0 && !/^\p{M}/u.test(character)) {
      close(position);
      clusterStart = position;
    }
    position += character.length;
  }
  close(position);
  return widened;
}
