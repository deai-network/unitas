import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useStoredField, useTextField, type FieldDefinition, type TextFieldControls } from 'vultus-core';
import { ReactRouterArgStore } from '../index.js';
import { Field } from 'vultus-antd';

// <Field stored> over the URL store: the store reads its own writes back at once (before the
// router renders the navigation), so widgets do not lose the caret, keystrokes or the moved-to value.
// The widgets are vultus-antd's (a devDependency here): the store is tested with real widgets on it.

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

describe('a stored OneOfTreeList over the URL store: its links follow the URL', () => {
  const TOC: FieldDefinition = {
    kind: 'oneOfTree', id: 'toc', label: 'Contents', expand: 'all',
    nodes: [{ value: '1', label: 'Part one', choosable: false, children: [{ value: '1.1', label: 'Chapter one' }, { value: '1.2', label: 'Chapter two' }] }],
  };
  /** Another stored field (`lang`), writing the URL without the list re-rendering. */
  let lang!: TextFieldControls;
  function Lang() {
    lang = useTextField(useStoredField({ kind: 'text', id: 'lang', label: 'Language' }).options);
    return null;
  }
  const chapterTwo = () => screen.getByText('Chapter two').closest('a')!;
  /** A click with Ctrl, its default (following the link, which jsdom cannot) prevented before it would happen. */
  function ctrlClick(a: HTMLElement) {
    const hold = (e: Event) => e.preventDefault();
    window.addEventListener('click', hold, true);
    fireEvent.click(a, { ctrlKey: true });
    window.removeEventListener('click', hold, true);
  }

  it.each([
    ['mouseenter', (a: HTMLElement) => { fireEvent.mouseEnter(a); }],
    ['focus', (a: HTMLElement) => { act(() => a.focus()); }],
    ['mousedown', (a: HTMLElement) => { fireEvent.mouseDown(a); }],
    ['contextmenu', (a: HTMLElement) => { fireEvent.contextMenu(a); }],
    ['pointerdown', (a: HTMLElement) => { fireEvent.pointerDown(a); }],
    ['touchstart', (a: HTMLElement) => { fireEvent.touchStart(a); }],
    ['a click with Ctrl', ctrlClick],
  ])('another field writes the URL; on %s a row link\'s href is the URL as it is now', async (_, interact) => {
    const { search } = mount('/m?toc=1.1', <><Field stored definition={TOC} widget="list" /><Lang /></>);
    expect(chapterTwo()).toHaveAttribute('href', '/m?toc=1.2');
    act(() => lang.setValue('en'));
    await settle();
    expect(search()).toBe('?toc=1.1&lang=en');
    // The list has not re-rendered (its value did not change): the href it rendered is the old URL's.
    expect(chapterTwo()).toHaveAttribute('href', '/m?toc=1.2');
    interact(chapterTwo());
    expect(chapterTwo()).toHaveAttribute('href', '/m?toc=1.2&lang=en');
  });
});
