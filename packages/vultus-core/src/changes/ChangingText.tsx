import type { Element, ElementContent, Root } from 'hast';
import { Fragment, useMemo, type ReactElement, type ReactNode } from 'react';
import type { ChangeComponents } from './ChangeMark.js';
import type { ChangeSpeed } from './changeDurations.js';
import { useTextChanges } from './useTextChanges.js';

export interface ChangingTextProps {
  /** The string's identity: same key, new string animates; a new key swaps plainly. */
  changeKey: string;
  /** `false`: swap plainly once, under the same key too. */
  animate?: boolean;
  /** How fast a switch's marks run (`useTextChanges`' `speed`): `normal` by default, held per switch. */
  speed?: ChangeSpeed;
  children: string;
}

/**
 * A plain string whose changes light up (spec 7): `useTextChanges` for one string, with its key
 * semantics (`changeKey`, `animate`) and `speed`. Rendered as it is, with no wrapper (a Fragment):
 * the string's text as strings, its change marks through the hook's `ins` entry. The string is read
 * inside a private `span`, never rendered: a text right under the root counts as between blocks,
 * and would never be marked.
 */
export function ChangingText({ changeKey, animate, speed, children }: ChangingTextProps): ReactElement {
  const { rehypePlugin, components } = useTextChanges(children, { key: changeKey, animate, speed });
  const marked = useMemo(() => {
    const span: Element = { type: 'element', tagName: 'span', properties: {}, children: [{ type: 'text', value: children }] };
    const tree: Root = { type: 'root', children: [span] };
    rehypePlugin()(tree);
    return span.children;
  }, [children, rehypePlugin]);
  return <Fragment>{marked.map((node, i) => drawn(node, i, components))}</Fragment>;
}

/** A node of the marked string, keyed by `key`: a text as its value, an `ins` (a change mark)
 *  through `components`' entry, with its level and what it holds. */
function drawn(node: ElementContent, key: number, components: ChangeComponents): ReactNode {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return null;
  const { ins: Ins } = components;
  return (
    <Ins key={key} data-change={String(node.properties.dataChange)}>
      {node.children.map((child, i) => drawn(child, i, components))}
    </Ins>
  );
}
