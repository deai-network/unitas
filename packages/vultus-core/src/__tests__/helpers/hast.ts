import type { Element, ElementContent, Properties, Root, RootContent, Text } from 'hast';

/** A hast text node of `value`. */
export function text(value: string): Text {
  return { type: 'text', value };
}

/** A hast element; a string child is a text node. */
export function el(tagName: string, properties: Properties | null, ...children: (ElementContent | string)[]): Element {
  return {
    type: 'element',
    tagName,
    properties: properties ?? {},
    children: children.map((child) => (typeof child === 'string' ? text(child) : child)),
  };
}

/** A hast root; a string child is a text node. */
export function root(...children: (RootContent | string)[]): Root {
  return { type: 'root', children: children.map((child) => (typeof child === 'string' ? text(child) : child)) };
}
