import { describe, it, expect } from 'vitest';
import { NO_FIELD_CONTEXT, stringType, type ArgDefinition, type RawChange } from 'vultus-core';
import {
  buildPath, decodeSegment, encodeSegment, goingElsewhere, joinPath, keyOf, readPath, resolveTokens, rest, splitPath,
  token, vanishing, withChanges,
  type OneOfDefinition, type PathToken, type ResolvedPathToken,
} from '../pathTokens.js';

const arg = (key: string): ArgDefinition<string> => ({ key, valueType: stringType, default: '' });
const resolved = (...tokens: PathToken[]) => resolveTokens(tokens, NO_FIELD_CONTEXT);
const removalOf = (key: string): RawChange => ({ key, raw: undefined });

const VARIANT: OneOfDefinition = { kind: 'oneOf', id: 'variant', choices: [{ value: 'modern' }, { value: 'original' }] };
const TASK = arg('task');

/** The allowed values `vanishing` gave a token, as the store's context resolves them. */
function allowedOf(tokens: readonly ResolvedPathToken[]): string[] {
  const [first] = tokens;
  return first.kind === 'vanishing' ? [...first.allowed] : [];
}

describe('keyOf', () => {
  it('is an argument definition\'s key, a field definition\'s id', () => {
    expect(keyOf(arg('a'))).toBe('a');
    expect(keyOf(VARIANT)).toBe('variant');
  });
});

describe('the token constructors', () => {
  it('take the key from an argument definition and from a field definition', () => {
    expect(token(arg('a')).key).toBe('a');
    expect(rest({ kind: 'text', id: 'b' }).key).toBe('b');
    expect(vanishing(VARIANT).key).toBe('variant');
  });

  it('say their kind, not independent by default', () => {
    expect(token(TASK)).toMatchObject({ kind: 'token', independent: false });
    expect(rest(TASK)).toMatchObject({ kind: 'rest', independent: false });
    expect(vanishing(VARIANT)).toMatchObject({ kind: 'vanishing', independent: false });
  });

  it('each take { independent: true }', () => {
    expect(token(TASK, { independent: true }).independent).toBe(true);
    expect(rest(TASK, { independent: true }).independent).toBe(true);
    expect(vanishing(VARIANT, { independent: true }).independent).toBe(true);
    expect(vanishing(TASK, { allowedValues: ['x'], independent: true }).independent).toBe(true);
  });

  it('vanishing takes the allowed values of a one-of field from its choices, a disabled one too', () => {
    const field: OneOfDefinition = { kind: 'oneOf', id: 'v', choices: [{ value: 'a' }, { value: 'b', disabled: true }] };
    expect(allowedOf(resolved(vanishing(field)))).toEqual(['a', 'b']);
  });

  it('vanishing resolves choices that are a function with the context given', () => {
    const field: OneOfDefinition = { kind: 'oneOf', id: 'v', choices: (ctx: { grades: string[] }) => ctx.grades.map((value) => ({ value })) };
    expect(allowedOf(resolveTokens([vanishing(field)], { grades: ['x', 'y'] }))).toEqual(['x', 'y']);
    expect(allowedOf(resolveTokens([vanishing(field)], { grades: ['z'] }))).toEqual(['z']);
  });

  it('vanishing resolves choices that are a function of nothing without a context', () => {
    const field: OneOfDefinition = { kind: 'oneOf', id: 'v', choices: () => [{ value: 'x' }] };
    expect(allowedOf(resolved(vanishing(field)))).toEqual(['x']);
  });

  it('a function of the context without one throws, naming the field and the option', () => {
    const field: OneOfDefinition = { kind: 'oneOf', id: 'v', choices: (ctx: { grades: string[] }) => ctx.grades.map((value) => ({ value })) };
    expect(() => resolved(vanishing(field))).toThrow(/Field 'v': option 'choices'/);
  });

  it('vanishing takes the allowed values of a bare argument from { allowedValues }', () => {
    expect(allowedOf(resolved(vanishing(arg('v'), { allowedValues: ['p', 'q'] })))).toEqual(['p', 'q']);
  });

  it('vanishing throws for what the types refuse, naming the key', () => {
    expect(() => vanishing(arg('bare') as never)).toThrow(/'bare'/);
    expect(() => vanishing({ kind: 'text', id: 'words' } as never)).toThrow(/'words'/);
  });
});

describe('resolveTokens', () => {
  it('throws for a rest that is not the last token, naming it', () => {
    expect(() => resolved(rest(TASK), token(arg('after')))).toThrow(/'task'/);
    expect(() => resolved(rest(TASK), rest(arg('after')))).toThrow(/'task'/);
  });

  it('throws for two tokens with one key, naming it', () => {
    expect(() => resolved(token(arg('a')), vanishing(arg('a'), { allowedValues: [] }))).toThrow(/'a'/);
  });

  it('takes a list without a problem', () => {
    expect(resolved().length).toBe(0);
    expect(resolved(vanishing(VARIANT), token(arg('a')), rest(TASK)).map((t) => t.key)).toEqual(['variant', 'a', 'task']);
  });
});

describe('encodeSegment and decodeSegment', () => {
  it.each([
    ['s19~modern', 's19~modern'],
    ['resz.1-kep', 'resz.1-kep'],
    ['a@b_c', 'a@b_c'],
    ['a:b,c', 'a:b,c'],
    ['a b', 'a%20b'],
    ['50%', '50%25'],
    ['a/b', 'a%2Fb'],
    ['x%2Fy', 'x%252Fy'],
    ['a?b#c+d', 'a%3Fb%23c%2Bd'],
    ['egyháztörténelem', 'egyh%C3%A1zt%C3%B6rt%C3%A9nelem'],
    ['こんにちは 🙂', '%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%20%F0%9F%99%82'],
  ])('%s is %s, and reads back', (text, encoded) => {
    expect(encodeSegment(text)).toBe(encoded);
    expect(decodeSegment(encoded)).toBe(text);
  });

  it('reads a segment typed raw', () => {
    expect(decodeSegment('egyháztörténelem')).toBe('egyháztörténelem');
  });

  it('reads a malformed escape raw, with no error', () => {
    expect(decodeSegment('50%')).toBe('50%');
    expect(decodeSegment('a%ZZb')).toBe('a%ZZb');
    expect(decodeSegment('%C3')).toBe('%C3');
  });

  it('never throws on a lone surrogate, which encodeURIComponent would', () => {
    expect(encodeSegment('a\uD800b')).toBe('a%EF%BF%BDb');
  });
});

describe('splitPath', () => {
  it('splits on / and decodes each segment', () => {
    expect(splitPath('a%20b/egyh%C3%A1z/c')).toEqual(['a b', 'egyház', 'c']);
  });

  it('keeps a %2F inside its segment', () => {
    expect(splitPath('a%2Fb/c')).toEqual(['a/b', 'c']);
  });

  it('gives no segments for an empty path', () => {
    expect(splitPath('')).toEqual([]);
    expect(splitPath('/')).toEqual([]);
  });

  it('takes a leading or a trailing slash, and a doubled one, as no segment', () => {
    expect(splitPath('/a/b')).toEqual(['a', 'b']);
    expect(splitPath('a/b/')).toEqual(['a', 'b']);
    expect(splitPath('a//b')).toEqual(['a', 'b']);
  });

  it('reads a malformed escape in a typed address raw, the other segments decoded', () => {
    expect(splitPath('egyh%C3%A1z/50%')).toEqual(['egyház', '50%']);
  });
});

describe('joinPath', () => {
  it('puts the encoded segments below the base, as the base was given', () => {
    expect(joinPath('/hu/p%C3%A1lya', ['a/b', 'c d'])).toBe('/hu/p%C3%A1lya/a%2Fb/c%20d');
  });

  it('gives the base alone without segments', () => {
    expect(joinPath('/hu/pongracz', [])).toBe('/hu/pongracz');
  });

  it('takes a base with a trailing slash, and the root', () => {
    expect(joinPath('/hu/pongracz/', [])).toBe('/hu/pongracz');
    expect(joinPath('/hu/pongracz/', ['a'])).toBe('/hu/pongracz/a');
    expect(joinPath('/', [])).toBe('/');
    expect(joinPath('/', ['a'])).toBe('/a');
  });
});

describe('readPath', () => {
  const read = (tokens: readonly ResolvedPathToken[], ...segments: string[]) => Object.fromEntries(readPath(tokens, segments));

  it('a token takes the next segment; without one its key is absent', () => {
    const tokens = resolved(token(arg('a')), token(arg('b')));
    expect(read(tokens, 'x', 'y')).toEqual({ a: 'x', b: 'y' });
    expect(read(tokens, 'x')).toEqual({ a: 'x' });
    expect(read(tokens)).toEqual({});
  });

  it('a vanishing token takes a segment among its allowed values', () => {
    expect(read(resolved(vanishing(VARIANT), rest(TASK)), 'modern', 's19')).toEqual({ variant: 'modern', task: 's19' });
  });

  it('a vanishing token that does not allow the segment reads absent, and the next token reads the same segment', () => {
    expect(read(resolved(vanishing(VARIANT), rest(TASK)), 's19')).toEqual({ task: 's19' });
    expect(read(resolved(vanishing(VARIANT), token(arg('a')), token(arg('b'))), 'x', 'y')).toEqual({ a: 'x', b: 'y' });
  });

  it('a vanishing token with no segment left reads absent', () => {
    expect(read(resolved(vanishing(VARIANT), rest(TASK)))).toEqual({});
  });

  it('several vanishing tokens each look at the same segment until one takes it', () => {
    const tokens = resolved(vanishing(arg('v'), { allowedValues: ['a'] }), vanishing(arg('w'), { allowedValues: ['b'] }), rest(TASK));
    expect(read(tokens, 'b', 'c')).toEqual({ w: 'b', task: 'c' });
    expect(read(tokens, 'a', 'b')).toEqual({ v: 'a', w: 'b' });
    expect(read(tokens, 'c')).toEqual({ task: 'c' });
  });

  it('a vanishing token recognises its value by membership, whatever the next token would take', () => {
    expect(read(resolved(vanishing(VARIANT), rest(TASK)), 'modern')).toEqual({ variant: 'modern' });
  });

  it('a rest takes all the remaining segments, with slashes', () => {
    expect(read(resolved(token(arg('a')), rest(TASK)), 'x', 'y', 'z')).toEqual({ a: 'x', task: 'y/z' });
  });

  it('a slash inside a rest segment reads as a separator', () => {
    expect(read(resolved(rest(TASK)), 'x', 'a/b')).toEqual({ task: 'x/a/b' });
  });

  it('a slash inside a token segment stays in its value', () => {
    expect(read(resolved(token(arg('a')), token(arg('b'))), 'x/y', 'z')).toEqual({ a: 'x/y', b: 'z' });
  });

  it('ignores the segments beyond the tokens', () => {
    expect(read(resolved(token(arg('a'))), 'x', 'y', 'z')).toEqual({ a: 'x' });
  });

  it('reads nothing without tokens', () => {
    expect(read(resolved(), 'x')).toEqual({});
  });
});

describe('buildPath', () => {
  const build = (tokens: readonly ResolvedPathToken[], values: Record<string, string | undefined>) => buildPath(tokens, new Map(Object.entries(values)));

  it('gives the tokens\' values in order, whatever the order of the values', () => {
    expect(build(resolved(token(arg('a')), token(arg('b'))), { b: 'y', a: 'x' })).toEqual({ segments: ['x', 'y'] });
  });

  it('an absent vanishing or rest token leaves no segment', () => {
    const tokens = resolved(vanishing(VARIANT), rest(TASK));
    expect(build(tokens, {})).toEqual({ segments: [] });
    expect(build(tokens, { task: 's19' })).toEqual({ segments: ['s19'] });
    expect(build(tokens, { variant: 'modern' })).toEqual({ segments: ['modern'] });
    expect(build(tokens, { variant: 'modern', task: 's19' })).toEqual({ segments: ['modern', 's19'] });
  });

  it('an empty value is removal', () => {
    expect(build(resolved(vanishing(VARIANT), rest(TASK)), { variant: '', task: '' })).toEqual({ segments: [] });
    expect(build(resolved(token(arg('a'))), { a: '' })).toEqual({ segments: [] });
    expect(build(resolved(token(arg('a'))), { a: undefined })).toEqual({ segments: [] });
  });

  it('a token\'s slash stays in its one segment, a rest\'s slashes separate', () => {
    expect(build(resolved(token(arg('a')), rest(TASK)), { a: 'x/y', task: 'p/q' })).toEqual({ segments: ['x/y', 'p', 'q'] });
  });

  it('ignores keys that are no tokens', () => {
    expect(build(resolved(token(arg('a'))), { a: 'x', filter: 'y' })).toEqual({ segments: ['x'] });
  });

  describe('refuses, naming the key and the reason', () => {
    const refusal = (key: string, reason: RegExp) => ({ refused: { key, reason: expect.stringMatching(reason) } });

    it.each([['.'], ['..']])('%s as a token\'s value', (value) => {
      expect(build(resolved(token(arg('a'))), { a: value })).toEqual(refusal('a', /resolve/));
      expect(build(resolved(vanishing(arg('v'), { allowedValues: [value] })), { v: value })).toEqual(refusal('v', /resolve/));
    });

    it.each([['.'], ['..'], ['a/./b'], ['a/../b'], ['../x'], ['x/..']])('%s in a rest\'s value', (value) => {
      expect(build(resolved(rest(TASK)), { task: value })).toEqual(refusal('task', /resolve/));
    });

    it.each([['/a'], ['a/'], ['a//b'], ['/']])('an empty segment in a rest\'s value, %s', (value) => {
      expect(build(resolved(rest(TASK)), { task: value })).toEqual(refusal('task', /empty segment/));
    });

    it('a token without a value while a later token has one, naming the token and the later one', () => {
      expect(build(resolved(token(arg('a')), token(arg('b'))), { b: 'y' })).toEqual(refusal('a', /'b'.*shift/));
      expect(build(resolved(token(arg('a')), rest(TASK)), { task: 'y' })).toEqual(refusal('a', /'task'.*shift/));
      expect(build(resolved(token(arg('a')), vanishing(VARIANT)), { variant: 'modern' })).toEqual(refusal('a', /'variant'.*shift/));
    });

    it('a vanishing value outside its allowed values', () => {
      expect(build(resolved(vanishing(VARIANT)), { variant: 'ancient' })).toEqual(refusal('variant', /'ancient'.*allowed/));
    });

    it('a value whose first segment an earlier vanished token would claim', () => {
      expect(build(resolved(vanishing(VARIANT), rest(TASK)), { task: 'modern' })).toEqual(refusal('task', /'modern'.*'variant'/));
      expect(build(resolved(vanishing(VARIANT), rest(TASK)), { task: 'modern/s19' })).toEqual(refusal('task', /'modern\/s19'.*'variant'/));
      expect(build(resolved(vanishing(VARIANT), token(arg('a'))), { a: 'original' })).toEqual(refusal('a', /'original'.*'variant'/));
    });

    it('a value only a vanished token further back would claim, across another vanished token', () => {
      const tokens = resolved(vanishing(VARIANT), vanishing(arg('w'), { allowedValues: ['b'] }), rest(TASK));
      expect(build(tokens, { task: 'modern' })).toEqual(refusal('task', /'variant'/));
      expect(build(tokens, { task: 'b' })).toEqual(refusal('task', /'w'/));
    });

    it('one vanishing token\'s value that an earlier vanished one would claim', () => {
      const tokens = resolved(vanishing(arg('v'), { allowedValues: ['a'] }), vanishing(arg('w'), { allowedValues: ['a', 'b'] }));
      expect(build(tokens, { w: 'a' })).toEqual(refusal('w', /'v'/));
      expect(build(tokens, { w: 'b' })).toEqual({ segments: ['b'] });
    });

    it('a value with a lone surrogate, which cannot be encoded', () => {
      expect(build(resolved(token(arg('a'))), { a: 'x\uD800' })).toEqual(refusal('a', /broken character/));
      expect(build(resolved(rest(TASK)), { task: 'x/\uDC00' })).toEqual(refusal('task', /broken character/));
    });
  });

  it('allows a value named like a value of a vanishing token that has a value itself', () => {
    expect(build(resolved(vanishing(VARIANT), rest(TASK)), { variant: 'original', task: 'modern' })).toEqual({ segments: ['original', 'modern'] });
  });

  it('allows a value named like a value of a vanished token that a segment has passed', () => {
    const tokens = resolved(vanishing(VARIANT), token(arg('a')), rest(TASK));
    expect(build(tokens, { a: 'x', task: 'modern' })).toEqual({ segments: ['x', 'modern'] });
  });

  it('allows a later segment of a rest named like a variant', () => {
    expect(build(resolved(vanishing(VARIANT), rest(TASK)), { task: 's19/modern' })).toEqual({ segments: ['s19', 'modern'] });
  });

  it('allows removing a token with nothing after it, and every later vanished token with it', () => {
    expect(build(resolved(token(arg('a')), vanishing(VARIANT), rest(TASK)), {})).toEqual({ segments: [] });
    expect(build(resolved(token(arg('a')), token(arg('b'))), { a: 'x' })).toEqual({ segments: ['x'] });
  });

  it('allows a slash, three dots and a dotted name, none of them a dot segment', () => {
    expect(build(resolved(token(arg('a')), rest(TASK)), { a: 'a/..', task: '.../resz.1-kep/.x' })).toEqual({ segments: ['a/..', '...', 'resz.1-kep', '.x'] });
  });
});

describe('a value through the whole trip: built, encoded, a browser\'s URL parser, split, read', () => {
  const trip = (tokens: readonly ResolvedPathToken[], key: string, value: string) => {
    const built = buildPath(tokens, new Map([[key, value]]));
    if ('refused' in built) throw new Error(built.refused.reason);
    const pathname = joinPath('/hu/m', built.segments);
    const parsed = new URL(`http://h${pathname}`).pathname;
    return { pathname, parsed, read: readPath(tokens, splitPath(parsed).slice(2)).get(key) };
  };

  it.each([
    ['s19~modern', '/hu/m/s19~modern'],
    ['resz.1-kep', '/hu/m/resz.1-kep'],
    ['a@b_c', '/hu/m/a@b_c'],
    ['a:b,c', '/hu/m/a:b,c'],
    ['a b', '/hu/m/a%20b'],
    ['50%', '/hu/m/50%25'],
    ['x%2Fy', '/hu/m/x%252Fy'],
    ['a?b#c+d', '/hu/m/a%3Fb%23c%2Bd'],
    ['egyháztörténelem', '/hu/m/egyh%C3%A1zt%C3%B6rt%C3%A9nelem'],
  ])('%s, in a token and in a rest', (value, address) => {
    for (const tokens of [resolved(token(TASK)), resolved(rest(TASK))]) {
      const { pathname, parsed, read } = trip(tokens, 'task', value);
      expect(pathname).toBe(address);
      expect(parsed).toBe(address);
      expect(read).toBe(value);
    }
  });

  it('a/b in a token is %2F, and reads back in its one segment', () => {
    const { pathname, parsed, read } = trip(resolved(token(TASK), token(arg('b'))), 'task', 'a/b');
    expect(pathname).toBe('/hu/m/a%2Fb');
    expect(parsed).toBe('/hu/m/a%2Fb');
    expect(read).toBe('a/b');
  });

  it('a/b in a rest is two segments, and reads back whole', () => {
    const { pathname, parsed, read } = trip(resolved(rest(TASK)), 'task', 'a/b');
    expect(pathname).toBe('/hu/m/a/b');
    expect(parsed).toBe('/hu/m/a/b');
    expect(read).toBe('a/b');
  });

  it('an allowed vanishing value with an accent', () => {
    const { pathname, read } = trip(resolved(vanishing(arg('v'), { allowedValues: ['régi'] }), rest(TASK)), 'v', 'régi');
    expect(pathname).toBe('/hu/m/r%C3%A9gi');
    expect(read).toBe('régi');
  });
});

describe('every small token list with every value', () => {
  const KINDS: ((key: string) => PathToken)[] = [
    (key) => token(arg(key)),
    (key) => vanishing(arg(key), { allowedValues: ['a'] }),
    (key) => vanishing(arg(key), { allowedValues: ['a', 'b'] }),
  ];
  const listsOver = ([key, ...others]: string[]): PathToken[][] => {
    if (others.length === 0) return [...KINDS.map((make) => [make(key)]), [rest(arg(key))]];
    return listsOver(others).flatMap((tail) => KINDS.map((make) => [make(key), ...tail]));
  };
  const valuesOver = ([key, ...others]: string[]): Record<string, string>[] => {
    const tails = others.length === 0 ? [{}] : valuesOver(others);
    return tails.flatMap((tail) => [tail, ...['a', 'b', 'c', 'a/b'].map((value) => ({ [key]: value, ...tail }))]);
  };

  it('buildPath refuses exactly what would not read back, and what it builds reads back through the encoder', () => {
    let built = 0;
    let refused = 0;
    const wrong: unknown[] = [];
    for (const keys of [['p'], ['p', 'q'], ['p', 'q', 's']]) {
      for (const list of listsOver(keys)) {
        const tokens = resolved(...list);
        for (const values of valuesOver(keys)) {
          const plain = tokens.flatMap((t) => {
            const value = values[t.key];
            if (value === undefined) return [];
            return t.kind === 'rest' ? value.split('/') : [value];
          });
          const readsBack = JSON.stringify(Object.fromEntries(readPath(tokens, plain))) === JSON.stringify(Object.fromEntries(tokens.flatMap((t) => (values[t.key] === undefined ? [] : [[t.key, values[t.key]]]))));
          const result = buildPath(tokens, new Map(Object.entries(values)));
          if ('refused' in result) {
            refused += 1;
            if (readsBack) wrong.push({ refusedNeedlessly: list.map((t) => t.kind), values });
            continue;
          }
          built += 1;
          const trip = Object.fromEntries(readPath(tokens, splitPath(joinPath('/', result.segments))));
          if (!readsBack || Object.keys(values).some((key) => trip[key] !== values[key])) wrong.push({ builtWrongly: list.map((t) => t.kind), values, result });
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(built).toBeGreaterThan(100);
    expect(refused).toBeGreaterThan(100);
  });
});

describe('withChanges', () => {
  it('gives a copy with the changes applied, the last change of a key winning', () => {
    const values = new Map([['a', '1'], ['b', '2']]);
    const next = withChanges(values, [{ key: 'a', raw: '9' }, { key: 'c', raw: '3' }, { key: 'c', raw: '4' }]);
    expect(Object.fromEntries(next)).toEqual({ a: '9', b: '2', c: '4' });
    expect(Object.fromEntries(values)).toEqual({ a: '1', b: '2' });
  });

  it('removes a key on undefined and on an empty value', () => {
    const next = withChanges(new Map([['a', '1'], ['b', '2']]), [removalOf('a'), { key: 'b', raw: '' }]);
    expect(next.size).toBe(0);
  });

  it('leaves out what is absent in the values already', () => {
    expect(withChanges(new Map([['a', undefined], ['b', '']]), []).size).toBe(0);
  });
});

describe('goingElsewhere', () => {
  const NOW = new Map([['a', '1'], ['b', '2'], ['c', '3']]);
  const ABC = resolved(token(arg('a')), token(arg('b')), token(arg('c')));
  const STAYS = { elsewhere: false, removals: [] };

  it('a changed token cuts the tokens after it', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '9' }])).toEqual({ elsewhere: true, removals: [removalOf('b'), removalOf('c')] });
    expect(goingElsewhere(ABC, NOW, [{ key: 'b', raw: '9' }])).toEqual({ elsewhere: true, removals: [removalOf('c')] });
  });

  it('the last token changing goes somewhere else, with nothing to cut', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'c', raw: '9' }])).toEqual({ elsewhere: true, removals: [] });
  });

  it('keeps a key named in the same write, in either order', () => {
    const open = { elsewhere: true, removals: [removalOf('c')] };
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '9' }, { key: 'b', raw: '8' }])).toEqual(open);
    expect(goingElsewhere(ABC, NOW, [{ key: 'b', raw: '8' }, { key: 'a', raw: '9' }])).toEqual(open);
  });

  it('keeps a later key the same write names with its present value, or removes', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '9' }, { key: 'c', raw: '3' }])).toEqual({ elsewhere: true, removals: [removalOf('b')] });
    expect(goingElsewhere(ABC, NOW, [{ key: 'c', raw: undefined }, { key: 'a', raw: '9' }])).toEqual({ elsewhere: true, removals: [removalOf('b')] });
  });

  it('removes a later token that has no value now too: the batch may land where it has one', () => {
    expect(goingElsewhere(ABC, new Map([['a', '1']]), [{ key: 'a', raw: '9' }])).toEqual({ elsewhere: true, removals: [removalOf('b'), removalOf('c')] });
  });

  it('a same-value write cuts nothing', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '1' }])).toEqual(STAYS);
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '1' }, { key: 'b', raw: '2' }, { key: 'c', raw: '3' }])).toEqual(STAYS);
  });

  it('a same-value token does not cut, the first token that really changes does', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '1' }, { key: 'b', raw: '9' }])).toEqual({ elsewhere: true, removals: [removalOf('c')] });
  });

  it('a write that ends where it began cuts nothing: the last change of a key counts', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'a', raw: '9' }, { key: 'a', raw: '1' }])).toEqual(STAYS);
  });

  it('removing a token is a change; removing an absent one, or writing it empty, is none', () => {
    expect(goingElsewhere(ABC, NOW, [removalOf('b')])).toEqual({ elsewhere: true, removals: [removalOf('c')] });
    expect(goingElsewhere(ABC, NOW, [{ key: 'b', raw: '' }])).toEqual({ elsewhere: true, removals: [removalOf('c')] });
    expect(goingElsewhere(ABC, new Map(), [removalOf('a')])).toEqual(STAYS);
    expect(goingElsewhere(ABC, new Map(), [{ key: 'a', raw: '' }])).toEqual(STAYS);
    expect(goingElsewhere(ABC, new Map([['a', undefined]]), [{ key: 'a', raw: '' }])).toEqual(STAYS);
  });

  it('a key that is no token changes nothing', () => {
    expect(goingElsewhere(ABC, NOW, [{ key: 'filter', raw: 'x' }])).toEqual(STAYS);
    expect(goingElsewhere(resolved(), new Map(), [{ key: 'filter', raw: 'x' }])).toEqual(STAYS);
  });

  describe('with independent tokens', () => {
    const MIXED = resolved(token(arg('a'), { independent: true }), token(arg('b')), token(arg('c'), { independent: true }), token(arg('d')));
    const ALL = new Map([['a', '1'], ['b', '2'], ['c', '3'], ['d', '4']]);

    it('changing one is not going somewhere else', () => {
      expect(goingElsewhere(MIXED, ALL, [{ key: 'a', raw: '9' }])).toEqual(STAYS);
      expect(goingElsewhere(MIXED, ALL, [{ key: 'c', raw: '9' }])).toEqual(STAYS);
    });

    it('one after the changed token is cut as any other', () => {
      expect(goingElsewhere(MIXED, ALL, [{ key: 'b', raw: '9' }])).toEqual({ elsewhere: true, removals: [removalOf('c'), removalOf('d')] });
    });

    it('the first token that is not independent and changes decides', () => {
      expect(goingElsewhere(MIXED, ALL, [{ key: 'a', raw: '9' }, { key: 'b', raw: '8' }])).toEqual({ elsewhere: true, removals: [removalOf('c'), removalOf('d')] });
      expect(goingElsewhere(MIXED, ALL, [{ key: 'c', raw: '9' }, { key: 'd', raw: '8' }])).toEqual({ elsewhere: true, removals: [] });
    });
  });

  it('a change of the vanishing variant cuts the rest, a change to the task alone cuts nothing before it', () => {
    const tokens = resolved(vanishing(VARIANT), rest(TASK));
    const now = new Map([['variant', 'modern'], ['task', 's19']]);
    expect(goingElsewhere(tokens, now, [removalOf('variant')])).toEqual({ elsewhere: true, removals: [removalOf('task')] });
    expect(goingElsewhere(tokens, now, [{ key: 'task', raw: 's20' }])).toEqual({ elsewhere: true, removals: [] });
  });
});
