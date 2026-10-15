import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useTreeField, type FieldCommit, type TreeFieldOptions, type TreeNode,
} from 'vultus-core';
import type { VultusTexts } from '../texts.js';
import { TreePicker, type TreePickerProps } from '../TreePicker.js';
import { VultusProvider } from '../VultusProvider.js';
import { measureTags, stopMeasuring } from './helpers/measureTags.js';

type Cat = 'szam' | 'oszt' | 'lnko' | 'komb' | 'graf' | 'lesz' | 'val';

const NODES: TreeNode<Cat>[] = [
  { value: 'szam', label: 'Számelmélet és oszthatóság', note: '9', children: [
    { value: 'oszt', label: 'Oszthatóság', note: '6' },
    { value: 'lnko', label: 'Osztók, legnagyobb közös osztó', note: '3' },
  ] },
  { value: 'komb', label: 'Kombinatorika', note: '4', children: [
    { value: 'graf', label: 'Gráfok és utak bejárása', note: '2' },
    { value: 'lesz', label: 'Leszámlálás', note: '2' },
  ] },
  { value: 'val', label: 'Feltételes valószínűség', note: '0', dimmed: true },
];

type Display = Pick<TreePickerProps<Cat>, 'panel' | 'summary'>;
type InsideOpts = Partial<Omit<TreeFieldOptions<Cat>, 'value' | 'onChange' | 'commit'>> & Display;

function Inside({ panel, summary, ...opts }: InsideOpts) {
  const field = useTreeField<Cat>({ id: 'cats', label: 'Categories', nodes: NODES, ...opts } as TreeFieldOptions<Cat>);
  return <><TreePicker field={field} panel={panel} summary={summary} /><output>{field.value.join(',')}</output></>;
}

function Committed({ fire, confirmation, initial = [], panel, summary }: Display & {
  fire: (next: Cat[]) => Promise<void> | void;
  confirmation?: FieldCommit<Cat[]>['confirmation'];
  initial?: Cat[];
}) {
  const [stored, setStored] = useState<Cat[]>(initial);
  const field = useTreeField<Cat>({
    id: 'cats', label: 'Categories', nodes: NODES, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><TreePicker field={field} panel={panel} summary={summary} /><output>{field.value.join(',')}</output></>;
}

const wrap = (node: React.ReactNode, texts?: Partial<VultusTexts>) =>
  render(<AntApp>{texts ? <VultusProvider texts={texts}>{node}</VultusProvider> : node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
/** The closed field (the select), the first element carrying the field's id; the drawer's checklist carries it too. */
const root = () => document.querySelector<HTMLElement>('.ant-select[data-field-id="cats"]')!;
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
  stopMeasuring();
  vi.restoreAllMocks();
});

describe('TreePicker panel="drawer": the closed field', () => {
  it('shows the choice only: a tap opens no dropdown but a drawer from the bottom, titled with the label', async () => {
    wrap(<Inside panel="drawer" initialValue={['komb']} />);
    expect(openDrawer()).toBeNull();
    expect(within(root()).getByRole('combobox')).toHaveAttribute('readonly');
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    expect(openDrawer()).toHaveClass('ant-drawer-bottom');
    expect(within(openDrawer()!).getByText('Categories')).toHaveClass('ant-drawer-title');
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
  });

  it('the drawer is 88% high', async () => {
    wrap(<Inside panel="drawer" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    expect(openDrawer()!.querySelector<HTMLElement>('.ant-drawer-content-wrapper')!.style.height).toBe('88%');
  });

  it('a tap anywhere on the field opens it, the search input included', async () => {
    wrap(<Inside panel="drawer" />);
    tap(within(root()).getByRole('combobox'));
    await waitFor(() => expect(openDrawer()).not.toBeNull());
  });

  it('a second tap on the (still focused) field opens it again', async () => {
    wrap(<Inside panel="drawer" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(openDrawer()!).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(openDrawer()).toBeNull());
    fireEvent.click(root());
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
    wrap(<Inside panel="drawer" initialValue={['komb', 'oszt']} />);
    tap(root().querySelector('.ant-select-clear')!);
    await waitFor(() => expect(shown()).toBe(''));
    expect(openDrawer()).toBeNull();
  });

  it('a tag\'s remove icon removes it without opening it', async () => {
    measureTags();
    wrap(<Inside panel="drawer" initialValue={['komb', 'oszt']} />);
    await waitFor(() => expect(root().querySelectorAll('.ant-select-selection-item-remove')).toHaveLength(2));
    const remove = Array.from(root().querySelectorAll('.ant-select-selection-item'))
      .find((t) => t.textContent?.startsWith('Kombinatorika'))!
      .querySelector('.ant-select-selection-item-remove')!;
    tap(remove);
    await waitFor(() => expect(shown()).toBe('oszt'));
    expect(openDrawer()).toBeNull();
  });

  it('a disabled field does not open it', async () => {
    wrap(<Inside panel="drawer" initialValue={['komb']} enabled={denyWithReason('Locked')} />);
    tap(root());
    const input = within(root()).getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 50));
    expect(openDrawer()).toBeNull();
  });
});

describe('TreePicker panel="drawer": the drawer', () => {
  it('holds a checklist of the field: notes in brackets, its own search box', async () => {
    wrap(<Inside panel="drawer" />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    expect(drawerRow('Kombinatorika')!.textContent).toContain('Kombinatorika (4)');
    expect(within(openDrawer()!).getAllByRole('textbox')).toHaveLength(1);
    expect(within(openDrawer()!).getByPlaceholderText('Search')).toBeInTheDocument();
  });

  it('Done (texts.done, a primary button) closes it', async () => {
    wrap(<Inside panel="drawer" />, { done: 'Kész' });
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    const done = within(openDrawer()!).getByRole('button', { name: 'Kész' });
    expect(done).toHaveClass('ant-btn-primary');
    expect(done.closest('.ant-drawer-extra')).not.toBeNull();
    fireEvent.click(done);
    await waitFor(() => expect(openDrawer()).toBeNull());
  });

  it('checking in it requests at once, through the field\'s commit; the closed field shows it', async () => {
    const fire = vi.fn();
    wrap(<Committed panel="drawer" fire={fire} />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kombinatorika')!).getByRole('checkbox'));
    expect(fire).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(shown()).toBe('komb'));
    expect(root()).toHaveAttribute('data-value', 'komb');
    expect(openDrawer()).not.toBeNull();
  });

  it('checking in it asks the field\'s confirmation first', async () => {
    const fire = vi.fn();
    wrap(<Committed panel="drawer" fire={fire} confirmation={() => ({ kind: 'popconfirm', question: 'Change categories?' })} />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kombinatorika')!).getByRole('checkbox'));
    expect(await screen.findByText('Change categories?')).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(shown()).toBe('komb'));
  });
});

describe('TreePicker summary="firstWords"', () => {
  /** The closed field's selection items: with summary="firstWords", only the one summary. */
  const items = () => Array.from(root().querySelectorAll('.ant-select-selection-item'));

  it('two selections: the first words of each, about 16 characters, joined with ", " (no tags)', async () => {
    wrap(<Inside summary="firstWords" initialValue={['szam', 'graf']} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(items()[0].textContent).toBe('Számelmélet és…, Gráfok és utak…');
    expect(root().querySelector('.ant-select-selection-item-remove')).toBeNull();
  });

  it('never ends a cut on one of texts.joiningWords', async () => {
    wrap(<Inside summary="firstWords" initialValue={['szam', 'graf']} />, { joiningWords: ['és', 'a', 'az'] });
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(items()[0].textContent).toBe('Számelmélet…, Gráfok és utak…');
  });

  it('one selection: about 40 characters', async () => {
    wrap(<Inside summary="firstWords" initialValue={['lnko']} />);
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(items()[0].textContent).toBe('Osztók, legnagyobb közös osztó');
  });

  it('nothing selected: the field\'s placeholder', () => {
    wrap(<Inside summary="firstWords" placeholder="All categories" />);
    expect(items()).toHaveLength(0);
    expect(screen.getByText('All categories')).toBeInTheDocument();
  });

  it('follows the value', async () => {
    wrap(<Inside summary="firstWords" panel="drawer" initialValue={['lnko']} />);
    tap(root());
    await waitFor(() => expect(openDrawer()).not.toBeNull());
    fireEvent.click(within(drawerRow('Kombinatorika')!).getByRole('checkbox'));
    await waitFor(() => expect(items()[0].textContent).toBe('Osztók…, Kombinatorika'));
  });
});
