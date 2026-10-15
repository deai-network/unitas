import { vi } from 'vitest';

/**
 * jsdom lays nothing out, so antd's responsive tags (`maxTagCount="responsive"`)
 * never learn the select's width and show no tag at all, only "+ N ...". While
 * measuring is on, every element observed reports its size at once, and
 * measureTags() makes that size a 1000px wide select with 60px wide tags, so
 * every tag fits. Importing this module installs the observer, which must
 * happen before the first render: antd's resize observer is created once,
 * lazily, from the global. Call stopMeasuring() after each test (with
 * vi.restoreAllMocks()).
 */
let measuring = false;
class MeasuringResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    if (measuring) queueMicrotask(() => this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver));
  }
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MeasuringResizeObserver;

export function measureTags() {
  measuring = true;
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(60);
}

export function stopMeasuring() {
  measuring = false;
}
