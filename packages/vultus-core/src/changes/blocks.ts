/**
 * The block elements: a hard feed before and after each in the reading (`readText`), so that no
 * change runs across one's edge.
 */
export const BLOCK_ELEMENTS: ReadonlySet<string> = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'tr', 'ul',
]);

/** Elements holding blocks, not text: the white space among their children (remark-rehype's line
 *  ends) is never marked (a mark there would draw an empty line). */
export const HOLDS_BLOCKS: ReadonlySet<string> = new Set([
  'blockquote', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'section', 'div',
]);

/**
 * The blocks the changes plugin numbers by default (`data-vultus-block`, pre-order from 1), which a
 * near set names: what the reader's eye rests on. A quote and the paragraph in it, a list item and
 * a nested item, are each one.
 */
export const NUMBERED_BLOCKS: ReadonlySet<string> = new Set([
  'p', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'td', 'th',
]);
