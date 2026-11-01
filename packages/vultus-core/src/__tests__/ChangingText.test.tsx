import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangingText } from '../changes/ChangingText.js';
import { lent } from './helpers/changeMarks.js';

// A plain string whose changes light up, with the hook's key semantics.

/** `node`'s text as the new version has it: without the old letters shown going inside it. */
function shown(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  for (const removed of copy.querySelectorAll('[data-change="removed"]')) removed.remove();
  return copy.textContent ?? '';
}
const advance = (ms: number) => act(() => {
  vi.advanceTimersByTime(ms);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChangingText', () => {
  it('renders its string as it is, no wrapper', () => {
    const { container } = render(<ChangingText changeKey="s">a hivei b</ChangingText>);
    expect(container.innerHTML).toBe('a hivei b');
  });

  it('same key, new string: what changed lit, then the string as it is; with a test mark lent, and with the fallback', () => {
    for (const drawn of [(element: ReactElement) => lent(element), (element: ReactElement) => element]) {
      const { container, rerender, unmount } = render(drawn(<ChangingText changeKey="s">a hivei b</ChangingText>));
      rerender(drawn(<ChangingText changeKey="s">a hívei b</ChangingText>));
      const word = container.querySelector('mark[data-change="word"]');
      expect(word).not.toBeNull();
      expect(shown(word!)).toBe('hívei');
      expect(container.querySelector('mark[data-change="removed"]')?.textContent).toBe('i');
      advance(2299);
      expect(container.querySelector('mark[data-change="word"]')).not.toBeNull();
      advance(1);
      expect(container.querySelector('mark')).toBeNull();
      expect(container.innerHTML).toBe('a hívei b');
      unmount();
    }
  });

  it("speed reaches every mark: the switch's speed, normal by default", () => {
    for (const speed of ['slow', 'fast', 'normal', undefined] as const) {
      const { container, rerender, unmount } = render(lent(<ChangingText changeKey="s" speed={speed}>a hivei b</ChangingText>));
      rerender(lent(<ChangingText changeKey="s" speed={speed}>a hívei b</ChangingText>));
      const all = Array.from(container.querySelectorAll('mark[data-change]'));
      expect(all.map((mark) => mark.getAttribute('data-change')).sort()).toEqual(['letters', 'removed', 'replaced', 'word']);
      for (const mark of all) expect(mark.getAttribute('data-speed'), String(speed)).toBe(speed ?? 'normal');
      unmount();
    }
  });

  it('a new changeKey, the same string, animate={false}: no mark', () => {
    const { container, rerender } = render(<ChangingText changeKey="s">a hivei b</ChangingText>);
    rerender(<ChangingText changeKey="t">a hívei b</ChangingText>);
    expect(container.innerHTML).toBe('a hívei b');
    rerender(<ChangingText changeKey="t">a hívei b</ChangingText>);
    expect(container.innerHTML).toBe('a hívei b');
    rerender(<ChangingText changeKey="t" animate={false}>a hivei b</ChangingText>);
    expect(container.innerHTML).toBe('a hivei b');
  });
});
