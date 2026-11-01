import { createContext, useContext, version, type CSSProperties, type HTMLAttributes, type ReactElement } from 'react';
import type { ChangeMarkProps, ChangeMarkVariant } from '../Components.js';

/** The fallback's colours: fixed, whatever the theme, and translucent, so they read on a light and
 *  a dark background alike (GitHub's diff green and red). */
const ADDED = 'rgba(46, 160, 67, 0.3)';
const REMOVED = 'rgba(248, 81, 73, 0.3)';

/** Each variant's inline style. Every one sets the colour and the background, so a `mark`'s own
 *  (the browser's `Mark` and `MarkText`) never show: a word and its letters in it add up, the
 *  letters the stronger. */
const STYLES: Readonly<Record<ChangeMarkVariant, CSSProperties>> = {
  change: { color: 'inherit', backgroundColor: ADDED },
  'change-strong': { color: 'inherit', backgroundColor: ADDED },
  'change-added': { color: 'inherit', backgroundColor: ADDED },
  'change-removed': {
    color: 'inherit', backgroundColor: REMOVED, textDecoration: 'line-through', WebkitUserSelect: 'none', userSelect: 'none',
  },
  'change-replaced': { color: 'inherit', backgroundColor: 'transparent' },
};

/** Removed letters inside a replacement: not displayed, the replacement drawn as its new letters. */
const HIDDEN: CSSProperties = { ...STYLES['change-removed'], display: 'none' };

/** Whether a mark is inside a replacement (`change-replaced`). */
const InReplacement = createContext(false);

/**
 * `inert` as a React of `reactVersion` takes it: a boolean from 19 on; 18 drops a boolean (with a
 * warning) and needs the empty string, which 19 reads as false. Exported for its test only.
 */
export function inertProps(reactVersion: string): Pick<HTMLAttributes<HTMLElement>, 'inert'> {
  const props = Number.parseInt(reactVersion, 10) >= 19 ? { inert: true } : { inert: '' };
  return props as unknown as Pick<HTMLAttributes<HTMLElement>, 'inert'>;
}

const inert = inertProps(version);

/**
 * vultus's change mark, for a page that lends none (`VultusComponents`' `ChangeMark`): static marks
 * in inline styles, no stylesheet and no animation (`timeline` and `speed` change nothing; its
 * timings are vultus's defaults, `changeDurations`). A `mark` carrying `data-change`:
 * - `change`, `change-strong` and `change-added`, a translucent green background;
 * - `change-removed`, a translucent red background, struck through; hidden from assistive
 *   technology, the tab order and a selection (`aria-hidden`, `inert`, `user-select: none`): the
 *   old letters are not the page's text;
 * - `change-replaced`, drawn as its new letters: no background of its own, the old letters in it
 *   not displayed.
 */
export function FallbackMark({ variant, 'data-change': change, children }: ChangeMarkProps): ReactElement {
  const replacing = useContext(InReplacement);
  if (variant === 'change-replaced') {
    return <mark data-change={change} style={STYLES[variant]}><InReplacement.Provider value>{children}</InReplacement.Provider></mark>;
  }
  if (variant === 'change-removed') {
    return <mark data-change={change} style={replacing ? HIDDEN : STYLES[variant]} aria-hidden="true" {...inert}>{children}</mark>;
  }
  return <mark data-change={change} style={STYLES[variant]}>{children}</mark>;
}
