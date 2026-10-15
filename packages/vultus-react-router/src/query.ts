import type { RawChange } from 'vultus-core';

/**
 * A location's query (`?a=1&b=2`, the `?` optional) as a map, decoded with URLSearchParams
 * semantics (so a `+` reads as a space). A repeated key gives its first value, as
 * `URLSearchParams.get` does.
 */
export function readQuery(search: string): Map<string, string> {
  const query = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(search)) {
    if (!query.has(key)) query.set(key, value);
  }
  return query;
}

/** A key or value percent-encoded, but with `,` and `/` left readable (`.` never is encoded); a space is `%20`, so `+` never appears. */
function encode(text: string): string {
  return encodeURIComponent(text).replace(/%2C/g, ',').replace(/%2F/g, '/');
}

/**
 * A query as a location's `search`: `''` when empty, else `?k=v&...` (an empty value as `k=`).
 * Keys and values are percent-encoded except `,`, `..` and `/`, so lists and ranges stay
 * readable in the address bar; `readQuery` reads it back unchanged.
 */
export function writeQuery(query: Iterable<readonly [string, string]>): string {
  const parts: string[] = [];
  for (const [key, value] of query) parts.push(`${encode(key)}=${encode(value)}`);
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

/**
 * `search` with `changes` applied in order, written by `writeQuery`. A changed key keeps the place
 * of its first occurrence (later copies of it are dropped); a new key goes last; `raw: undefined`
 * removes every occurrence. Every other parameter keeps its value and place, a repeated one too.
 */
export function applyChanges(search: string, changes: readonly RawChange[]): string {
  let pairs: [string, string][] = [...new URLSearchParams(search)];
  for (const { key, raw } of changes) {
    if (raw === undefined) {
      pairs = pairs.filter(([k]) => k !== key);
      continue;
    }
    const first = pairs.findIndex(([k]) => k === key);
    if (first === -1) {
      pairs.push([key, raw]);
      continue;
    }
    pairs = pairs.filter(([k], i) => k !== key || i === first);
    pairs[first] = [key, raw];
  }
  return writeQuery(pairs);
}
