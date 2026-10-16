import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { useFieldGroup, type FieldDefinition, type FieldGroup } from 'vultus-core';
import { FieldWidget } from 'vultus-antd';
import { ReactRouterArgStore } from '../index.js';

// A stored field group over the URL store: TeacherTeacher's (the Praeceptor app's) search box
// and table of contents, the contents shown only while the search is empty. The widgets are
// vultus-antd's (a devDependency here), so the group is tested with real widgets on it.

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

/** Sets the input's text as typing does: the DOM value changes, then the input event fires. */
function typeInto(el: HTMLInputElement, text: string) {
  valueSetter.call(el, text);
  fireEvent.input(el);
}

const TEACHER: FieldDefinition[] = [
  { kind: 'text', id: 'search', label: 'Search' },
  {
    kind: 'oneOfTree', id: 'toc', label: 'Contents', optional: true, expand: 'all', widget: 'list',
    nodes: [{ value: '1', label: 'Part one', children: [{ value: '1.1', label: 'Chapter one' }, { value: '1.2', label: 'Chapter two' }] }],
    visible: (ctx) => ctx.values.search === '',
  },
];

/** The group, as the component running it last rendered it. */
let group!: FieldGroup;
function Teacher() {
  group = useFieldGroup(TEACHER, { stored: true });
  return <>{group.fields.map((f) => <FieldWidget key={f.id} field={f} />)}</>;
}

const input = () => screen.getByRole<HTMLInputElement>('textbox');
const chapterTwo = () => screen.queryByText('Chapter two');

describe('a stored field group over the URL store', () => {
  it('typing into search hides the contents, clearing it shows them again, and ?toc= stays as it was', async () => {
    const { search } = mount('/m?toc=1.1', <Teacher />);
    expect(group.values).toEqual({ search: '', toc: '1.1' });
    expect(group.byId.toc.visible).toBe(true);
    expect(chapterTwo()).not.toBeNull();

    typeInto(input(), 'ch');
    await settle();
    expect(search()).toBe('?toc=1.1&search=ch');
    expect(group.byId.toc.visible).toBe(false);
    expect(chapterTwo()).toBeNull();
    expect(group.values.toc).toBe('1.1');

    typeInto(input(), '');
    await settle();
    expect(search()).toBe('?toc=1.1');
    expect(group.byId.toc.visible).toBe(true);
    expect(group.values).toEqual({ search: '', toc: '1.1' });
    expect(chapterTwo()).not.toBeNull();
  });

  it('hrefFor gives URLs: the store\'s, with a field\'s current default left out', () => {
    mount('/m?toc=1.1', <Teacher />);
    expect(group.byId.toc.hrefFor?.('1.2')).toBe('/m?toc=1.2');
    expect(group.byId.toc.hrefFor?.('')).toBe('/m');
    expect(group.byId.search.hrefFor?.('ch')).toBe('/m?toc=1.1&search=ch');
    expect(chapterTwo()!.closest('a')).toHaveAttribute('href', '/m?toc=1.2');
  });
});
