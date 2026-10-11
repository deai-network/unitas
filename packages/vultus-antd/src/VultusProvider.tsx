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
  // Keyed on each slot's own value, not on `outerComponents`/`components` themselves: the
  // natural call site is an inline `components={{ Spinner: X }}` literal, a new object every
  // render, and we don't want that alone to change the context value (and so re-render every
  // consumer below). Add a line here per slot as VultusComponents grows.
  const { Spinner: outerSpinner } = useVultusComponents();
  const { Spinner: componentsSpinner } = components ?? {};
  const mergedComponents = useMemo<VultusComponents>(
    () => ({ Spinner: componentsSpinner ?? outerSpinner }),
    [componentsSpinner, outerSpinner],
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
  const currentState = texts?.currentState;
  const mergedTexts = useMemo<VultusTexts>(
    () => ({ ...defaultVultusTexts, ...(currentState !== undefined ? { currentState } : {}) }),
    [currentState],
  );
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
