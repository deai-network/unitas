import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useTreeField, type FieldCommit, type TreeFieldOptions, type TreeNode, type TreeSelection,
} from 'vultus-core';
import { TreeChecklist } from '../TreeChecklist.js';
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

type InsideOpts = Partial<Omit<TreeFieldOptions<Cat>, 'value' | 'onChange' | 'commit'>>;

function Inside(opts: InsideOpts) {
  const field = useTreeField<Cat>({ id: 'cats', label: 'Categories', nodes: NODES, ...opts } as TreeFieldOptions<Cat>);
  return <><TreeChecklist field={field} /><output>{field.value.join(',')}</output></>;
}

function Committed({ fire, confirmation, initial = [], selection }: {
  fire: (next: Cat[]) => Promise<void> | void;
  confirmation?: FieldCommit<Cat[]>['confirmation'];
  initial?: Cat[];
  selection?: TreeSelection;
}) {
  const [stored, setStored] = useState<Cat[]>(initial);
  const field = useTreeField<Cat>({
    id: 'cats', label: 'Categories', nodes: NODES, selection, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><TreeChecklist field={field} /><output>{field.value.join(',')}</output></>;
}

/** A reference span painted with colorTextDescription, so tests compare against the live theme. */
function DescriptionColorProbe() {
  const { token } = theme.useToken();
  return <span data-testid="probe" style={{ color: token.colorTextDescription }} />;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const root = () => document.querySelector<HTMLElement>('[data-field-id="cats"]')!;
const nameOf = (label: string) => new RegExp(`^${label}\\b`);
/** A node's checkbox, named by its row (rc-tree labels it by the tree item). */
const checkbox = (label: string) => screen.getByRole('checkbox', { name: nameOf(label) });
/** A node's row, if it is shown (a row hidden by a search is not). */
const row = (label: string) => screen.queryByRole('treeitem', { name: nameOf(label) });
const search = (query: string) => fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: query } });
/**
 * Waits for antd's open/close motion to end: rc-tree ignores a switcher click
 * while its list is changing, and lets go a tick after the motion (which
 * jsdom never ends: the rows go at its deadline).
 */
async function settled() {
  await waitFor(() => expect(document.querySelector('.ant-tree-treenode-motion')).toBeNull(), { timeout: 3000 });
  await act(() => new Promise((resolve) => { setTimeout(resolve, 0); }));
}

afterEach(() => { vi.restoreAllMocks(); });

describe('TreeChecklist: rendering', () => {
  it('renders the tree open at the top, each node with its note in brackets after the label', () => {
    wrap(<><Inside /><DescriptionColorProbe /></>);
    expect(row('Algebra')).toBeInTheDocument();
    expect(row('Egyenletek')).toBeInTheDocument();
    expect(row('Leszámlálás')).toBeInTheDocument();
    const note = screen.getByText('(12)');
    expect(note.style.color).not.toBe('');
    expect(note.style.color).toBe(screen.getByTestId('probe').style.color);
    expect(row('Algebra')!.textContent).toContain('Algebra (12)');
  });

  it('a dimmed node\'s label is in the description colour, and it can still be checked', async () => {
    wrap(<><Inside /><DescriptionColorProbe /></>);
    const label = screen.getByText('Gráfok');
    expect(label.style.color).toBe(screen.getByTestId('probe').style.color);
    expect(checkbox('Gráfok')).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(checkbox('Gráfok'));
    await waitFor(() => expect(shown()).toBe('graf'));
  });

  it('a disabled node\'s checkbox is disabled, and clicking it requests nothing', () => {
    wrap(<Inside />);
    expect(checkbox('Geometria')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(checkbox('Geometria'));
    expect(shown()).toBe('');
  });

  it('the field label is the tree\'s accessible name; data-value is the value, comma-joined', async () => {
    wrap(<Inside initialValue={['alg']} />);
    expect(screen.getByRole('tree', { name: 'Categories' })).toBeInTheDocument();
    expect(root()).toHaveAttribute('data-value', 'alg');
    fireEvent.click(checkbox('Kombinatorika'));
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'alg,komb'));
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(root()).toBeNull();
  });

  it('the user can collapse and expand a node', async () => {
    wrap(<Inside />);
    fireEvent.click(row('Algebra')!.querySelector<HTMLElement>('.ant-tree-switcher')!);
    await settled();
    expect(row('Egyenletek')).toBeNull();
    fireEvent.click(row('Algebra')!.querySelector<HTMLElement>('.ant-tree-switcher')!);
    await waitFor(() => expect(row('Egyenletek')).toBeInTheDocument());
  });

  it('starts from the field\'s expandedKeys (expand: none keeps every node closed)', () => {
    wrap(<Inside expand="none" />);
    expect(row('Algebra')).toBeInTheDocument();
    expect(row('Egyenletek')).toBeNull();
  });
});

describe('TreeChecklist: checking (antd\'s conduction, normalized by the hook)', () => {
  it('a checked parent shows its children checked', () => {
    wrap(<Inside initialValue={['alg']} />);
    expect(checkbox('Algebra')).toHaveAttribute('aria-checked', 'true');
    expect(checkbox('Egyenletek')).toHaveAttribute('aria-checked', 'true');
    expect(checkbox('Kombinatorika')).toHaveAttribute('aria-checked', 'false');
  });

  it.each([
    ['topmost', ['komb']],
    ['all', ['komb', 'graf', 'lesz']],
    ['leaves', ['graf', 'lesz']],
  ] as [TreeSelection, Cat[]][])('checking a parent requests its subtree as %s lists it', async (selection, expected) => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} selection={selection} />);
    fireEvent.click(checkbox('Kombinatorika'));
    expect(fire).toHaveBeenCalledWith(expected);
    await waitFor(() => expect(shown()).toBe(expected.join(',')));
  });

  it('checking every child of a parent requests the parent (topmost)', async () => {
    wrap(<Inside initialValue={['graf']} />);
    fireEvent.click(checkbox('Leszámlálás'));
    await waitFor(() => expect(shown()).toBe('komb'));
  });

  it('unchecking a child of a checked parent requests its siblings', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} initial={['alg']} />);
    fireEvent.click(checkbox('Egyenletek'));
    expect(fire).toHaveBeenCalledWith(['egyl', 'ossz']);
    await waitFor(() => expect(shown()).toBe('egyl,ossz'));
  });

  it('clicking a node\'s label checks it too', async () => {
    wrap(<Inside />);
    fireEvent.click(screen.getByText('Leszámlálás'));
    await waitFor(() => expect(shown()).toBe('lesz'));
  });

  it('independent: checking a parent requests it alone, and its children stay unchecked', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} selection="independent" />);
    fireEvent.click(checkbox('Algebra'));
    expect(fire).toHaveBeenLastCalledWith(['alg']);
    await waitFor(() => expect(shown()).toBe('alg'));
    expect(checkbox('Egyenletek')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(checkbox('Egyenletek'));
    expect(fire).toHaveBeenLastCalledWith(['alg', 'egy']);
    await waitFor(() => expect(shown()).toBe('alg,egy'));
    expect(checkbox('Algebra')).toHaveAttribute('aria-checked', 'true');
  });

  it('a value naming no node is kept (at the end), and antd is not handed it', async () => {
    const error = vi.spyOn(console, 'error');
    wrap(<Inside initialValue={['gone' as Cat, 'alg']} />);
    expect(shown()).toBe('alg,gone');
    fireEvent.click(checkbox('Kombinatorika'));
    await waitFor(() => expect(shown()).toBe('alg,komb,gone'));
    expect(error.mock.calls.flat().join(' ')).not.toContain('Tree missing');
  });
});

describe('TreeChecklist: search', () => {
  it('keeps a match and its ancestors, accent- and case-insensitive', () => {
    wrap(<Inside />);
    search('OSSZEG');
    expect(row('Összegzés')).toBeInTheDocument();
    expect(row('Algebra')).toBeInTheDocument();
    expect(row('Egyenletek')).toBeNull();
    expect(row('Kombinatorika')).toBeNull();
    expect(row('Geometria')).toBeNull();
  });

  it('keeps a match\'s whole subtree', () => {
    wrap(<Inside />);
    search('kombinatorika');
    expect(row('Kombinatorika')).toBeInTheDocument();
    expect(row('Gráfok')).toBeInTheDocument();
    expect(row('Leszámlálás')).toBeInTheDocument();
    expect(row('Algebra')).toBeNull();
  });

  it('opens every kept node while searching; clearing the search restores the user\'s expansion', async () => {
    wrap(<Inside expand="none" />);
    expect(row('Gráfok')).toBeNull();
    search('graf');
    await waitFor(() => expect(row('Gráfok')).toBeInTheDocument());
    expect(row('Kombinatorika')).toBeInTheDocument();
    search('');
    await waitFor(() => expect(row('Gráfok')).toBeNull());
    expect(row('Algebra')).toBeInTheDocument();
  });

  it('checking while searching keeps the selections the search hides', async () => {
    wrap(<Inside initialValue={['komb']} />);
    search('egyenletek');
    fireEvent.click(checkbox('Egyenletek'));
    await waitFor(() => expect(shown()).toBe('egy,komb'));
  });

  it('checking the one shown child of a parent does not check the parent (conduction over the whole tree)', async () => {
    wrap(<Inside />);
    search('osszeg');
    fireEvent.click(checkbox('Összegzés'));
    await waitFor(() => expect(shown()).toBe('ossz'));
    expect(checkbox('Algebra')).toHaveAttribute('aria-checked', 'mixed');
  });

  it('a new query opens every kept node again, even one the user closed under an earlier, retyped query', async () => {
    wrap(<Inside expand="none" />);
    search('graf');
    await settled();
    expect(row('Gráfok')).toBeInTheDocument();
    fireEvent.click(row('Kombinatorika')!.querySelector<HTMLElement>('.ant-tree-switcher')!);
    await settled();
    expect(row('Gráfok')).toBeNull();
    search('gra');
    await waitFor(() => expect(row('Gráfok')).toBeInTheDocument());
    search('graf');
    await settled();
    expect(row('Gráfok')).toBeInTheDocument();
  });

  it('no matches: antd\'s empty notice instead of the tree', () => {
    wrap(<Inside initialValue={['alg']} />);
    search('zzz');
    expect(screen.queryByRole('tree')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(document.querySelector('.ant-empty')).toBeTruthy();
    search('');
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(document.querySelector('.ant-empty')).toBeNull();
    expect(shown()).toBe('alg');
  });

  it('the search box is named after the field', () => {
    wrap(<Inside />);
    expect(screen.getByRole('textbox', { name: 'Search Categories' })).toBeInTheDocument();
  });
});

/** The tree's active (keyboard) node: its row, from the tree's aria-activedescendant. */
function activeRow(): HTMLElement | null {
  const id = screen.getByRole('tree').getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
}
const press = (key: string) => fireEvent.keyDown(screen.getByRole('tree'), { key });
const focusTree = () => act(() => { screen.getByRole('tree').focus(); });

describe('TreeChecklist: keyboard while searching (never onto a hidden node)', () => {
  it('focus activates the first shown node, and Space checks it (not a hidden one)', async () => {
    wrap(<Inside />);
    search('kombinatorika');
    focusTree();
    await waitFor(() => expect(activeRow()?.textContent).toMatch(/^Kombinatorika/));
    press(' ');
    await waitFor(() => expect(shown()).toBe('komb'));
  });

  it('arrows, Home and End skip hidden nodes in the direction of travel, wrapping around', async () => {
    wrap(<Inside />);
    search('kombinatorika');
    focusTree();
    const expectActive = async (label: string) => {
      await waitFor(() => expect(activeRow()?.textContent).toMatch(nameOf(label)));
      expect(activeRow()).toBeVisible();
    };
    await expectActive('Kombinatorika');
    press('ArrowDown');
    await expectActive('Gráfok');
    press('ArrowDown');
    await expectActive('Leszámlálás');
    press('ArrowDown'); // Geometria and Algebra are hidden: wraps to Kombinatorika
    await expectActive('Kombinatorika');
    press('ArrowUp'); // Algebra and Geometria are hidden: back to Leszámlálás
    await expectActive('Leszámlálás');
    press('Home');
    await expectActive('Kombinatorika');
    press('End');
    await expectActive('Leszámlálás');
    press(' ');
    await waitFor(() => expect(shown()).toBe('lesz'));
  });

  it('ArrowRight onto a hidden first child moves on to the next shown node', async () => {
    wrap(<Inside />);
    search('osszeg');
    focusTree();
    await waitFor(() => expect(activeRow()?.textContent).toMatch(/^Algebra/));
    press('ArrowRight'); // Egyenletek and Egyenlőtlenségek are hidden
    await waitFor(() => expect(activeRow()?.textContent).toMatch(/^Összegzés/));
  });
});

describe('TreeChecklist: animation', () => {
  it('a re-render of its own while a node opens does not cut the opening short', async () => {
    wrap(<Inside expand="none" />);
    fireEvent.click(row('Algebra')!.querySelector<HTMLElement>('.ant-tree-switcher')!);
    await waitFor(() => expect(document.querySelector('.ant-tree-treenode-motion')).not.toBeNull());
    focusTree(); // activates the first node: TreeChecklist re-renders, the field unchanged
    await waitFor(() => expect(activeRow()?.textContent).toMatch(/^Algebra/));
    expect(document.querySelector('.ant-tree-treenode-motion')).not.toBeNull();
  });
});

describe('TreeChecklist: field conventions', () => {
  it('confirmation for the requested value: asks first, commits on OK', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'popconfirm', question: 'Change categories?' })} />);
    fireEvent.click(checkbox('Kombinatorika'));
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
    fireEvent.click(checkbox('Leszámlálás'));
    expect(confirmation).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(shown()).toBe('komb'));
  });

  it('pending disables the tree and shows a spinner', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    fireEvent.click(checkbox('Kombinatorika'));
    expect(fire).toHaveBeenCalledWith(['komb']);
    await waitFor(() => expect(checkbox('Algebra')).toHaveAttribute('aria-disabled', 'true'));
    expect(document.querySelector('.ant-spin')).toBeTruthy();
    await act(async () => { finish(); });
    await waitFor(() => expect(checkbox('Algebra')).not.toHaveAttribute('aria-disabled', 'true'));
    expect(document.querySelector('.ant-spin')).toBeNull();
  });

  it('an enabled field: hovering a node shows its description; a disabled node its reason, then its description', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(screen.getByText('Geometria'));
    await waitFor(() => expect(screen.getByText('Not in this contest')).toBeInTheDocument());
    expect(screen.getByText('Plane geometry')).toBeInTheDocument();
  });

  it('a disabled field: its reason over the tree on hover, every node disabled, no change', async () => {
    wrap(<Inside enabled={denyWithReason('Read-only here')} />);
    expect(checkbox('Kombinatorika')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.mouseEnter(screen.getByRole('tree'));
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    fireEvent.click(checkbox('Kombinatorika'));
    expect(shown()).toBe('');
  });

  it('while a confirmation is open, the widget holds back its tooltips (they would cover it)', async () => {
    wrap(<Committed fire={vi.fn()} confirmation={() => ({ kind: 'popconfirm', question: 'Change categories?' })} />);
    fireEvent.mouseEnter(screen.getByText('Algebra'));
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    fireEvent.click(checkbox('Kombinatorika'));
    expect(await screen.findByText('Change categories?')).toBeInTheDocument();
    expect(openTooltips()).toHaveLength(0);
  });
});
