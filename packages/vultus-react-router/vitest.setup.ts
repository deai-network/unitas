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
// refuses. The tests' routes have no loaders to abort, so the signal is dropped.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init === undefined ? undefined : { ...init, signal: undefined });
  }
} as typeof Request;
