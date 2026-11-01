import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from 'react';
// Types only: the main entry never loads `vultus-core/changes` (nor diff-match-patch).
import type { ChangeDurations, ChangeSpeed } from './changes/changeDurations.js';
import type { ChangeLevel } from './changes/changesIn.js';

/** A spinner an app lends to vultus/optio, rendered in place of their native loading indicators. */
export interface SpinnerProps {
  /** The spinner's identity: stable across re-renders and remounts, unique on the page (after scoping). */
  spinnerKey: string;
  /** antd's names (the height of antd's Spin indicator) or a height in px. */
  size?: 'small' | 'default' | 'large' | number;
  /** Accessible label; the spinner's own default when omitted. */
  label?: string;
}
export type SpinnerComponent = ComponentType<SpinnerProps>;

/**
 * What a change mark draws (`vultus-core/changes`): `change`, a changed word, lightly;
 * `change-strong`, its changed letters inside it, more strongly (a switch with no removed letters);
 * on a switch with removed letters, `change-removed`, the old letters that went, at their place,
 * and `change-added`, the new ones; `change-replaced`, a replacement, around exactly one
 * `change-removed` and one `change-added` (old and new letters at one place).
 */
export type ChangeMarkVariant = 'change' | 'change-strong' | 'change-removed' | 'change-added' | 'change-replaced';

/**
 * A change mark's props, as vultus's text changes give them, one mark per change, nested as the
 * changes are (letters inside their word). Each switch's marks are new elements (vultus keys them
 * by the switch), so a look timed from its element's insertion starts with each switch.
 */
export interface ChangeMarkProps {
  variant: ChangeMarkVariant;
  /** On a word (`change`), while the switch is on the removals timeline: it waits with the
   *  removed and added letters, holding them or not. */
  timeline?: 'removals';
  /** How fast the switch's marks run, the same for every mark of it; none: normal. */
  speed?: ChangeSpeed;
  /** The change's level, for the element the mark draws (`[data-change]`). */
  'data-change': ChangeLevel;
  children?: ReactNode;
}

/**
 * A change mark an app lends to vultus's text changes: a component drawing one mark, and, as a
 * static property, `durations`: when a switch's marks may go, in ms from the commit that shows the
 * new text, at `speed`, read at `element` (the near container, else none). The timings belong to
 * the look, so they travel with it. Without `durations`, vultus's defaults; without a lent mark,
 * vultus's fallback: static marks, inline styles.
 *
 * A mark keeps removed letters away from assistive technology, the tab order and a selection
 * (`aria-hidden`, `inert`, `user-select: none`): they are not the page's text.
 */
export type ChangeMarkComponent = ComponentType<ChangeMarkProps> & {
  durations?(element: Element | undefined, speed: ChangeSpeed): ChangeDurations;
};

/** Components an app lends to the libraries. */
export interface VultusComponents {
  Spinner?: SpinnerComponent;
  /** The change marks of `vultus-core/changes`. */
  ChangeMark?: ChangeMarkComponent;
}

/**
 * The components an app lends to vultus/optio in place of their own UI. Default is `{}`
 * (none lent) so vultus-core stays framework-neutral; vultus-antd's `VultusProvider` merges
 * in whatever an app passes as `components`.
 */
export const VultusComponentsContext = createContext<VultusComponents>({});

export function useVultusComponents(): VultusComponents {
  return useContext(VultusComponentsContext);
}

/** The scope path (segment names, outermost first) that `useSpinnerKey` prefixes onto local keys. */
const SpinnerScopeContext = createContext<string[]>([]);

/** Prefixes every spinner key below with `name` (scopes nest: outer/inner). */
export function SpinnerScope({ name, children }: { name: string; children?: ReactNode }) {
  const outer = useContext(SpinnerScopeContext);
  // Memoized so consumers below (useSpinnerKey, via SpinnerScopeContext) don't re-render
  // on every SpinnerScope re-render — only when the scope path actually changes. Matters
  // once whole conversation views sit inside a SpinnerScope.
  const scope = useMemo(() => [...outer, name], [outer, name]);
  return <SpinnerScopeContext.Provider value={scope}>{children}</SpinnerScopeContext.Provider>;
}

/** The scoped key for a library-local key: 'outer/inner/local', or 'local' outside any scope. */
export function useSpinnerKey(localKey: string): string {
  const scope = useContext(SpinnerScopeContext);
  return [...scope, localKey].join('/');
}
