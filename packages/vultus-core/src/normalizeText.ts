/**
 * A key for accent- and case-insensitive comparison of labels (the tree hook's search,
 * Taskmaster's): decompose, strip the combining marks, lower-case. No quaesitor dependency.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
