import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { createMemoryRouter, createPath, RouterProvider } from 'react-router';
import {
  stringType, useFieldGroup, useStoredField, useStoredFields, useTextField,
  type ArgDefinition, type FieldDefinition, type FieldGroup, type StoredFields, type TextFieldControls,
} from 'vultus-core';
import { ReactRouterArgStore, rest, token, vanishing, type PathToken } from '../index.js';
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

// The field layer over keys the store keeps in the path and the fragment: above the store they are
// plain keys, so these hooks and widgets know nothing of where a key lives.
describe('the field layer over keys in the path and the fragment', () => {
  const VARIANT = { kind: 'oneOf', id: 'variant', choices: [{ value: 'first' }, { value: 'revised' }] } satisfies FieldDefinition;
  const TASK: ArgDefinition<string> = { key: 'task', valueType: stringType, default: '' };
  const SECTION: ArgDefinition<string> = { key: 'section', valueType: stringType, default: '' };
  const SECTION_FIELD = { kind: 'text', id: 'section' } satisfies FieldDefinition;
  const AT = { kind: 'text', id: 'at' } satisfies FieldDefinition;
  const TOC = { kind: 'text', id: 'toc' } satisfies FieldDefinition;
  const SIZE = { kind: 'text', id: 'size', permanent: true } satisfies FieldDefinition;

  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
  });

  /** The store in the route `:lang/:module/*`, around `element`. `navigations` lists every location the router moved to. */
  function mountModule(
    entry: string,
    element: ReactNode,
    { path = [vanishing(VARIANT), rest(TASK)], fragment = AT }: { path?: readonly PathToken[]; fragment?: FieldDefinition } = {},
  ) {
    const router = createMemoryRouter(
      [{ path: ':lang/:module/*', element: <ReactRouterArgStore path={path} fragment={fragment}>{element}</ReactRouterArgStore> }],
      { initialEntries: [entry] },
    );
    const navigations: string[] = [];
    let last = router.state.location;
    const unsubscribe = router.subscribe((state) => {
      if (state.location === last) return;
      last = state.location;
      navigations.push(`${state.historyAction} ${createPath(state.location)}`);
    });
    disposers.push(() => {
      unsubscribe();
      router.dispose();
    });
    render(<AntApp><RouterProvider router={router} /></AntApp>);
    return { navigations, url: () => createPath(router.state.location) };
  }

  describe('useStoredFields over path keys', () => {
    let fields: StoredFields;
    function Summary({ definitions }: { definitions: FieldDefinition[] }) {
      fields = useStoredFields(definitions);
      return null;
    }

    it('resetAll: a vanishing key with a value, a query key, the fragment: one navigation, later token cut', async () => {
      const definitions = [VARIANT, TOC, AT];
      const { url, navigations } = mountModule('/hu/m/revised/s19?toc=a&x=1&size=l#12', <Summary definitions={definitions} />);
      expect(fields.changedCount).toBe(3);
      expect(fields.values).toMatchObject({ variant: 'revised', toc: 'a', at: '12' });
      await act(async () => fields.resetAll());
      expect(navigations).toEqual(['REPLACE /hu/m?x=1&size=l']);
      expect(url()).toBe('/hu/m?x=1&size=l');
      expect(fields.changedCount).toBe(0);
    });

    it('resetAll: variant already default: the task stays, only the query goes', async () => {
      const definitions = [VARIANT, TOC];
      const { url } = mountModule('/hu/m/s19?toc=a', <Summary definitions={definitions} />);
      await act(async () => fields.resetAll());
      expect(url()).toBe('/hu/m/s19');
    });

    it('resetAll over an independent token with a later value: refused whole (the query filter stays too)', async () => {
      const definitions = [SECTION_FIELD, TOC];
      const { url, navigations } = mountModule('/hu/m/sec/t?toc=a', <Summary definitions={definitions} />, {
        path: [token(SECTION, { independent: true }), rest(TASK)],
      });
      await act(async () => fields.resetAll());
      expect(navigations).toEqual([]);
      expect(url()).toBe('/hu/m/sec/t?toc=a');
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0][0])).toContain("'section'");
    });

    it('resetAll over a plain token with a later value: the later token is cut', async () => {
      const definitions = [SECTION_FIELD, TOC];
      const { url } = mountModule('/hu/m/sec/t?toc=a', <Summary definitions={definitions} />, { path: [token(SECTION), rest(TASK)] });
      await act(async () => fields.resetAll());
      expect(url()).toBe('/hu/m');
    });
  });

  describe('useFieldGroup({ stored: true }) with fields in the path and the fragment', () => {
    let group: FieldGroup;
    function Group({ definitions }: { definitions: FieldDefinition[] }) {
      group = useFieldGroup(definitions, { stored: true });
      return null;
    }

    it('reads, writes, links and resets', async () => {
      const definitions = [VARIANT, AT, TOC, SIZE];
      const { url, navigations } = mountModule('/hu/m/s19?toc=a&size=l#12', <Group definitions={definitions} />);
      expect(group.values).toMatchObject({ variant: 'first', at: '12', toc: 'a', size: 'l' });
      expect(group.byId.variant.hrefFor?.('revised')).toBe('/hu/m/revised?size=l');
      await act(async () => group.byId.at.setValue('13'));
      expect(url()).toBe('/hu/m/s19?toc=a&size=l#13');
      await act(async () => group.byId.variant.setValue('revised'));
      expect(url()).toBe('/hu/m/revised?size=l');
      expect(group.values).toMatchObject({ variant: 'revised', at: '', toc: '', size: 'l' });
      await act(async () => group.resetAll());
      expect(url()).toBe('/hu/m');
      expect(navigations.length).toBe(3);
    });

    it('a field in the fragment with a non-empty default cannot be emptied: it reads the default again', async () => {
      const WITH_DEFAULT = { kind: 'text', id: 'at', initialValue: 'one' } satisfies FieldDefinition;
      const definitions = [WITH_DEFAULT];
      const { url } = mountModule('/hu/m#12', <Group definitions={definitions} />, { fragment: WITH_DEFAULT });
      await act(async () => group.byId.at.setValue(''));
      expect(url()).toBe('/hu/m');
      expect(group.values.at).toBe('one');
    });

    it('a many-of in the fragment with a non-empty default: an empty list reads as the default', async () => {
      const LIST = { kind: 'manyOf', id: 'at', choices: [{ value: 'a' }, { value: 'b' }], initialValue: ['a'] } satisfies FieldDefinition;
      const definitions = [LIST];
      const { url } = mountModule('/hu/m#b', <Group definitions={definitions} />, { fragment: LIST });
      expect(group.values.at).toEqual(['b']);
      await act(async () => group.byId.at.setValue([]));
      expect(url()).toBe('/hu/m');
      expect(group.values.at).toEqual(['a']);
    });
  });

  describe('<Field stored> with a path key', () => {
    const NODES = [{ value: 'a/b', label: 'A/B' }, { value: 's19', label: 'S19' }, { value: 'revised', label: 'named like a variant' }];
    const TREE = { kind: 'oneOfTree', id: 'task', optional: true, nodes: NODES } satisfies FieldDefinition;
    const TEXT_TASK = { kind: 'text', id: 'task' } satisfies FieldDefinition;
    const rowOf = (label: string) => screen.getByText(label).closest('a')!;

    it('tree rows over the rest token link clean paths; a row named like a vanished variant gives the current href, with warnings', async () => {
      mountModule('/hu/m/s19?toc=a#3', (
        <>
          <Field stored definition={TREE} widget="list" />
          <Field stored definition={TOC} />
        </>
      ));
      await settle();
      // The fragment goes from the first render on, as the store has its definition. `toc` is still
      // there: this render came before its hook, below the tree, declared it.
      expect(rowOf('A/B')).toHaveAttribute('href', '/hu/m/a/b?toc=a');
      expect(rowOf('named like a variant')).toHaveAttribute('href', '/hu/m/s19?toc=a#3');
      expect(warn.mock.calls.some(([message]) => String(message).includes("'task'"))).toBe(true);
      // A row asks again when it is used, so what gets used is right.
      fireEvent.mouseEnter(rowOf('A/B'));
      expect(rowOf('A/B')).toHaveAttribute('href', '/hu/m/a/b');
    });

    it('a text field in the fragment: typing writes it', async () => {
      const { url } = mountModule('/hu/m/x#1', <Field stored definition={AT} />);
      const el = input();
      fireEvent.change(el, { target: { value: '12.4' } });
      await settle();
      expect(url()).toBe('/hu/m/x#12.4');
      expect(el.value).toBe('12.4');
    });

    it('a text field in a rest token: a keystroke refused on the way keeps the draft, the URL stays, and the next one lands', async () => {
      const { url } = mountModule('/hu/m/x', <Field stored definition={TEXT_TASK} />, { path: [rest(TEXT_TASK)] });
      const el = input();
      fireEvent.change(el, { target: { value: 'x/' } });
      await settle();
      expect(url()).toBe('/hu/m/x');
      expect(el.value).toBe('x/');
      fireEvent.change(el, { target: { value: 'x/y' } });
      await settle();
      expect(url()).toBe('/hu/m/x/y');
      expect(el.value).toBe('x/y');
    });

    it('a refused keystroke with no follow-up: the input shows what the URL does not hold', async () => {
      const { url } = mountModule('/hu/m/x', <Field stored definition={TEXT_TASK} />, { path: [rest(TEXT_TASK)] });
      const el = input();
      fireEvent.change(el, { target: { value: '..' } });
      await settle();
      expect(url()).toBe('/hu/m/x');
      expect(el.value).toBe('..');
    });
  });
});
