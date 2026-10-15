import '@testing-library/jest-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// The action hooks (useAction/useActionList) call react-i18next's
// useTranslation. Initialise a minimal instance so `t` resolves (keys echo
// through — tests assert on prop-supplied labels, not translated strings).
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false },
  });
}

// react-router's data routers build each navigation's Request with the global AbortController's
// signal. Under jsdom that is jsdom's AbortSignal, which Node's Request (kept, as jsdom has none)
// refuses. So the signal is kept beside the request instead, and `request.signal` answers with
// it: an interrupted navigation sees its abort as in a browser (react-router rejects its pending
// loaders and drops the navigation), so a test whose navigation gets cancelled fails.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  readonly #signal: AbortSignal | undefined;
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init === undefined ? undefined : { ...init, signal: undefined });
    this.#signal = init?.signal ?? undefined;
  }
  get signal(): AbortSignal {
    return this.#signal ?? super.signal;
  }
} as typeof Request;
