/**
 * What every browser has and jsdom lacks, for the component tests (the jsdom
 * project in vitest.config.mts). Media queries answer as a desktop with no
 * preferences, so `useIsMobile` and the docked side panel take their desktop
 * branch; ResizeObserver observes nothing. A test that needs another answer
 * (reduced motion, a phone) stubs its own over these.
 */

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
