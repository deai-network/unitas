import { useMemo, type ReactNode } from 'react';
import { message as antdMessage } from 'antd';
import {
  MessageSinkContext, InternalLinkContext, VultusComponentsContext, useVultusComponents,
  type MessageSink, type InternalLinkComponent, type VultusComponents,
} from 'vultus-core';
import { defaultVultusTexts, VultusTextsContext, type VultusTexts } from './texts.js';

/**
 * Fully-wired vultus provider. Wrap your app once and every vultus-antd
 * component gets its dependency injection for free: unhandled action errors and
 * the messages actions report go to antd's message API by severity
 * (error, warning, info), and internal (`/`-prefixed) markdown links render via
 * `linkComponent` when supplied (e.g. a react-router Link) — otherwise the
 * neutral plain-anchor default from vultus-core applies. `texts` translates
 * the few texts vultus-antd writes itself (English by default). The configurable
 * primitives (MessageSinkContext, InternalLinkContext, <Markdown>) remain
 * exported for advanced use.
 *
 * The default sink uses antd's hook-based message API (not the static
 * `message.*` functions), so the toast renders inside the app's tree and follows the
 * app's ConfigProvider (theme, prefix).
 *
 * `components` lends the app's own widgets (today: `Spinner`) to vultus/optio in place of
 * their antd defaults, e.g. `<VultusProvider components={{ Spinner: DaeoSpinner }}>`. It
 * merges over whatever an outer `VultusProvider` (or `VultusComponentsContext.Provider`,
 * for apps without vultus-antd) already provided, so a nested provider can override one
 * slot (`{ ...outer, ...components }`) without losing the others; omit it and the outer
 * value (or core's `{}` default) applies unchanged.
 */
export function VultusProvider({
  children, linkComponent, messageSink, texts, components,
}: {
  children: ReactNode;
  linkComponent?: InternalLinkComponent;
  messageSink?: MessageSink;
  texts?: Partial<VultusTexts>;
  components?: VultusComponents;
}) {
  // `{ ...outerComponents, ...components }`, kept on purpose: `components={{ Spinner:
  // undefined }}` explicitly clears an inherited slot (a subtree wants antd's own spinner
  // back), which a `??` fallback would not do. But keyed on each slot's own value and
  // whether `components` itself sets that key — not on the `outerComponents`/`components`
  // object references — so the natural inline call site (`components={{ Spinner: X }}`, a
  // new object literal every render) doesn't change the merged value's identity (and so
  // re-render every consumer below) unless a slot actually changed. Add one triplet here
  // per slot as VultusComponents grows.
  const outerComponents = useVultusComponents();
  const hasOwnSpinner = components ? 'Spinner' in components : false;
  const mergedComponents = useMemo<VultusComponents>(
    () => ({ ...outerComponents, ...components }),
    [outerComponents.Spinner, hasOwnSpinner, components?.Spinner],
  );
  const [messageApi, messageHolder] = antdMessage.useMessage();
  const sink = useMemo<MessageSink>(
    () => messageSink ?? ((text, severity = 'error') => {
      if (severity === 'warning') messageApi.warning(text);
      else if (severity === 'info') messageApi.info(text);
      else messageApi.error(text);
    }),
    [messageSink, messageApi],
  );
  // Every VultusTexts key, not a hard-coded pair: a key `texts` doesn't set keeps its default.
  // Memoized on the values, not on `texts`'s own identity (a fresh object literal at the call
  // site, as `texts={{ ... }}` naturally produces, must not re-render every consumer below) — an
  // array value (joiningWords) compares by its joined content via JSON.stringify, like a string
  // or number value. An absent key gets a sentinel no JSON.stringify output can produce (every
  // stringified value starts with `"`, `[`, or a digit/letter/`-`), so it never collides with an
  // explicit override of `''` or `[]` — those must still take effect over the default.
  const ABSENT = '\u0000';
  const textsKeys = Object.keys(defaultVultusTexts) as (keyof VultusTexts)[];
  const textsValuesKey = textsKeys
    .map((key) => {
      const value = texts?.[key];
      return value === undefined ? ABSENT : JSON.stringify(value);
    })
    .join('\u0001');
  const mergedTexts = useMemo<VultusTexts>(() => {
    const merged = { ...defaultVultusTexts };
    for (const key of textsKeys) {
      const value = texts?.[key];
      if (value !== undefined) (merged as Record<keyof VultusTexts, unknown>)[key] = value;
    }
    return merged;
  }, [textsValuesKey]);
  const wired = (
    <VultusTextsContext.Provider value={mergedTexts}>
      <MessageSinkContext.Provider value={sink}>
        {messageHolder}
        {children}
      </MessageSinkContext.Provider>
    </VultusTextsContext.Provider>
  );
  const withComponents = components
    ? <VultusComponentsContext.Provider value={mergedComponents}>{wired}</VultusComponentsContext.Provider>
    : wired;
  return linkComponent
    ? <InternalLinkContext.Provider value={linkComponent}>{withComponents}</InternalLinkContext.Provider>
    : withComponents;
}
