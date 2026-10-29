import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { TextFieldControls } from 'vultus-core';
import { useFieldRequest } from './useFieldRequest.js';

/**
 * The text TextInput and SearchInput show, and how they request it. The input always shows a
 * draft that changes with the keystroke itself, in the same render: a controlled input whose
 * value lagged behind a keystroke would lose its caret and, typed fast, a character (React puts
 * the old value back after the event). A field that does not commit requests each change at
 * once (`change`); one that commits keeps the draft until `commit` (blur, Enter). `clear` empties
 * the draft and requests `''` at once, in either mode.
 *
 * The draft adopts the field's value when it changes other than through the widget's own
 * requests (from outside, or after a commit), but not while a confirmation is open or a commit
 * is pending, and not when the new value is one of the widget's own live requests still landing
 * (an app that stores asynchronously, a store that renders later): the draft is already there or
 * further on. A request is a no-op when it names the last value requested (or, with none still
 * landing, the field's value), so typing back to the stored value while a change is on its way
 * still requests it. When the field stops being pending, or a confirmation closes, the draft
 * adopts the field's value if it changed meanwhile or a request of the widget's own was in flight
 * (committed, failed or cancelled: the stored value shows again); the app's own pending over
 * with nothing new (the field's `pending` option), the draft stays as typed, not yet requested.
 */
export function useTextDraft(field: TextFieldControls): {
  value: string;
  change: (next: string) => void;
  commit: () => void;
  clear: () => void;
  wrap: (control: ReactElement) => ReactElement;
  asking: boolean;
} {
  /** The widget's own live requests that the field's value has not shown yet, oldest first. */
  const landing = useRef<string[]>([]);
  const requesting = {
    ...field,
    setValue: (next: string) => {
      if (!field.commits) landing.current.push(next);
      field.setValue(next);
    },
  };
  const { request, wrap, asking } = useFieldRequest(requesting, {
    equal: (next, value) => next === (landing.current.at(-1) ?? value),
  });
  const [draft, setDraft] = useState(field.value);
  /** The field's value the draft last adopted. */
  const adopted = useRef(field.value);
  /** A request of the widget's own was taken since the draft last adopted the field's value. */
  const requested = useRef(false);
  const take = (next: string) => { if (request(next)) requested.current = true; };
  const inFlight = asking || field.pending;
  useEffect(() => {
    const own = landing.current.indexOf(field.value);
    if (own !== -1) {
      landing.current = landing.current.slice(own + 1);
      return;
    }
    landing.current = [];
    if (inFlight) return;
    // The app's own pending over, nothing new: the draft stays as typed.
    if (field.value === adopted.current && !requested.current) return;
    adopted.current = field.value;
    requested.current = false;
    setDraft(field.value);
  }, [field.value, inFlight]);
  return {
    value: draft,
    change: (next) => {
      setDraft(next);
      if (!field.commits) take(next);
    },
    commit: () => take(draft),
    clear: () => {
      setDraft('');
      take('');
    },
    wrap,
    asking,
  };
}
