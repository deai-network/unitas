/**
 * The first words of a label, about `max` characters, for a one-line summary
 * (Taskmaster's): "Logikai következtetés…". A label of at most `max`
 * characters stays whole. A longer one is cut at the last word boundary within
 * `max` (a word ending exactly there stays), with "…", never ending on one of
 * `joiningWords` ("Gráfok és…"; compared case-insensitively; the first word
 * stays even so) or on `,`, `;` or `:`. A first word longer than `max` stays
 * whole, rather than leaving just "…".
 */
export function firstWords(name: string, max: number, joiningWords: string[]): string {
  if (name.length <= max) return name;
  let words = name.slice(0, max + 1).split(' ').slice(0, -1);
  if (words.length === 0) {
    const first = name.split(' ')[0];
    if (first === name) return name;
    words = [first];
  }
  const joining = new Set(joiningWords.map((w) => w.toLowerCase()));
  while (words.length > 1 && joining.has(words[words.length - 1].toLowerCase())) words.pop();
  return `${words.join(' ').replace(/[,;:]$/, '')}…`;
}
