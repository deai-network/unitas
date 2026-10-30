import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// What `waitFor` and `findBy*` wait for takes real time here: rc-dropdown's autoFocus alone is three
// animation frames, measured past 1300 ms on a loaded machine, past the library's default of 1000.
// Below the config's testTimeout, so a real failure still reports its assertion.
configure({ asyncUtilTimeout: 10000 });

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'en', fallbackLng: 'en', resources: {}, interpolation: { escapeValue: false },
  });
}

// jsdom implements neither matchMedia (antd Form's responsive Row/Col use it)
// nor ResizeObserver — stub both so components can mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!('ResizeObserver' in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
