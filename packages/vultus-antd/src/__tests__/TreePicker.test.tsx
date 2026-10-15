import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useTreeField, type FieldCommit, type SpinnerProps, type TreeFieldOptions, type TreeNode, type TreeSelection,
} from 'vultus-core';
import { TreePicker } from '../TreePicker.js';
import { VultusProvider } from '../VultusProvider.js';
import { measureTags, stopMeasuring } from './helpers/measureTags.js';
import { openTooltips } from './helpers/tooltips.js';

type Cat = 'alg' | 'egy' | 'egyl' | 'ossz' | 'komb' | 'graf' | 'lesz' | 'geo';

const NODES: TreeNode<Cat>[] = [
  { value: 'alg', label: 'Algebra', note: '12', description: 'Equations and identities', children: [
    { value: 'egy', label: 'Egyenletek', note: '5' },
    { value: 'egyl', label: 'Egyenlőtlenségek', note: '4' },
    { value: 'ossz', label: 'Összegzés', note: '3' },
  ] },
  { value: 'komb', label: 'Kombinatorika', note: '4', children: [
    { value: 'graf', label: 'Gráfok', note: '0', dimmed: true },
    { value: 'lesz', label: 'Leszámlálás', note: '4' },
  ] },
  { value: 'geo', label: 'Geometria', note: '9', description: 'Plane geometry', enabled: denyWithReason('Not in this contest') },
];

type InsideOpts = Partial<Omit<TreeFieldOptions<Cat>, 'value' | 'onChange' | 'commit'>> & {
  listHeight?: number;
  popupMatchSelectWidth?: boolean | number;
};

function Inside({ listHeight, popupMatchSelectWidth, ...opts }: InsideOpts) {
  const field = useTreeField<Cat>({ id: 'cats', label: 'Categories', nodes: NODES, ...opts } as TreeFieldOptions<Cat>);
  return (
    <>
      <TreePicker field={field} listHeight={listHeight} popupMatchSelectWidth={popupMatchSelectWidth} />
      <output>{field.value.join(',')}</output>
    </>
  );
}

function Committed({ fire, confirmation, initial = [], selection }: {
  fire: (next: Cat[]) => Promise<void> | void;
  confirmation?: FieldCommit<Cat[]>['confirmation'];
  initial?: Cat[];
  selection?: TreeSelection;
}) {
  const [stored, setStored] = useState<Cat[]>(initial);
  const field = useTreeField<Cat>({
    id: 'cats', label: 'Categories', description: 'Which categories to show', nodes: NODES, selection, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><TreePicker field={field} /><output>{field.value.join(',')}</output></>;
}

/** A reference span painted with colorTextDescription, so tests compare against the live theme. */
function DescriptionColorProbe() {
  const { token } = theme.useToken();
  return <span data-testid="probe" style={{ color: token.colorTextDescription }} />;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const root = () => document.querySelector<HTMLElement>('[data-field-id="cats"]')!;
/** The span the field's tooltip is anchored on (withTooltip's), around the select. */
const anchor = () => root().closest<HTMLElement>('span[style]')!;

/** Opens the tree. */
async function openTree() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelectorAll('.ant-select-tree-treenode').length).toBeGreaterThan(0));
}

/** The open tree's rows, in order (not rc-tree's hidden one, which measures the indent). */
function treeRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ant-select-tree-treenode'))
    .filter((r) => !r.closest('[aria-hidden="true"]'));
}

/** The open tree's row for a node, by its label, if it is shown. */
function treeRow(label: string): HTMLElement | undefined {
  return treeRows().find((r) => r.querySelector('.ant-select-tree-title')?.textContent?.startsWith(label));
}

/** The labels of the open tree's rows, in order. */
function treeLabels(): string[] {
  return treeRows().map((r) => r.querySelector('.ant-select-tree-title [style*="space-between"] > :first-child')?.textContent ?? '');
}

/** Opens the tree (if closed) and clicks a node's checkbox. */
async function pick(label: string) {
  if (!treeRow(label)) await openTree();
  fireEvent.click(treeRow(label)!.querySelector('.ant-select-tree-checkbox')!);
}

/** The labels on the closed select's tags (only the shown ones, not "+ N ..."). */
function tags(): string[] {
  return Array.from(root().querySelectorAll('.ant-select-selection-item'))
    .filter((t) => !t.closest('.ant-select-content-item-rest'))
    .map((t) => t.querySelector('.ant-select-selection-item-content')?.textContent ?? '');
}

async function search(query: string) {
  if (!document.querySelector('.ant-select-tree-treenode')) await openTree();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
}

afterEach(() => {
  stopMeasuring();
  vi.restoreAllMocks();
});

describe('TreePicker: the closed field', () => {
  it.each([
    ['topmost', ['alg', 'graf'], ['Algebra', 'Gráfok']],
    ['all', ['komb', 'graf', 'lesz'], ['Kombinatorika', 'Gráfok', 'Leszámlálás']],
    ['leaves', ['graf', 'lesz'], ['Gráfok', 'Leszámlálás']],
    ['independent', ['komb', 'graf', 'lesz'], ['Kombinatorika', 'Gráfok', 'Leszámlálás']],
  ] as [TreeSelection, Cat[], string[]][])('shows the value as tags, by label, as %s lists it', async (selection, value, expected) => {
    // antd warns once per run: whichever test first renders `independent` checks it.
    const error = vi.spyOn(console, 'error');
    measureTags();
    wrap(<Inside selection={selection} initialValue={value} />);
    await waitFor(() => expect(tags()).toEqual(expected));
    expect(error.mock.calls.flat().join(' ')).not.toContain('Invalid prop `value`');
  });

  it('removing a tag requests the list without it', async () => {
    measureTags();
    wrap(<Inside initialValue={['alg', 'graf']} />);
    await waitFor(() => expect(tags()).toEqual(['Algebra', 'Gráfok']));
    const tag = Array.from(root().querySelectorAll<HTMLElement>('.ant-select-selection-item')).find((t) => t.textContent?.startsWith('Algebra'))!;
    fireEvent.click(tag.querySelector('.ant-select-selection-item-remove')!);
    await waitFor(() => expect(shown()).toBe('graf'));
  });

  it('clearing requests an empty list, values naming no node included', async () => {
    wrap(<Inside initialValue={['gone' as Cat, 'alg']} />);
    expect(shown()).toBe('alg,gone');
    fireEvent.click(root().querySelector('.ant-select-clear')!);
    await waitFor(() => expect(shown()).toBe(''));
  });

  it('shows the field\'s placeholder while empty', () => {
    wrap(<Inside placeholder="All categories" />);
    expect(screen.getByText('All categories')).toBeInTheDocument();
  });

  it('the field label is the accessible name; data-field-id and data-value (comma-joined) on the root', async () => {
    wrap(<Inside initialValue={['alg']} />);
    expect(screen.getByRole('combobox', { name: 'Categories' })).toBeInTheDocument();
    expect(root()).toHaveClass('ant-select');
    expect(root()).toHaveAttribute('data-value', 'alg');
    await pick('Kombinatorika');
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'alg,komb'));
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(root()).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('TreePicker: the open tree', () => {
  it('each node shows its note aside, right-aligned, in the description colour', async () => {
    wrap(<><Inside /><DescriptionColorProbe /></>);
    await openTree();
    const note = within(treeRow('Algebra')!).getByText('12');
    expect(note.style.color).not.toBe('');
    expect(note.style.color).toBe(screen.getByTestId('probe').style.color);
    const row = note.parentElement!;
    expect(row.style.display).toBe('flex');
    expect(row.style.justifyContent).toBe('space-between');
    expect(treeRow('Algebra')!.textContent).not.toContain('(12)');
  });

  it('opens at the field\'s expandedKeys (expand: top opens the roots)', async () => {
    wrap(<Inside />);
    await openTree();
    expect(treeLabels()).toEqual([
      'Algebra', 'Egyenletek', 'Egyenlőtlenségek', 'Összegzés', 'Kombinatorika', 'Gráfok', 'Leszámlálás', 'Geometria',
    ]);
  });

  it('expand: none keeps every node closed', async () => {
    wrap(<Inside expand="none" />);
    await openTree();
    expect(treeLabels()).toEqual(['Algebra', 'Kombinatorika', 'Geometria']);
  });

  it('a dimmed node\'s label is in the description colour, and it can still be selected', async () => {
    wrap(<><Inside /><DescriptionColorProbe /></>);
    await openTree();
    expect(within(treeRow('Gráfok')!).getByText('Gráfok').style.color).toBe(screen.getByTestId('probe').style.color);
    await pick('Gráfok');
    await waitFor(() => expect(shown()).toBe('graf'));
  });

  it('a disabled node cannot be selected; hovering it shows its reason, then its description', async () => {
    wrap(<Inside />);
    await pick('Geometria');
    expect(shown()).toBe('');
    fireEvent.click(within(treeRow('Geometria')!).getByText('Geometria'));
    expect(shown()).toBe('');
    fireEvent.mouseEnter(within(treeRow('Geometria')!).getByText('Geometria'));
    await waitFor(() => expect(screen.getByText('Not in this contest')).toBeInTheDocument());
    expect(screen.getByText('Plane geometry')).toBeInTheDocument();
  });

  it('hovering a node shows its description', async () => {
    wrap(<Inside />);
    await openTree();
    fireEvent.mouseEnter(within(treeRow('Algebra')!).getByText('Algebra'));
    await waitFor(() => expect(screen.getByText('Equations and identities')).toBeInTheDocument());
  });

  it('the tree is 520px high and 480px wide by default (as Taskmaster\'s)', async () => {
    wrap(<Inside />);
    await openTree();
    expect(document.querySelector<HTMLElement>('.ant-select-tree-list-holder')!.style.maxHeight).toBe('520px');
    expect(document.querySelector<HTMLElement>('.ant-select-dropdown')!.style.width).toBe('480px');
  });

  it('listHeight and popupMatchSelectWidth pass through', async () => {
    wrap(<Inside listHeight={300} popupMatchSelectWidth={360} />);
    await openTree();
    expect(document.querySelector<HTMLElement>('.ant-select-tree-list-holder')!.style.maxHeight).toBe('300px');
    expect(document.querySelector<HTMLElement>('.ant-select-dropdown')!.style.width).toBe('360px');
  });
});

describe('TreePicker: selecting (antd\'s conduction, normalized by the hook)', () => {
  it('a selected parent shows its children checked', async () => {
    wrap(<Inside initialValue={['alg']} />);
    await openTree();
    expect(treeRow('Egyenletek')).toHaveClass('ant-select-tree-treenode-checkbox-checked');
    expect(treeRow('Kombinatorika')).not.toHaveClass('ant-select-tree-treenode-checkbox-checked');
  });

  it.each([
    ['topmost', ['komb']],
    ['all', ['komb', 'graf', 'lesz']],
    ['leaves', ['graf', 'lesz']],
  ] as [TreeSelection, Cat[]][])('selecting a parent requests its subtree as %s lists it', async (selection, expected) => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} selection={selection} />);
    await pick('Kombinatorika');
    expect(fire).toHaveBeenCalledWith(expected);
    await waitFor(() => expect(shown()).toBe(expected.join(',')));
  });

  it('selecting every child of a parent requests the parent (topmost: SHOW_PARENT)', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} initial={['graf']} />);
    await pick('Leszámlálás');
    expect(fire).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(shown()).toBe('komb'));
  });

  it('unselecting a child of a selected parent requests its siblings', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} initial={['alg']} />);
    await pick('Egyenletek');
    expect(fire).toHaveBeenCalledWith(['egyl', 'ossz']);
    await waitFor(() => expect(shown()).toBe('egyl,ossz'));
  });

  it('clicking a node\'s label selects it too', async () => {
    wrap(<Inside />);
    await openTree();
    fireEvent.click(within(treeRow('Leszámlálás')!).getByText('Leszámlálás'));
    await waitFor(() => expect(shown()).toBe('lesz'));
  });

  it('independent: a parent alone, its children unchecked; plain values in and out, without antd\'s labelInValue warning', async () => {
    const error = vi.spyOn(console, 'error');
    const fire = vi.fn();
    wrap(<Committed fire={fire} selection="independent" />);
    await pick('Algebra');
    expect(fire).toHaveBeenLastCalledWith(['alg']);
    await waitFor(() => expect(shown()).toBe('alg'));
    expect(treeRow('Egyenletek')).not.toHaveClass('ant-select-tree-treenode-checkbox-checked');
    await pick('Egyenletek');
    expect(fire).toHaveBeenLastCalledWith(['alg', 'egy']);
    await waitFor(() => expect(shown()).toBe('alg,egy'));
    await pick('Algebra');
    expect(fire).toHaveBeenLastCalledWith(['egy']);
    await waitFor(() => expect(shown()).toBe('egy'));
    // antd warns once per run: whichever test first renders `independent` checks it.
    expect(error.mock.calls.flat().join(' ')).not.toContain('Invalid prop `value`');
  });

  it('a value naming no node is kept (at the end), and antd is not handed it (no tag)', async () => {
    measureTags();
    wrap(<Inside initialValue={['gone' as Cat, 'alg']} />);
    expect(shown()).toBe('alg,gone');
    await waitFor(() => expect(tags()).toEqual(['Algebra']));
    await pick('Kombinatorika');
    await waitFor(() => expect(shown()).toBe('alg,komb,gone'));
    await waitFor(() => expect(tags()).toEqual(['Algebra', 'Kombinatorika']));
  });
});

describe('TreePicker: search', () => {
  it('accent- and case-insensitive over the labels; keeps a match and its ancestors', async () => {
    wrap(<Inside />);
    await search('OSSZEG');
    await waitFor(() => expect(treeLabels()).toEqual(['Algebra', 'Összegzés']));
  });

  it('keeps a match\'s whole subtree, open', async () => {
    wrap(<Inside expand="none" />);
    await search('kombinatorika');
    await waitFor(() => expect(treeLabels()).toEqual(['Kombinatorika', 'Gráfok', 'Leszámlálás']));
  });

  it('selecting while searching keeps the selections the search hides', async () => {
    wrap(<Inside initialValue={['komb']} />);
    await search('egyenletek');
    await waitFor(() => expect(treeLabels()).toEqual(['Algebra', 'Egyenletek']));
    fireEvent.click(treeRow('Egyenletek')!.querySelector('.ant-select-tree-checkbox')!);
    await waitFor(() => expect(shown()).toBe('egy,komb'));
  });

  it('the search stays after a check, so several matches can be checked in a row', async () => {
    wrap(<Inside />);
    await search('egyenl');
    await waitFor(() => expect(treeLabels()).toEqual(['Algebra', 'Egyenletek', 'Egyenlőtlenségek']));
    fireEvent.click(treeRow('Egyenletek')!.querySelector('.ant-select-tree-checkbox')!);
    await waitFor(() => expect(shown()).toBe('egy'));
    expect(screen.getByRole('combobox')).toHaveValue('egyenl');
    expect(treeLabels()).toEqual(['Algebra', 'Egyenletek', 'Egyenlőtlenségek']);
    fireEvent.click(treeRow('Egyenlőtlenségek')!.querySelector('.ant-select-tree-checkbox')!);
    await waitFor(() => expect(shown()).toBe('egy,egyl'));
  });
});

describe('TreePicker: field conventions', () => {
  it('confirmation for the requested value: asks first, commits on OK', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'popconfirm', question: 'Change categories?' })} />);
    await pick('Kombinatorika');
    expect(fire).not.toHaveBeenCalled();
    expect(await screen.findByText('Change categories?')).toBeInTheDocument();
    const ok = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(shown()).toBe('komb'));
  });

  it('the confirmation is asked for the normalized value', async () => {
    const confirmation = vi.fn(() => undefined);
    wrap(<Committed fire={vi.fn()} confirmation={confirmation} initial={['graf']} />);
    await pick('Leszámlálás');
    expect(confirmation).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(shown()).toBe('komb'));
  });

  it('clearing asks the confirmation for the empty list', async () => {
    const confirmation = vi.fn((next: Cat[]) => (next.length === 0 ? { kind: 'popconfirm' as const, question: 'Show every task?' } : undefined));
    wrap(<Committed fire={vi.fn()} confirmation={confirmation} initial={['alg']} />);
    fireEvent.click(root().querySelector('.ant-select-clear')!);
    expect(confirmation).toHaveBeenLastCalledWith([]);
    expect(await screen.findByText('Show every task?')).toBeInTheDocument();
    expect(shown()).toBe('alg');
  });

  it('pending: a disabled, loading select', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    await pick('Kombinatorika');
    expect(fire).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(root()).toHaveClass('ant-select-loading'));
    expect(root()).toHaveClass('ant-select-disabled');
    await act(async () => { finish(); });
    await waitFor(() => expect(root()).not.toHaveClass('ant-select-loading'));
    expect(root()).not.toHaveClass('ant-select-disabled');
  });

  it('pending with a lent Spinner: it is the suffix icon, keyed to the field, size small', async () => {
    const calls: SpinnerProps[] = [];
    function RecSpinner(p: SpinnerProps) {
      calls.push(p);
      return <span data-testid="rec-spinner" data-key={p.spinnerKey} />;
    }
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<VultusProvider components={{ Spinner: RecSpinner }}><Committed fire={fire} /></VultusProvider>);
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    await pick('Kombinatorika');
    await waitFor(() => expect(root()).toHaveClass('ant-select-loading'));
    const suffix = root().querySelector<HTMLElement>('.ant-select-suffix')!;
    expect(within(suffix).getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:field:cats');
    expect(calls.at(-1)?.size).toBe('small');
    expect(root().querySelector('.anticon-loading')).toBeNull();
    await act(async () => { finish(); });
    await waitFor(() => expect(screen.queryByTestId('rec-spinner')).toBeNull());
  });

  it('a disabled field: a disabled select, its reason on hover, no change', async () => {
    wrap(<Inside initialValue={['alg']} enabled={denyWithReason('Read-only here')} />);
    expect(root()).toHaveClass('ant-select-disabled');
    fireEvent.mouseEnter(anchor());
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(document.querySelector('.ant-select-tree-treenode')).toBeNull();
    expect(shown()).toBe('alg');
  });

  it('the closed field shows its description on hover, held back while the tree is open', async () => {
    wrap(<Committed fire={vi.fn()} />);
    fireEvent.mouseEnter(anchor());
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(screen.getByText('Which categories to show')).toBeInTheDocument();
    await openTree();
    await waitFor(() => expect(openTooltips()).toHaveLength(0));
  });

  it('while a confirmation is open, the widget holds back its tooltips (they would cover it)', async () => {
    wrap(<Committed fire={vi.fn()} confirmation={() => ({ kind: 'popconfirm', question: 'Change categories?' })} />);
    await openTree();
    fireEvent.mouseEnter(within(treeRow('Algebra')!).getByText('Algebra'));
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    await pick('Kombinatorika');
    expect(await screen.findByText('Change categories?')).toBeInTheDocument();
    expect(openTooltips()).toHaveLength(0);
  });
});
