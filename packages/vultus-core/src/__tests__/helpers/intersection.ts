/** An IntersectionObserver for tests (jsdom has none, and no layout): it records what it was made
 *  with and what it observes, and reports only when a test says what is visible (`show`). */
export class FakeIntersectionObserver {
  /** Every observer made since the fake was installed, in order. */
  static instances: FakeIntersectionObserver[] = [];
  readonly options: IntersectionObserverInit | undefined;
  readonly targets = new Set<Element>();
  disconnected = false;
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  get root(): Element | Document | null {
    return this.options?.root ?? null;
  }

  get rootMargin(): string {
    return this.options?.rootMargin ?? '0px';
  }

  get thresholds(): readonly number[] {
    return [0];
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Calls back with an entry for every target: those in `visible` intersecting, the others not. */
  show(visible: Element[]): void {
    const shown = new Set(visible);
    const entries = Array.from(this.targets, (target) => ({
      target,
      isIntersecting: shown.has(target),
      intersectionRatio: shown.has(target) ? 1 : 0,
      time: 0,
    }) as unknown as IntersectionObserverEntry);
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

/** Puts `FakeIntersectionObserver` in place of the global `IntersectionObserver`, its instances
 *  cleared; returns the restore. */
export function installFakeIntersectionObserver(): () => void {
  const global = globalThis as { IntersectionObserver?: unknown };
  const had = Object.prototype.hasOwnProperty.call(global, 'IntersectionObserver');
  const previous = global.IntersectionObserver;
  FakeIntersectionObserver.instances = [];
  global.IntersectionObserver = FakeIntersectionObserver;
  return () => {
    if (had) global.IntersectionObserver = previous;
    else delete global.IntersectionObserver;
  };
}
