import type { ParsedApiError } from './types.js';

/**
 * What a thrown error says, for an action's or a field commit's error message: an API error's
 * status, reason and message (ts-rest's reject shape, `{ status, body: { message, reason } }`);
 * without a body message, a thrown `Error`'s own message (`new Error('Printer offline')`, a
 * failed fetch's TypeError), unless empty. `status` is 0 when the error carries none.
 */
export function parseApiError(err: unknown): ParsedApiError {
  if (typeof err !== 'object' || err === null) return { status: 0 };
  const e = err as { status?: number; body?: { message?: string; reason?: string } };
  return {
    status: e.status ?? 0,
    reason: e.body?.reason,
    message: e.body?.message ?? ((err instanceof Error && err.message) || undefined),
  };
}
