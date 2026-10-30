import {
  resolveIn,
  type ArgDefinition, type FieldCtx, type FieldDefinition, type OneOfChoice, type RawChange,
} from 'vultus-core';

/** A one-of field's definition: the only field a `vanishing` token can take its allowed values from. */
export type OneOfDefinition = Extract<FieldDefinition, { kind: 'oneOf' }>;

export interface PathTokenOptions {
  /** Changing this token is not going somewhere else: the later tokens and the query stay. Default false. */
  independent?: boolean;
}

/** What every token says, its allowed values at hand or not. */
interface TokenFacts {
  key: string;
  independent: boolean;
}

/**
 * One argument's place in the path below the store's route, made by `token`, `vanishing` or `rest`
 * from its definition. A `vanishing` token holds how to get its allowed values, as a one-of field's
 * choices may be a function of the field context; `resolveTokens` gets them.
 */
export type PathToken = TokenFacts & (
  | { kind: 'token' | 'rest' }
  | { kind: 'vanishing'; allowedIn(ctx: FieldCtx): readonly string[] }
);

/** A token with its allowed values at hand, as `resolveTokens` gives it: what `readPath` and `buildPath` walk over. */
export type ResolvedPathToken = TokenFacts & (
  | { kind: 'token' | 'rest' }
  | { kind: 'vanishing'; allowed: ReadonlySet<string> }
);

/** The tokens' raw values by key; a key that is missing, `undefined` or empty has none. */
export type PathValues = ReadonlyMap<string, string | undefined>;

/** What the URL layout is made of: an argument's definition or a field's. */
export type PathDefinition = ArgDefinition<any> | FieldDefinition;

/** The key a definition's value is stored under: an argument's `key`, a field's `id`. */
export function keyOf(definition: PathDefinition): string {
  return 'key' in definition ? definition.key : definition.id;
}

/** One segment, required by the tokens after it: without its value, a later value would shift to its place. */
export function token(definition: PathDefinition, options: PathTokenOptions = {}): PathToken {
  return { key: keyOf(definition), kind: 'token', independent: options.independent ?? false };
}

/** All the remaining segments, slashes included. Only as the last token; `resolveTokens` throws otherwise. */
export function rest(definition: PathDefinition, options: PathTokenOptions = {}): PathToken {
  return { key: keyOf(definition), kind: 'rest', independent: options.independent ?? false };
}

/**
 * One segment, or none: a segment belongs to it only if it is among its allowed values, otherwise
 * it reads as absent and the next token reads the same segment. A one-of field's allowed values are
 * its choices' values, disabled ones too (a stored value that fits them is the field's: see
 * sanitizeStored); a bare argument holds no choices, so it takes its raw values as `allowedValues`.
 * There is no default here: an absent key already reads as the argument's default, and writing the
 * default already removes the key.
 */
export function vanishing(definition: OneOfDefinition, options?: PathTokenOptions): PathToken;
export function vanishing(definition: ArgDefinition<any>, options: PathTokenOptions & { allowedValues: readonly string[] }): PathToken;
export function vanishing(
  definition: OneOfDefinition | ArgDefinition<any>,
  options: PathTokenOptions & { allowedValues?: readonly string[] } = {},
): PathToken {
  const key = keyOf(definition);
  const independent = options.independent ?? false;
  if ('key' in definition) {
    const { allowedValues } = options;
    if (allowedValues === undefined) throw new Error(`Path token '${key}': a vanishing argument needs its allowedValues`);
    return { key, kind: 'vanishing', independent, allowedIn: () => allowedValues };
  }
  if (definition.kind !== 'oneOf') throw new Error(`Path token '${key}': a vanishing field must be a one-of field`);
  return {
    key,
    kind: 'vanishing',
    independent,
    allowedIn: (ctx) => resolveIn<OneOfChoice[]>(definition.choices, [], ctx, `Field '${key}': option 'choices'`).map((c) => c.value),
  };
}

/** A compile-time check: `vanishing` takes its allowed values from a one-of field's choices, or from the caller for a bare argument, and from nowhere else. */
function vanishingKnowsItsValues(
  arg: ArgDefinition<string>,
  oneOf: OneOfDefinition,
  text: Extract<FieldDefinition, { kind: 'text' }>,
  field: FieldDefinition,
): unknown {
  return [
    vanishing(oneOf),
    vanishing(oneOf, { independent: true }),
    vanishing(arg, { allowedValues: ['a'] }),
    // @ts-expect-error -- a bare argument holds no choices.
    vanishing(arg),
    // @ts-expect-error -- a bare argument holds no choices.
    vanishing(arg, { independent: true }),
    // @ts-expect-error -- a text field has no choices.
    vanishing(text),
    // @ts-expect-error -- a text field has no choices, and does not get them this way.
    vanishing(text, { allowedValues: ['a'] }),
    // @ts-expect-error -- a definition typed as any field is not known to be a one-of field.
    vanishing(field),
    // @ts-expect-error -- a one-of field's choices are its allowed values: they are not said twice.
    vanishing(oneOf, { allowedValues: ['a'] }),
  ];
}

/**
 * The tokens with their allowed values, for a render of the store: a function of the context is
 * resolved here with the store's field context, so `readPath` and `buildPath` never call a
 * definition's function, and such a function's error comes up in the render. A list that cannot
 * work (a `rest` that is not last, two tokens with one key) is the definer's mistake and throws.
 */
export function resolveTokens(tokens: readonly PathToken[], ctx: FieldCtx): ResolvedPathToken[] {
  const keys = new Set<string>();
  return tokens.map((t, i) => {
    if (keys.has(t.key)) throw new Error(`Path tokens: two tokens have the key '${t.key}'`);
    keys.add(t.key);
    if (t.kind === 'rest' && i < tokens.length - 1) throw new Error(`Path tokens: the rest token '${t.key}' must be the last`);
    if (t.kind !== 'vanishing') return t;
    const { allowedIn, ...facts } = t;
    return { ...facts, allowed: new Set(allowedIn(ctx)) };
  });
}

/**
 * One path segment's text (or the fragment's) percent-encoded as `encodeURIComponent` does, but
 * with `@`, `:` and `,` left readable (`~ . _` never are encoded), so a `/` is `%2F`. A lone
 * surrogate, on which `encodeURIComponent` throws, is U+FFFD, as a URL parser makes it.
 */
export function encodeSegment(text: string): string {
  return encodeURIComponent(text.replace(/\p{Cs}/gu, '�')).replace(/%40/g, '@').replace(/%3A/g, ':').replace(/%2C/g, ',');
}

/** A segment's text; a malformed escape, as in a typed address, reads raw. */
export function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * A path's segments, decoded one by one, so a `%2F` stays inside its segment. A leading, trailing
 * or doubled `/` of a typed address gives no segment (an empty value is no value).
 */
export function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '').map(decodeSegment);
}

/** The pathname with `segments` encoded below `base`, which is kept as given: `base` alone without segments. */
export function joinPath(base: string, segments: readonly string[]): string {
  const stem = base.replace(/\/+$/, '');
  if (segments.length === 0) return stem === '' ? '/' : stem;
  return `${stem}/${segments.map(encodeSegment).join('/')}`;
}

/**
 * The tokens' raw values in decoded `segments` (from `splitPath`): a `token` takes the next
 * segment if any, a `vanishing` token takes it if allowed and else leaves it, a `rest` takes the
 * remaining ones joined with `/` (so a `%2F` of a typed address inside them reads as a separator).
 * A token without a segment has no key in the result; segments beyond the tokens are ignored.
 */
export function readPath(tokens: readonly ResolvedPathToken[], segments: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  let next = 0;
  for (const t of tokens) {
    if (next === segments.length) break;
    if (t.kind === 'rest') {
      values.set(t.key, segments.slice(next).join('/'));
      next = segments.length;
    } else if (t.kind !== 'vanishing' || t.allowed.has(segments[next])) {
      values.set(t.key, segments[next]);
      next += 1;
    }
  }
  return values;
}

/** Why a store cannot write a value: the key to name, and a readable reason (which goes after the key in a warning). */
export interface PathRefusal {
  key: string;
  reason: string;
}

/** What `buildPath` gives: the decoded segments, each one encoded by `joinPath`, or why not. */
export type BuiltPath = { segments: string[] } | { refused: PathRefusal };

/** What is wrong with a value's `segment`, if anything: a URL cannot hold it, or a browser's URL parser would not keep it. */
function wrongWith(segment: string): string | undefined {
  if (segment === '') return 'has an empty segment';
  if (segment === '.' || segment === '..') return `has the segment '${segment}', which a browser would resolve away`;
  if (/\p{Cs}/u.test(segment)) return 'has a broken character (a lone surrogate)';
  return undefined;
}

/**
 * The decoded segments for `values`, which `readPath` reads back the same: an absent `vanishing`
 * or `rest` token leaves no segment, and an empty value is no value. A value of a `rest` is
 * split on `/`; one of a `token` or a `vanishing` token stays one segment. Values that cannot be
 * represented are refused rather than thrown on: `.`, `..` or an empty segment; a `token` without a
 * value while a later token has one (the path would shift); a `vanishing` value outside its allowed
 * values; a value whose first segment an earlier vanished token would claim (a task named like a
 * variant). Keys that are no tokens are ignored.
 */
export function buildPath(tokens: readonly ResolvedPathToken[], values: PathValues): BuiltPath {
  const segments: string[] = [];
  // The vanished tokens the next segment would pass when read: those since the last segment placed.
  let vanished: Extract<ResolvedPathToken, { kind: 'vanishing' }>[] = [];
  for (const [i, t] of tokens.entries()) {
    const { key } = t;
    const value = values.get(key);
    if (value === undefined || value === '') {
      if (t.kind === 'vanishing') vanished.push(t);
      const later = t.kind === 'token' ? tokens.slice(i + 1).find((other) => values.get(other.key)) : undefined;
      if (later !== undefined) {
        return { refused: { key, reason: `has no value while the later token '${later.key}' has one, so the path would shift` } };
      }
      continue;
    }
    const own = t.kind === 'rest' ? value.split('/') : [value];
    for (const segment of own) {
      const wrong = wrongWith(segment);
      if (wrong !== undefined) return { refused: { key, reason: `value '${value}' ${wrong}` } };
    }
    if (t.kind === 'vanishing' && !t.allowed.has(value)) {
      return { refused: { key, reason: `value '${value}' is not among its allowed values` } };
    }
    const claimer = vanished.find((earlier) => earlier.allowed.has(own[0]));
    if (claimer !== undefined) {
      return { refused: { key, reason: `value '${value}' would read as the token '${claimer.key}', which has no value now and allows '${own[0]}'` } };
    }
    segments.push(...own);
    vanished = [];
  }
  return { segments };
}

/** A copy of `values` with `changes` applied in order (the last change of a key wins), `undefined` and an empty value removing the key. */
export function withChanges(values: PathValues, changes: readonly RawChange[]): Map<string, string> {
  const next = new Map<string, string>();
  for (const [key, raw] of values) if (raw) next.set(key, raw);
  for (const { key, raw } of changes) {
    if (raw) next.set(key, raw);
    else next.delete(key);
  }
  return next;
}

/** What a write means for the path: whether it goes somewhere else, and the tokens' removals that implies. */
export interface GoingElsewhere {
  /** Whether a token that is not `independent` really changes; the store then also drops the query keys the rule says. */
  elsewhere: boolean;
  /** To join the write's changes. Without a value now too: a batch may land where such a token has one. */
  removals: RawChange[];
}

/**
 * Whether `changes` go somewhere else from the tokens' `current` values: the first token that is
 * not `independent` and whose value really changes cuts every token after it, `independent` ones
 * too, except keys named in the same write. It goes by the tokens' order, so "open this task with
 * these filters" is one write, in any order; a write that changes no such token cuts nothing.
 */
export function goingElsewhere(tokens: readonly TokenFacts[], current: PathValues, changes: readonly RawChange[]): GoingElsewhere {
  const next = withChanges(current, changes);
  const first = tokens.findIndex((t) => !t.independent && (current.get(t.key) || undefined) !== next.get(t.key));
  if (first === -1) return { elsewhere: false, removals: [] };
  const named = new Set(changes.map((change) => change.key));
  return {
    elsewhere: true,
    removals: tokens.slice(first + 1).filter((t) => !named.has(t.key)).map((t) => ({ key: t.key, raw: undefined })),
  };
}
