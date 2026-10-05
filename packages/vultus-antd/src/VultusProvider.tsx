import { useMemo, type ReactNode } from 'react';
import { message as antdMessage } from 'antd';
import {
  MessageSinkContext, InternalLinkContext,
  type MessageSink, type InternalLinkComponent,
} from 'vultus-core';

/**
 * Fully-wired vultus provider. Wrap your app once and every vultus-antd
 * component gets its dependency injection for free: unhandled action errors and
 * the messages actions report go to antd's message API by severity
 * (error, warning, info), and internal (`/`-prefixed) markdown links render via
 * `linkComponent` when supplied (e.g. a react-router Link) — otherwise the
 * neutral plain-anchor default from vultus-core applies. The configurable
 * primitives (MessageSinkContext, InternalLinkContext, <Markdown>) remain
 * exported for advanced use.
 *
 * The default sink uses antd's hook-based message API (not the static
 * `message.*` functions), so the toast renders inside the app's tree and follows the
 * app's ConfigProvider (theme, prefix).
 */
export function VultusProvider({
  children, linkComponent, messageSink,
}: {
  children: ReactNode;
  linkComponent?: InternalLinkComponent;
  messageSink?: MessageSink;
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
  const wired = (
    <MessageSinkContext.Provider value={sink}>
      {messageHolder}
      {children}
    </MessageSinkContext.Provider>
  );
  return linkComponent
    ? <InternalLinkContext.Provider value={linkComponent}>{wired}</InternalLinkContext.Provider>
    : wired;
}
