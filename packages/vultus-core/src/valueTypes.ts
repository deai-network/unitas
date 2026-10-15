/**
 * How a value is kept in a store as a string (moxb's url-arg types): a URL query, localStorage.
 * A stored string comes from outside (an edited or old URL), so `parse` never throws: a string
 * that stands for no value gives `undefined`, and the caller falls back to its default.
 * `isEqual` is the value's meaning (a list as a set, a range by both ends), used everywhere two
 * values are compared, e.g. to leave a default out of the store.
 */
export interface ValueType<T> {
  parse(raw: string): T | undefined;
  format(value: T): string;
  isEqual(a: T, b: T): boolean;
}

/** A boolean as `1` / `0`; any other string is no value. */
export const booleanType: ValueType<boolean> = {
  parse: (raw) => (raw === '1' ? true : raw === '0' ? false : undefined),
  format: (value) => (value ? '1' : '0'),
  isEqual: (a, b) => a === b,
};

/** A string as itself. */
export const stringType: ValueType<string> = {
  parse: (raw) => raw,
  format: (value) => value,
  isEqual: (a, b) => a === b,
};

/** A set's canonical form: sorted, without duplicates. */
function canonicalSet(items: string[]): string[] {
  return [...new Set(items)].sort();
}

/**
 * A set of strings as a sorted comma list; the empty string is the empty list (so a list
 * present but empty differs from an absent one). Reading drops empty items. An item containing
 * `,` cannot be stored and throws: that is the definer's mistake, not outside input.
 */
export const stringSetType: ValueType<string[]> = {
  parse: (raw) => canonicalSet(raw.split(',').filter((item) => item !== '')),
  format: (value) => {
    const bad = value.find((item) => item.includes(','));
    if (bad !== undefined) throw new Error(`'${bad}' contains ',' and cannot be stored in a list`);
    return canonicalSet(value).join(',');
  },
  isEqual: (a, b) => {
    const x = canonicalSet(a);
    const y = canonicalSet(b);
    return x.length === y.length && x.every((item, i) => item === y[i]);
  },
};

/** A finite number as its decimal string; an empty or non-numeric string is no value. */
export const numberType: ValueType<number> = {
  parse: (raw) => {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  },
  format: (value) => String(value),
  isEqual: (a, b) => a === b,
};

/** A `[from, to]` range as `from..to`; ends that are not numbers, or out of order, are no value. */
export const rangeType: ValueType<[number, number]> = {
  parse: (raw) => {
    const ends = raw.split('..');
    if (ends.length !== 2) return undefined;
    const from = numberType.parse(ends[0]);
    const to = numberType.parse(ends[1]);
    if (from === undefined || to === undefined || from > to) return undefined;
    return [from, to];
  },
  format: ([from, to]) => `${from}..${to}`,
  isEqual: (a, b) => a[0] === b[0] && a[1] === b[1],
};
