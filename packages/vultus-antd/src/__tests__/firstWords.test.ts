import { describe, it, expect } from 'vitest';
import { firstWords } from '../firstWords.js';

describe('firstWords', () => {
  it('leaves a name of at most `max` characters unchanged', () => {
    expect(firstWords('Kombinatorika', 16, [])).toBe('Kombinatorika');
    expect(firstWords('Egyenlőtlenségek', 16, [])).toBe('Egyenlőtlenségek');
    expect(firstWords('Osztók, legnagyobb közös osztó', 40, [])).toBe('Osztók, legnagyobb közös osztó');
  });

  it('cuts a longer name at a word boundary, with an ellipsis', () => {
    expect(firstWords('Gráfok és utak bejárása', 16, ['és'])).toBe('Gráfok és utak…');
    expect(firstWords('Feltételes valószínűség', 16, [])).toBe('Feltételes…');
  });

  it('keeps a word that ends exactly at `max`', () => {
    expect(firstWords('Gráfok és utak bejárása', 14, [])).toBe('Gráfok és utak…');
  });

  it('never ends on a joining word', () => {
    expect(firstWords('Gráfok és utak bejárása', 12, ['és'])).toBe('Gráfok…');
    expect(firstWords('Graphs and walks on them', 12, ['and', 'of', 'the'])).toBe('Graphs…');
    expect(firstWords('Theory of the graphs, at large', 16, ['and', 'of', 'the'])).toBe('Theory…');
  });

  it('compares the joining words case-insensitively', () => {
    expect(firstWords('Gráfok ÉS utak bejárása', 12, ['és'])).toBe('Gráfok…');
    expect(firstWords('Gráfok és utak bejárása', 12, ['ÉS'])).toBe('Gráfok…');
  });

  it('a joining word only counts whole: other words ending the cut stay', () => {
    expect(firstWords('Gráfok ések utak', 12, ['és'])).toBe('Gráfok ések…');
  });

  it('keeps the first word even if it is a joining word', () => {
    expect(firstWords('The graphs of planar maps', 4, ['the'])).toBe('The…');
  });

  it('never ends on , ; or :', () => {
    expect(firstWords('Osztók, legnagyobb közös osztó', 16, [])).toBe('Osztók…');
    expect(firstWords('Gráfok; utak bejárása', 10, [])).toBe('Gráfok…');
    expect(firstWords('Gráfok: utak bejárása', 10, [])).toBe('Gráfok…');
  });

  it('a first word longer than `max` is kept whole rather than lost', () => {
    expect(firstWords('Valószínűségszámítás és statisztika', 16, ['és'])).toBe('Valószínűségszámítás…');
    expect(firstWords('Valószínűségszámítás', 16, [])).toBe('Valószínűségszámítás');
  });
});
