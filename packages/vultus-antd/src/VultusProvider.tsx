import { useMemo, type ReactNode } from 'react';
import { message as antdMessage } from 'antd';
import {
  MessageSinkContext, InternalLinkContext,
  type MessageSink, type InternalLinkComponent,
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
 */
export function VultusProvider({
  children, linkComponent, messageSink, texts,
}: {
  children: ReactNode;
  linkComponent?: InternalLinkComponent;
  messageSink?: MessageSink;
  texts?: Partial<VultusTexts>;
}) {
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
  return linkComponent
    ? <InternalLinkContext.Provider value={linkComponent}>{wired}</InternalLinkContext.Provider>
    : wired;
}
