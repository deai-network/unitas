import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp, Modal } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useOneOfTreeField, type FieldCommit, type OneOfTreeFieldOptions, type TreeNode,
} from 'vultus-core';
import { OneOfTreePicker, type OneOfTreePickerProps } from '../OneOfTreePicker.js';

type Geo = 'geo' | 'sik' | 'kor' | 'ter' | 'alg';

// Geometria (a folder) > Síkgeometria > Kör (a note), Térgeometria (disabled); Algebra (a
// description). OneOfTreePicker.test.tsx's test tree.
const GEO: TreeNode<Geo>[] = [
  {
    value: 'geo', label: 'Geometria', choosable: false, children: [
      { value: 'sik', label: 'Síkgeometria', children: [{ value: 'kor', label: 'Kör', note: '3' }] },
      { value: 'ter', label: 'Térgeometria', disabled: { verdict: true, reason: 'later' } },
    ],
  },
  { value: 'alg', label: 'Algebra', description: 'Equations and identities' },
];

type InsideOpts = Partial<Omit<OneOfTreeFieldOptions<Geo>, 'value' | 'onChange' | 'commit'>>
  & Pick<OneOfTreePickerProps<Geo>, 'panel'>;

function Inside({ panel, ...opts }: InsideOpts) {
  const field = useOneOfTreeField<Geo>({ id: 'cat', label: 'Category', nodes: GEO, ...opts } as OneOfTreeFieldOptions<Geo>);
  return <><OneOfTreePicker field={field} panel={panel} /><output>{field.value}</output></>;
}

/** A field whose value the render site keeps, so a test can change it from outside (the URL, the Back button, another widget). */
function Outside({ value }: { value: Geo | '' }) {
  const field = useOneOfTreeField<Geo>({ id: 'cat', label: 'Category', nodes: GEO, expand: 'all', value, onChange: () => {} });
  return <><OneOfTreePicker field={field} panel="drawer" /><output>{field.value}</output></>;
}

function Committed({ fire, confirmation, initial = 'alg', panel = 'drawer' }: {
  fire: (next: Geo | '') => Promise<void> | void;
  confirmation?: FieldCommit<Geo | ''>['confirmation'];
  initial?: Geo | '';
  panel?: OneOfTreePickerProps<Geo>['panel'];
}) {
  const [stored, setStored] = useState<Geo | ''>(initial);
  const field = useOneOfTreeField<Geo>({
    id: 'cat', label: 'Category', nodes: GEO, expand: 'all', value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><OneOfTreePicker field={field} panel={panel} /><output>{field.value}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
/** The closed field (the select), the first element carrying the field's id; the drawer's list carries none. */
const root = () => document.querySelector<HTMLElement>('.ant-select[data-field-id="cat"]')!;
/** The open drawer (antd's root keeps an `-open` class while open). */
const openDrawer = () => document.querySelector<HTMLElement>('.ant-drawer.ant-drawer-open');
/** The drawer's tree rows, by label. */
const drawerRow = (label: string) => within(openDrawer()!).queryByRole('treeitem', { name: new RegExp(`^${label}\\b`) });
/** Taps the closed field the way a pointer does: mousedown (rc-select's own open request), then click. */
function tap(target: Element) {
  fireEvent.mouseDown(target);
  fireEvent.mouseUp(target);
  fireEvent.click(target);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OneOfTreePicker panel="drawer": the closed field', () => {
  it('shows the choice only: a tap opens no dropdown but a drawer from the bottom, titled with the label', async () => {
    wrap(<Inside panel="drawer" initialValue="alg" />);
    expect(openDrawer()).toBeNull();
    expect(within(root()).getByRole('combobox')).toHaveAttribute('readonly');
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    expect(openDrawer()).toHaveClass('ant-drawer-bottom');
    expect(within(openDrawer()!).getByText('Category')).toHaveClass('ant-drawer-title');
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
  });

  it('the drawer is 88% high', async () => {
    wrap(<Inside panel="drawer" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    expect(openDrawer()!.querySelector<HTMLElement>('.ant-drawer-content-wrapper')!.style.height).toBe('88%');
  });

  it('a tap anywhere on the field opens it', async () => {
    wrap(<Inside panel="drawer" />);
    tap(within(root()).getByRole('combobox'));
    await waitFor(() => expect(openDrawer()).not.toBeNull());
  });

  it('the keyboard opens it too (Enter on the focused field)', async () => {
    wrap(<Inside panel="drawer" />);
    const input = within(root()).getByRole('combobox');
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(openDrawer()).not.toBeNull());
  });

  it('the clear icon clears without opening it', async () => {
    wrap(<Inside panel="drawer" optional initialValue="alg" />);
    tap(root().querySelector('.ant-select-clear')!);
    await waitFor(() => expect(shown()).toBe(''));
    expect(openDrawer()).toBeNull();
  });

  it('a disabled field does not open it', async () => {
    wrap(<Inside panel="drawer" initialValue="alg" enabled={denyWithReason('Locked')} />);
    tap(root());
    const input = within(root()).getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 50));
    expect(openDrawer()).toBeNull();
  });

  it('a pending field does not open it either; its field is locked (focusable, said unavailable), not disabled', async () => {
    wrap(<Inside panel="drawer" initialValue="alg" pending />);
    const input = within(root()).getByRole('combobox');
    expect(input).not.toBeDisabled();
    expect(input).toHaveAttribute('aria-disabled', 'true');
    tap(root());
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 50));
    expect(openDrawer()).toBeNull();
  });
});

describe('OneOfTreePicker panel="drawer": the drawer', () => {
  it('holds a list of the field: notes in brackets, its own search box', async () => {
    wrap(<Inside panel="drawer" expand="all" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    expect(drawerRow('Kör')!.textContent).toContain('Kör (3)');
    expect(within(openDrawer()!).getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('the field id stays unique: the drawer\'s list carries no data-field-id or data-value', async () => {
    wrap(<Inside panel="drawer" initialValue="alg" expand="all" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    const carriers = document.querySelectorAll('[data-field-id="cat"]');
    expect(carriers).toHaveLength(1);
    expect(carriers[0]).toBe(root());
    expect(openDrawer()!.querySelector('[data-field-id]')).toBeNull();
  });

  it('its search filters', async () => {
    wrap(<Inside panel="drawer" expand="all" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.change(within(openDrawer()!).getByPlaceholderText('Search'), { target: { value: 'kor' } });
    await waitFor(() => expect(within(openDrawer()!).queryAllByRole('treeitem').map((r) => r.textContent))
      .toEqual(['Geometria', 'Síkgeometria', 'Kör (3)']));
  });

  it('choosing a node with no confirmation requests it and closes the drawer', async () => {
    wrap(<Inside panel="drawer" expand="all" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kör')!).getByText('Kör'));
    await waitFor(() => expect(shown()).toBe('kor'));
    expect(root()).toHaveAttribute('data-value', 'kor');
    await waitFor(() => expect(openDrawer()).toBeNull());
  });

  it('choosing a folder requests nothing and leaves the drawer open', async () => {
    wrap(<Inside panel="drawer" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Geometria')!).getByText('Geometria'));
    // The rows go when the tree's close motion ends, which a loaded host can stretch past waitFor's default second.
    await waitFor(() => expect(drawerRow('Síkgeometria')).toBeNull(), { timeout: 3000 });
    expect(openDrawer()).not.toBeNull();
  });

  it('choosing the node that is already current closes the drawer: nothing is requested', async () => {
    const onChange = vi.fn();
    function AlreadyCurrent() {
      const field = useOneOfTreeField<Geo>({
        id: 'cat', label: 'Category', nodes: GEO, expand: 'all', value: 'kor', onChange,
      });
      return <OneOfTreePicker field={field} panel="drawer" />;
    }
    wrap(<AlreadyCurrent />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kör')!).getByText('Kör'));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(openDrawer()).toBeNull());
  });

  it('choosing the already-current node still closes the drawer with an unrelated modal open elsewhere', async () => {
    const onChange = vi.fn();
    function AlreadyCurrentWithModal() {
      const field = useOneOfTreeField<Geo>({
        id: 'cat', label: 'Category', nodes: GEO, expand: 'all', value: 'kor', onChange,
      });
      // Unrelated to this field's own request path: an open modal elsewhere on the page must
      // not be mistaken for a confirmation this choice opened.
      return <><OneOfTreePicker field={field} panel="drawer" /><Modal open title="Unrelated">Elsewhere</Modal></>;
    }
    wrap(<AlreadyCurrentWithModal />);
    await screen.findByText('Unrelated');
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kör')!).getByText('Kör'));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(openDrawer()).toBeNull());
  });

  it('a value change from outside (the URL, the Back button, another widget) closes the drawer too', async () => {
    const { rerender } = wrap(<Outside value="alg" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    rerender(<AntApp><Outside value="kor" /></AntApp>);
    await waitFor(() => expect(shown()).toBe('kor'));
    await waitFor(() => expect(openDrawer()).toBeNull());
  });

  it('a choice with a popconfirm keeps the drawer open while it asks; OK closes it', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'popconfirm', question: 'Move it?' })} />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kör')!).getByText('Kör'));
    expect(await screen.findByText('Move it?')).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
    expect(openDrawer()).not.toBeNull();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith('kor');
    await waitFor(() => expect(shown()).toBe('kor'));
    await waitFor(() => expect(openDrawer()).toBeNull());
  });

  it('a choice with a popconfirm: Cancel keeps the drawer open', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'popconfirm', question: 'Move it?' })} />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kör')!).getByText('Kör'));
    expect(await screen.findByText('Move it?')).toBeInTheDocument();
    const cancel = screen.getAllByRole('button').find((b) => b.textContent === 'Cancel');
    fireEvent.click(cancel!);
    expect(fire).not.toHaveBeenCalled();
    expect(openDrawer()).not.toBeNull();
    expect(shown()).toBe('alg');
  });
});
