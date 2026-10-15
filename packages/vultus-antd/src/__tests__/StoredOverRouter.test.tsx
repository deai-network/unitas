import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { FieldDefinition } from 'vultus-core';
import { ReactRouterArgStore } from 'vultus-react-router';
import { Field } from '../Field.js';

// <Field stored> over the URL store: the store reads its own writes back at once (before the
// router renders the navigation), so widgets do not lose the caret, keystrokes or the moved-to value.

// react-router's data routers build each navigation's Request with the global AbortController's
// signal; under jsdom that is jsdom's AbortSignal, which Node's Request refuses. As in
// vultus-react-router's vitest.setup.ts, the signal is kept beside the request instead.
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
afterAll(() => {
  globalThis.Request = NodeRequest;
});

const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
});

function mount(entry: string, element: ReactNode) {
  const router = createMemoryRouter(
    [{ path: '/m', element: <ReactRouterArgStore>{element}</ReactRouterArgStore> }],
    { initialEntries: [entry] },
  );
  disposers.push(() => router.dispose());
  render(<AntApp><RouterProvider router={router} /></AntApp>);
  return { router, search: () => router.state.location.search };
}

/** Lets the store's navigation land and render. */
const settle = () => act(async () => {});

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

/** Types `text` at `at` as a keystroke does: the DOM value and the caret change, then the input event fires. */
function typeAt(el: HTMLInputElement, at: number, text: string) {
  valueSetter.call(el, el.value.slice(0, at) + text + el.value.slice(at));
  el.setSelectionRange(at + text.length, at + text.length);
  fireEvent.input(el);
}

const input = () => screen.getByRole<HTMLInputElement>('textbox');
const handles = () => screen.getAllByRole('slider');
const press = (handle: HTMLElement, key: string, keyCode: number) => {
  fireEvent.keyDown(handle, { key, keyCode });
  fireEvent.keyUp(handle, { key, keyCode });
};

const TEXT: FieldDefinition = { kind: 'text', id: 'q', label: 'Query' };

describe.each(['input', 'search'] as const)('a stored text field (widget %s) over the URL store', (widget) => {
  it('typing in the middle keeps the caret', async () => {
    const { search } = mount('/m?q=abc', <Field stored definition={TEXT} widget={widget} />);
    const el = input();
    act(() => el.focus());
    typeAt(el, 1, 'X');
    expect(el.value).toBe('aXbc');
    expect(el.selectionStart).toBe(2);
    await settle();
    expect(search()).toBe('?q=aXbc');
    expect(el.value).toBe('aXbc');
    expect(el.selectionStart).toBe(2);
  });

  it('two keystrokes with only the store\'s microtask between them both land', async () => {
    const { search } = mount('/m?q=abc', <Field stored definition={TEXT} widget={widget} />);
    const el = input();
    act(() => el.focus());
    await act(async () => {
      typeAt(el, el.value.length, 'X');
      await Promise.resolve();
      typeAt(el, el.value.length, 'Y');
    });
    await settle();
    expect(search()).toBe('?q=abcXY');
    expect(el.value).toBe('abcXY');
  });
});

describe('stored sliders over the URL store: the moved-to value stays (no jump back)', () => {
  it('NumericSlider', async () => {
    const { search } = mount('/m?n=5', (
      <Field stored definition={{ kind: 'numeric', id: 'n', label: 'Count', min: 0, max: 10 }} widget="slider" />
    ));
    const [handle] = handles();
    press(handle, 'ArrowRight', 39);
    expect(handle).toHaveAttribute('aria-valuenow', '6');
    await settle();
    expect(search()).toBe('?n=6');
    expect(handle).toHaveAttribute('aria-valuenow', '6');
  });

  it('RangeSlider', async () => {
    const { search } = mount('/m?years=2002..2008', (
      <Field stored definition={{ kind: 'range', id: 'years', label: 'Years', min: 2000, max: 2010 }} />
    ));
    const [from] = handles();
    press(from, 'ArrowRight', 39);
    expect(from).toHaveAttribute('aria-valuenow', '2003');
    await settle();
    expect(search()).toBe('?years=2003..2008');
    expect(handles()[0]).toHaveAttribute('aria-valuenow', '2003');
  });

  it('OneOfSlider', async () => {
    const { search } = mount('/m?level=b', (
      <Field
        stored
        definition={{ kind: 'oneOf', id: 'level', label: 'Level', choices: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] }}
        widget="slider"
      />
    ));
    const [handle] = handles();
    expect(handle).toHaveAttribute('aria-valuenow', '1');
    press(handle, 'ArrowRight', 39);
    expect(handle).toHaveAttribute('aria-valuenow', '2');
    await settle();
    expect(search()).toBe('?level=c');
    expect(handle).toHaveAttribute('aria-valuenow', '2');
  });
});

describe('a stored checkbox over the URL store', () => {
  it('shows the new state at once, and keeps it while the navigation lands (no flicker)', async () => {
    const { search } = mount('/m', <Field stored definition={{ kind: 'boolean', id: 'flag', label: 'Flag' }} widget="checkbox" />);
    const box = screen.getByRole('checkbox');
    const seen: boolean[] = [];
    const observer = new MutationObserver(() => seen.push((box as HTMLInputElement).checked));
    observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    fireEvent.click(box);
    expect(box).toBeChecked();
    await settle();
    observer.disconnect();
    expect(search()).toBe('?flag=1');
    expect(box).toBeChecked();
    expect(seen).not.toContain(false);
  });
});
