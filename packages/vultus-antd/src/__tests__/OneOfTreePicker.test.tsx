import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useOneOfTreeField, type FieldCommit, type FieldDefinition, type OneOfTreeFieldOptions, type TreeNode,
} from 'vultus-core';
import { Field } from '../Field.js';
import { OneOfTreePicker, type OneOfTreePickerProps } from '../OneOfTreePicker.js';

type Geo = 'geo' | 'sik' | 'kor' | 'ter' | 'alg';

// Geometria (a folder) > Síkgeometria > Kör (a note), Térgeometria (disabled); Algebra (a
// description). vultus-core's useOneOfTreeField test tree, with the note and the description.
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
  & Omit<OneOfTreePickerProps<Geo>, 'field'>;

function Inside({ summary, listHeight, popupMatchSelectWidth, ...opts }: InsideOpts) {
  const field = useOneOfTreeField<Geo>({ id: 'cat', label: 'Category', nodes: GEO, ...opts } as OneOfTreeFieldOptions<Geo>);
  return (
    <>
      <OneOfTreePicker field={field} summary={summary} listHeight={listHeight} popupMatchSelectWidth={popupMatchSelectWidth} />
      <output>{field.value}</output>
    </>
  );
}

/** A field whose value the render site keeps, so a test can change it from outside. */
function Outside({ value }: { value: Geo | '' }) {
  const field = useOneOfTreeField<Geo>({ id: 'cat', label: 'Category', nodes: GEO, value, onChange: () => {} });
  return <><OneOfTreePicker field={field} /><output>{field.value}</output></>;
}

function Committed({ fire, confirmation, optional }: {
  fire: (next: Geo | '') => Promise<void> | void;
  confirmation?: FieldCommit<Geo | ''>['confirmation'];
  optional?: boolean;
}) {
  const [stored, setStored] = useState<Geo | ''>('alg');
  const field = useOneOfTreeField<Geo>({
    id: 'cat', label: 'Category', nodes: GEO, expand: 'all', optional, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><OneOfTreePicker field={field} /><output>{field.value}</output></>;
}

/** A reference span painted with colorTextDescription, so tests compare against the live theme. */
function DescriptionColorProbe() {
  const { token } = theme.useToken();
  return <span data-testid="probe" style={{ color: token.colorTextDescription }} />;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const root = () => document.querySelector<HTMLElement>('[data-field-id="cat"]')!;
const combobox = () => screen.getByRole('combobox');

/** Opens the tree. */
async function openTree() {
  fireEvent.mouseDown(combobox());
  await waitFor(() => expect(treeRows().length).toBeGreaterThan(0));
}

/** The open tree's rows, in order (not rc-tree's hidden one, which measures the indent). */
function treeRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ant-select-tree-treenode'))
    .filter((r) => !r.closest('[aria-hidden="true"]'));
}

/** The label of an open tree's row. */
const rowLabel = (row: HTMLElement) => row.querySelector('.ant-select-tree-title [style*="space-between"] > :first-child')?.textContent ?? '';

/** The open tree's row for a node, by its label, if it is shown. */
function treeRow(label: string): HTMLElement | undefined {
  return treeRows().find((r) => rowLabel(r) === label);
}

/** The labels of the open tree's rows, in order. */
function treeLabels(): string[] {
  return treeRows().map(rowLabel);
}

/** Opens the tree (if closed) and clicks a node's label. */
async function pick(label: string) {
  if (!treeRow(label)) await openTree();
  fireEvent.click(within(treeRow(label)!).getByText(label));
}

/** What the closed field shows: its selected item, or its placeholder. */
const closedText = () => root().querySelector('.ant-select-content')?.textContent ?? root().textContent;

async function search(query: string) {
  if (treeRows().length === 0) await openTree();
  fireEvent.change(combobox(), { target: { value: query } });
}

const isOpen = () => combobox().getAttribute('aria-expanded') === 'true';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OneOfTreePicker: choosing', () => {
  it('clicking a node that can be chosen requests it and closes the tree', async () => {
    wrap(<Inside expand="all" />);
    expect(shown()).toBe('sik');
    await pick('Kör');
    await waitFor(() => expect(shown()).toBe('kor'));
    await waitFor(() => expect(isOpen()).toBe(false));
  });

  it('a folder requests nothing: a click opens or closes it, the tree staying open', async () => {
    wrap(<Inside />);
    await openTree();
    // expand 'selected': the value (Síkgeometria) shows, under its open parent.
    expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Térgeometria', 'Algebra']);
    fireEvent.click(within(treeRow('Geometria')!).getByText('Geometria'));
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Algebra']));
    expect(shown()).toBe('sik');
    expect(isOpen()).toBe(true);
    fireEvent.click(within(treeRow('Geometria')!).getByText('Geometria'));
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Térgeometria', 'Algebra']));
    expect(shown()).toBe('sik');
  });

  it("under choose: 'leaves' a node with children requests nothing: a click opens or closes it", async () => {
    wrap(<Inside choose="leaves" />);
    expect(shown()).toBe('kor');
    await openTree();
    expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Kör', 'Térgeometria', 'Algebra']);
    fireEvent.click(within(treeRow('Síkgeometria')!).getByText('Síkgeometria'));
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Térgeometria', 'Algebra']));
    expect(shown()).toBe('kor');
    expect(isOpen()).toBe(true);
  });

  it('a disabled node cannot be chosen; hovering it shows its reason', async () => {
    wrap(<Inside />);
    await pick('Térgeometria');
    expect(shown()).toBe('sik');
    fireEvent.mouseEnter(within(treeRow('Térgeometria')!).getByText('Térgeometria'));
    await waitFor(() => expect(screen.getByText('later')).toBeInTheDocument());
    expect(shown()).toBe('sik');
  });

  it('each node shows its note aside, right-aligned, in the description colour', async () => {
    wrap(<><Inside expand="all" /><DescriptionColorProbe /></>);
    await openTree();
    const note = within(treeRow('Kör')!).getByText('3');
    expect(note.style.color).toBe(screen.getByTestId('probe').style.color);
    expect(note.parentElement!.style.justifyContent).toBe('space-between');
  });

  it('the tree is 520px high and 480px wide by default; listHeight and popupMatchSelectWidth pass through', async () => {
    const { unmount } = wrap(<Inside />);
    await openTree();
    expect(document.querySelector<HTMLElement>('.ant-select-tree-list-holder')!.style.maxHeight).toBe('520px');
    expect(document.querySelector<HTMLElement>('.ant-select-dropdown')!.style.width).toBe('480px');
    unmount();
    wrap(<Inside listHeight={300} popupMatchSelectWidth={360} />);
    await openTree();
    expect(document.querySelector<HTMLElement>('.ant-select-tree-list-holder')!.style.maxHeight).toBe('300px');
    expect(document.querySelector<HTMLElement>('.ant-select-dropdown')!.style.width).toBe('360px');
  });
});

describe('OneOfTreePicker: the open tree follows the value', () => {
  const ALL_OPEN = ['Geometria', 'Síkgeometria', 'Kör', 'Térgeometria', 'Algebra'];

  it("a value changed while closed: opening shows it, its ancestors open", async () => {
    const { rerender } = wrap(<Outside value="alg" />);
    await openTree();
    expect(treeLabels()).toEqual(['Geometria', 'Algebra']);
    fireEvent.keyDown(combobox(), { key: 'Escape', keyCode: 27, which: 27 });
    await waitFor(() => expect(isOpen()).toBe(false));
    rerender(<AntApp><Outside value="kor" /></AntApp>);
    fireEvent.mouseDown(combobox());
    await waitFor(() => expect(treeLabels()).toEqual(ALL_OPEN));
  });

  it("expand 'none' opens no folder, but opening the tree opens the value's ancestors, without antd's scrollTo warning", async () => {
    const error = vi.spyOn(console, 'error');
    wrap(<Inside expand="none" initialValue="kor" />);
    await openTree();
    expect(treeLabels()).toEqual(ALL_OPEN);
    expect(error.mock.calls.flat().join(' ')).not.toContain('scrollTo');
  });

  it("the user's own expansion is kept, the value's ancestors joining it", async () => {
    wrap(<Inside initialValue="alg" />);
    await openTree();
    fireEvent.click(within(treeRow('Geometria')!).getByText('Geometria'));
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Térgeometria', 'Algebra']));
    fireEvent.keyDown(combobox(), { key: 'Escape', keyCode: 27, which: 27 });
    await waitFor(() => expect(isOpen()).toBe(false));
    fireEvent.mouseDown(combobox());
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Térgeometria', 'Algebra']);
  });

  it('choosing a node with children leaves it open', async () => {
    wrap(<Inside initialValue="kor" />);
    await openTree();
    expect(treeLabels()).toEqual(ALL_OPEN);
    fireEvent.click(within(treeRow('Síkgeometria')!).getByText('Síkgeometria'));
    await waitFor(() => expect(shown()).toBe('sik'));
    await waitFor(() => expect(isOpen()).toBe(false));
    fireEvent.mouseDown(combobox());
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(treeLabels()).toEqual(ALL_OPEN);
  });

  it('a search opens everything it shows; the expansion from before comes back after it', async () => {
    wrap(<Inside initialValue="alg" />);
    await search('kor');
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Kör']));
    fireEvent.keyDown(combobox(), { key: 'Escape', keyCode: 27, which: 27 });
    await waitFor(() => expect(isOpen()).toBe(false));
    fireEvent.mouseDown(combobox());
    await waitFor(() => expect(isOpen()).toBe(true));
    expect(treeLabels()).toEqual(['Geometria', 'Algebra']);
  });
});

describe('OneOfTreePicker: the closed field', () => {
  it("shows the chosen node's label; summary=\"path\" shows its path", async () => {
    const { unmount } = wrap(<Inside initialValue="kor" />);
    expect(closedText()).toBe('Kör');
    unmount();
    wrap(<Inside initialValue="kor" summary="path" />);
    expect(closedText()).toBe('Geometria › Síkgeometria › Kör');
  });

  it('a value naming no node shows the placeholder, never the raw value', () => {
    wrap(<Inside initialValue={'gone' as Geo} placeholder="Pick a category" />);
    expect(shown()).toBe('gone');
    expect(closedText()).toBe('Pick a category');
    expect(root().textContent).not.toContain('gone');
  });

  it('the field label is the accessible name; data-field-id and data-value on the root', async () => {
    wrap(<Inside expand="all" />);
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
    expect(root()).toHaveClass('ant-select');
    expect(root()).toHaveAttribute('data-value', 'sik');
    await pick('Algebra');
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'alg'));
  });

  it('optional: the placeholder while empty, and a clear button that requests empty', async () => {
    wrap(<Inside optional initialValue="alg" placeholder="All categories" />);
    expect(closedText()).toBe('Algebra');
    fireEvent.click(root().querySelector('.ant-select-clear')!);
    await waitFor(() => expect(shown()).toBe(''));
    expect(closedText()).toBe('All categories');
  });

  it('not optional: no clear button', () => {
    wrap(<Inside initialValue="alg" />);
    expect(root().querySelector('.ant-select-clear')).toBeNull();
  });

  it('no native tooltip (the label as a title) competes with the field\'s own', () => {
    wrap(<Inside initialValue="kor" summary="path" />);
    expect(Array.from(root().querySelectorAll('[title]')).map((e) => e.getAttribute('title')).filter(Boolean)).toEqual([]);
  });
});

describe('OneOfTreePicker: search', () => {
  it('accent- and case-insensitive over the labels; keeps a match and its ancestors', async () => {
    wrap(<Inside />);
    await search('kor');
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Kör']));
  });

  it("keeps a match's whole subtree, open", async () => {
    wrap(<Inside expand="none" />);
    await search('geometria');
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Kör', 'Térgeometria']));
  });

  it('the keyboard moves over the shown nodes only, and Enter chooses one', async () => {
    wrap(<Inside initialValue="alg" />);
    await search('kor');
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Kör']));
    const active = () => {
      const row = document.querySelector<HTMLElement>('.ant-select-tree-treenode-active');
      return row ? rowLabel(row) : undefined;
    };
    const visited: (string | undefined)[] = [];
    for (let step = 0; step < 4; step += 1) {
      fireEvent.keyDown(combobox(), { key: 'ArrowDown', keyCode: 40, which: 40 });
      visited.push(active());
    }
    expect(visited).toEqual(['Geometria', 'Síkgeometria', 'Kör', 'Geometria']);
    fireEvent.keyDown(combobox(), { key: 'ArrowUp', keyCode: 38, which: 38 });
    expect(active()).toBe('Kör');
    fireEvent.keyDown(combobox(), { key: 'Enter', keyCode: 13, which: 13 });
    await waitFor(() => expect(shown()).toBe('kor'));
  });

  it('a search hiding the current node keeps the value, shown again when the tree closes', async () => {
    wrap(<Inside initialValue="alg" />);
    await search('kor');
    await waitFor(() => expect(treeLabels()).toEqual(['Geometria', 'Síkgeometria', 'Kör']));
    fireEvent.keyDown(combobox(), { key: 'Escape', keyCode: 27, which: 27 });
    fireEvent.blur(combobox());
    await waitFor(() => expect(closedText()).toBe('Algebra'));
    expect(shown()).toBe('alg');
  });
});

describe('OneOfTreePicker: field conventions', () => {
  it('a confirmation comes first, its OK named after the chosen node; OK commits', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'cascade-modal', title: 'Move the task?', content: 'Sure?' })} />);
    await pick('Kör');
    expect(fire).not.toHaveBeenCalled();
    // The title is shown twice (header + confirm paragraph), so a plain findByText would match more than one.
    await waitFor(() => expect(screen.getAllByText('Move the task?').length).toBeGreaterThan(0));
    const ok = screen.getAllByRole('button').find((b) => b.textContent === 'Kör');
    expect(ok).toBeTruthy();
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith('kor');
    await waitFor(() => expect(shown()).toBe('kor'));
  });

  it("a typing confirmation's OK is named after the chosen node too", async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'typing', title: 'Move the task?', entityName: 'move', description: 'It moves.' })} />);
    await pick('Kör');
    const dialog = (await screen.findByText('Move the task?')).closest<HTMLElement>('.ant-modal')!;
    expect(within(dialog).getByRole('button', { name: 'Kör' })).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
  });

  it('the confirmation is asked for the chosen node; the clear button asks it for empty', async () => {
    const confirmation = vi.fn(() => undefined);
    wrap(<Committed fire={vi.fn()} confirmation={confirmation} optional />);
    await openTree();
    // In act: the commit, with nothing to wait for, settles at once.
    await act(async () => { fireEvent.click(within(treeRow('Kör')!).getByText('Kör')); });
    expect(confirmation).toHaveBeenLastCalledWith('kor');
    expect(shown()).toBe('kor');
    await act(async () => { fireEvent.click(root().querySelector('.ant-select-clear')!); });
    expect(confirmation).toHaveBeenLastCalledWith('');
    expect(shown()).toBe('');
  });

  it('pending: a locked, loading select: focusable (not disabled), said unavailable, closed; opening it or typing into it does nothing; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    await pick('Kör');
    expect(fire).toHaveBeenCalledWith('kor');
    await waitFor(() => expect(root()).toHaveClass('ant-select-loading'));
    expect(root()).not.toHaveClass('ant-select-disabled');
    expect(combobox()).not.toBeDisabled();
    expect(combobox()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.mouseDown(combobox());
    fireEvent.keyDown(combobox(), { key: 'ArrowDown', keyCode: 40, which: 40 });
    fireEvent.keyDown(combobox(), { key: 'Enter', keyCode: 13, which: 13 });
    expect(isOpen()).toBe(false);
    // Typing would show over the value: it changes nothing while locked.
    fireEvent.change(combobox(), { target: { value: 'kö' } });
    expect(combobox()).toHaveValue('');
    expect(closedText()).toBe('Algebra');
    expect(isOpen()).toBe(false);
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(root()).not.toHaveClass('ant-select-loading'));
    expect(combobox()).not.toHaveAttribute('aria-disabled');
    expect(shown()).toBe('kor');
    fireEvent.mouseDown(combobox());
    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it('the app\'s pending: an open tree closes and stays closed until it ends; it does not reopen by itself', async () => {
    const { rerender } = wrap(<Inside initialValue="alg" />);
    await openTree();
    expect(isOpen()).toBe(true);
    rerender(<AntApp><Inside initialValue="alg" pending /></AntApp>);
    expect(isOpen()).toBe(false);
    expect(combobox()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.mouseDown(combobox());
    expect(isOpen()).toBe(false);
    rerender(<AntApp><Inside initialValue="alg" /></AntApp>);
    expect(isOpen()).toBe(false);
    fireEvent.mouseDown(combobox());
    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it('an opening asked for while locked (a click, a key, typing) shows nothing as pending ends, not even for a moment', () => {
    const { rerender } = wrap(<Inside initialValue="alg" pending />);
    fireEvent.mouseDown(combobox());
    fireEvent.keyDown(combobox(), { key: 'ArrowDown', keyCode: 40, which: 40 });
    fireEvent.change(combobox(), { target: { value: 'kö' } });
    rerender(<AntApp><Inside initialValue="alg" /></AntApp>);
    // A tree shown for a single commit would have been mounted (antd keeps it after).
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
    expect(isOpen()).toBe(false);
  });

  it('a tree open as the field is hidden stays closed when it shows again', async () => {
    const { rerender } = wrap(<Inside initialValue="alg" />);
    await openTree();
    expect(isOpen()).toBe(true);
    rerender(<AntApp><Inside initialValue="alg" hidden /></AntApp>);
    expect(root()).toBeNull();
    rerender(<AntApp><Inside initialValue="alg" /></AntApp>);
    expect(isOpen()).toBe(false);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(isOpen()).toBe(false);
  });

  it('pending keeps the disabled look: the disabled text colour and background, the not-allowed cursor; the clear icon out of sight', () => {
    function DisabledProbe() {
      const { token } = theme.useToken();
      return <span data-testid="probe" style={{ color: token.colorTextDisabled, background: token.colorBgContainerDisabled }} />;
    }
    wrap(<><Inside initialValue="alg" optional pending /><DisabledProbe /></>);
    const probe = screen.getByTestId('probe');
    expect(root().style.color).toBe(probe.style.color);
    expect(root().style.background).toBe(probe.style.background);
    expect(root().style.cursor).toBe('not-allowed');
    expect(combobox().style.cursor).toBe('not-allowed');
    const clear = root().querySelector<HTMLElement>('.ant-select-clear')!;
    expect(clear.style.opacity).toBe('0');
    expect(clear.style.pointerEvents).toBe('none');
    expect(root().querySelector<HTMLElement>('.ant-select-suffix')!.style.opacity).toBe('1');
    fireEvent.click(clear);
    expect(shown()).toBe('alg');
  });

  it('not enabled and pending: disabled as before, not marked locked', () => {
    wrap(<Inside initialValue="alg" pending enabled={denyWithReason('Read-only here')} />);
    expect(root()).toHaveClass('ant-select-disabled');
    expect(combobox()).toBeDisabled();
    expect(combobox()).not.toHaveAttribute('aria-disabled');
    expect(root().style.cursor).toBe('');
  });

  it('a disabled field: a disabled select, its reason on hover, no change', async () => {
    wrap(<Inside initialValue="alg" enabled={denyWithReason('Read-only here')} />);
    expect(root()).toHaveClass('ant-select-disabled');
    fireEvent.mouseEnter(root().closest('.vultus-tooltip-anchor')!);
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    fireEvent.mouseDown(combobox());
    expect(treeRows()).toEqual([]);
    expect(shown()).toBe('alg');
  });

  it('the control sits in the stable tooltip anchor, a block without a width', () => {
    wrap(<Inside />);
    const anchor = root().closest<HTMLElement>('.vultus-tooltip-anchor')!;
    expect(anchor).not.toBeNull();
    expect(anchor.style.display).toBe('block');
  });
});

describe('OneOfTreePicker: in <Field item>', () => {
  // Algebra has a description, Kör none: the control's tooltip ("Current state: …") comes and goes.
  const CATEGORY: FieldDefinition = { kind: 'oneOfTree', id: 'cat', label: 'Category', nodes: GEO, expand: 'all' };

  it('keeps its identity and the focus across value changes', async () => {
    wrap(<Field item definition={CATEGORY} />);
    const input = combobox();
    act(() => input.focus());
    await pick('Algebra');
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'alg'));
    const control = root();
    expect(document.activeElement).toBe(input);
    await pick('Kör');
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'kor'));
    expect(root()).toBe(control);
    expect(document.activeElement).toBe(input);
    await pick('Algebra');
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'alg'));
    expect(root()).toBe(control);
    expect(document.activeElement).toBe(input);
  });
});
