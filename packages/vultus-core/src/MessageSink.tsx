import { createContext, useContext } from 'react';
import type { Severity } from './types.js';

/**
 * How the action framework surfaces messages: an otherwise-unhandled error (no
 * form field, no inline error target), and the messages an action reports
 * through its ExecutionContext. `severity` defaults to 'error'. Default is a
 * no-op so vultus-core stays antd-free and framework-neutral; vultus-antd's
 * VultusProvider wires this to antd's message API. Hosts may inject any
 * toast/notification mechanism.
 */
export type MessageSink = (text: string, severity?: Severity) => void;

export const MessageSinkContext = createContext<MessageSink>(() => {});

export function useMessageSink(): MessageSink {
  return useContext(MessageSinkContext);
}
