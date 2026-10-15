import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import {
  denyWithReason, useOneOfTreeField, type FieldCommit, type FieldDefinition, type OneOfTreeFieldOptions, type TreeNode,
} from 'vultus-core';
import { Field } from '../Field.js';
import { OneOfTreeList } from '../OneOfTreeList.js';

type Geo = 'geo' | 'sik' | 'kor' | 'ter' | 'alg';

// Geometria (a folder) > Síkgeometria > Kör (a note), Térgeometria (disabled); Algebra (a
// description). OneOfTreePicker's test tree.
const GEO: TreeNode<Geo>[] = [
  {
    value: 'geo', label: 'Geometria', choosable: false, children: [
      { value: 'sik', label: 'Síkgeometria', children: [{ value: 'kor', label: 'Kör', note: '3' }] },
      { value: 'ter', label: 'Térgeometria', disabled: { verdict: true, reason: 'later' } },
    ],
  },
  { value: 'alg', label: 'Algebra', description: 'Equations and identities' },
];

/** The list's own props, the internal ones included. */
type ListOpts = { search?: boolean; nested?: boolean; onChosen?: () => void };

type InsideOpts = Partial<Omit<OneOfTreeFieldOptions<Geo>, 'value' | 'onChange' | 'commit' | 'hrefFor'>> & ListOpts;

function Inside({ search, nested, onChosen, ...opts }: InsideOpts) {
  const field = useOneOfTreeField<Geo>({ id: 'cat', label: 'Category', nodes: GEO, ...opts } as OneOfTreeFieldOptions<Geo>);
  return <><OneOfTreeList field={field} search={search} nested={nested} onChosen={onChosen} /><output>{field.value}</output></>;
}

/** A field whose value the render site keeps, so a test can change it from outside. */
function Outside({ value }: { value: Geo | '' }) {
  const field = useOneOfTreeField<Geo>({ id: 'cat', label: 'Category', nodes: GEO, value, onChange: () => {} });
  return <><OneOfTreeList field={field} /><output>{field.value}</output></>;
}

const toc = (value: Geo | '') => `#?toc=${value}`;

/** A field kept at the render site with links (`hrefFor`), as a stored field over a URL store is; every node open. */
function Linked({ onChange = () => {}, hrefFor = toc, onChosen, ...opts }: {
  onChange?: (next: Geo | '') => void;
  hrefFor?: (value: Geo | '') => string | undefined;
  onChosen?: () => void;
} & Partial<Omit<OneOfTreeFieldOptions<Geo>, 'value' | 'onChange' | 'commit' | 'hrefFor' | 'initialValue'>>) {
  const [value, setValue] = useState<Geo | ''>('alg');
  const field = useOneOfTreeField<Geo>({
    id: 'cat', label: 'Category', nodes: GEO, expand: 'all', ...opts, value, hrefFor,
    onChange: (next) => { onChange(next); setValue(next); },
  } as OneOfTreeFieldOptions<Geo>);
  return <><OneOfTreeList field={field} onChosen={onChosen} /><output>{field.value}</output></>;
}

function Committed({ fire, confirmation, hrefFor, search }: {
  fire: (next: Geo | '') => Promise<void> | void;
  confirmation?: FieldCommit<Geo | ''>['confirmation'];
  hrefFor?: (value: Geo | '') => string | undefined;
  search?: boolean;
}) {
  const [stored, setStored] = useState<Geo | ''>('alg');
  const field = useOneOfTreeField<Geo>({
    id: 'cat', label: 'Category', nodes: GEO, expand: 'all', value: stored, hrefFor,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><OneOfTreeList field={field} search={search} /><output>{field.value}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const root = () => document.querySelector<HTMLElement>('[data-field-id="cat"]')!;
const nameOf = (label: string) => new RegExp(`^${label}\\b`);
/** A node's row, if it is shown (a row hidden by a search, or under a closed node, is not). */
const row = (label: string) => screen.queryByRole('treeitem', { name: nameOf(label) });
/** The shown rows' text, in order. */
const rowTexts = () => screen.queryAllByRole('treeitem').map((r) => r.textContent);
/** A node's label, to click. */
const label = (text: string) => screen.getByText(text);
/** A node's link, if its title is one. */
const link = (text: string) => row(text)?.querySelector('a') ?? null;
const search = (query: string) => fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: query } });
const isSelected = (text: string) => row(text)?.getAttribute('aria-selected') === 'true';
/** The labels of the selected rows. */
const selected = () => screen.queryAllByRole('treeitem').filter((r) => r.getAttribute('aria-selected') === 'true').map((r) => r.textContent);
/**
 * Waits for antd's open/close motion to end: rc-tree ignores a switcher click
 * while its list is changing, and lets go a tick after the motion (which
 * jsdom never ends: the rows go at its deadline).
 */
async function settled() {
  await waitFor(() => expect(document.querySelector('.ant-tree-treenode-motion')).toBeNull(), { timeout: 3000 });
  await act(() => new Promise((resolve) => { setTimeout(resolve, 0); }));
}

/** The tree's active (keyboard) node: its row, from the tree's aria-activedescendant. */
function activeRow(): HTMLElement | null {
  const id = screen.getByRole('tree').getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
}
const press = (key: string) => fireEvent.keyDown(screen.getByRole('tree'), { key });
const focusTree = () => act(() => { screen.getByRole('tree').focus(); });
const expectActive = async (text: string) => {
  await waitFor(() => expect(activeRow()?.textContent).toMatch(nameOf(text)));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OneOfTreeList: showing the value', () => {
  it("the current node is selected, its ancestors' titles strong", () => {
    wrap(<Inside initialValue="kor" />);
    expect(isSelected('Kör')).toBe(true);
    expect(selected()).toEqual(['Kör (3)']);
    expect(row('Geometria')!.querySelector('strong')).not.toBeNull();
    expect(row('Síkgeometria')!.querySelector('strong')).not.toBeNull();
    expect(row('Kör')!.querySelector('strong')).toBeNull();
    expect(row('Algebra')!.querySelector('strong')).toBeNull();
  });

  it('a value naming no node selects nothing, and marks no path', () => {
    wrap(<Inside initialValue={'gone' as Geo} />);
    expect(shown()).toBe('gone');
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
    expect(selected()).toEqual([]);
    expect(document.querySelector('strong')).toBeNull();
  });

  it('each node shows its note in brackets after its label', () => {
    wrap(<Inside initialValue="kor" />);
    expect(row('Kör')!.textContent).toBe('Kör (3)');
  });

  it("starts from the field's expandedKeys: expand 'selected' opens the value's ancestors only", () => {
    wrap(<Inside initialValue="kor" />);
    expect(rowTexts()).toEqual(['Geometria', 'Síkgeometria', 'Kör (3)', 'Térgeometria', 'Algebra']);
  });

  it('the field label is the accessible name; data-field-id and data-value on the root, data-value on each row', async () => {
    wrap(<Inside initialValue="kor" />);
    expect(screen.getByRole('tree', { name: 'Category' })).toBeInTheDocument();
    expect(root()).toHaveAttribute('data-value', 'kor');
    expect(row('Kör')).toHaveAttribute('data-value', 'kor');
    expect(row('Geometria')).toHaveAttribute('data-value', 'geo');
    fireEvent.click(label('Algebra'));
    await waitFor(() => expect(root()).toHaveAttribute('data-value', 'alg'));
  });

  it('nested: no data-field-id or data-value on the root (the widget holding it has them); the rows keep theirs', () => {
    wrap(<Inside initialValue="kor" nested />);
    expect(document.querySelector('[data-field-id]')).toBeNull();
    expect(screen.getByRole('tree', { name: 'Category' })).toBeInTheDocument();
    expect(row('Kör')).toHaveAttribute('data-value', 'kor');
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(screen.queryByRole('tree')).toBeNull();
  });
});

describe('OneOfTreeList: choosing', () => {
  it('clicking a node that can be chosen requests it', async () => {
    wrap(<Inside expand="all" />);
    expect(shown()).toBe('sik');
    fireEvent.click(label('Kör'));
    await waitFor(() => expect(shown()).toBe('kor'));
    expect(isSelected('Kör')).toBe(true);
    expect(isSelected('Síkgeometria')).toBe(false);
  });

  it('clicking a node with children requests it and opens it; clicking it again never closes it', async () => {
    wrap(<Inside initialValue="alg" />);
    expect(row('Síkgeometria')).toBeNull();
    fireEvent.click(label('Geometria'));
    await settled();
    expect(row('Kör')).toBeNull();
    fireEvent.click(label('Síkgeometria'));
    await waitFor(() => expect(shown()).toBe('sik'));
    await waitFor(() => expect(row('Kör')).toBeInTheDocument());
    await settled();
    fireEvent.click(label('Síkgeometria'));
    await settled();
    expect(row('Kör')).toBeInTheDocument();
    expect(shown()).toBe('sik');
  });

  it('clicking a folder opens or closes it and requests nothing', async () => {
    wrap(<Inside initialValue="kor" />);
    fireEvent.click(label('Geometria'));
    await settled();
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
    expect(shown()).toBe('kor');
    fireEvent.click(label('Geometria'));
    await waitFor(() => expect(row('Síkgeometria')).toBeInTheDocument());
    expect(shown()).toBe('kor');
  });

  it("under choose: 'leaves' a node with children is a folder: a click opens or closes it", async () => {
    wrap(<Inside choose="leaves" expand="all" />);
    expect(shown()).toBe('kor');
    fireEvent.click(label('Síkgeometria'));
    await settled();
    expect(row('Kör')).toBeNull();
    expect(shown()).toBe('kor');
  });

  it('a disabled node cannot be chosen; hovering it shows its reason', async () => {
    wrap(<Inside initialValue="alg" expand="all" />);
    fireEvent.click(label('Térgeometria'));
    expect(shown()).toBe('alg');
    fireEvent.mouseEnter(label('Térgeometria'));
    await waitFor(() => expect(screen.getByText('later')).toBeInTheDocument());
    expect(shown()).toBe('alg');
  });

  it('a node with a description shows it on hover', async () => {
    wrap(<Inside initialValue="kor" />);
    fireEvent.mouseEnter(label('Algebra'));
    await waitFor(() => expect(screen.getByText('Equations and identities')).toBeInTheDocument());
  });
});

describe('OneOfTreeList: the keyboard', () => {
  it('Enter on a node that can be chosen chooses it, a node with children staying open; on a folder it opens or closes it', async () => {
    wrap(<Inside initialValue="alg" expand="all" />);
    focusTree();
    await expectActive('Algebra');
    press('Home');
    press('ArrowDown');
    await expectActive('Síkgeometria');
    press('Enter');
    await waitFor(() => expect(shown()).toBe('sik'));
    await settled();
    expect(row('Kör')).toBeInTheDocument();
    press('ArrowDown');
    await expectActive('Kör');
    press('Enter');
    await waitFor(() => expect(shown()).toBe('kor'));
    press('Home');
    await expectActive('Geometria');
    press('Enter');
    await settled();
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
    expect(shown()).toBe('kor');
  });

  it('Enter on the current node chooses it again: onChosen is called (the drawer closes)', async () => {
    const onChosen = vi.fn();
    wrap(<Inside initialValue="alg" expand="all" onChosen={onChosen} />);
    focusTree();
    await expectActive('Algebra');
    press('Enter');
    expect(onChosen).toHaveBeenCalledTimes(1);
    expect(shown()).toBe('alg');
  });

  it("Enter on a row's link, focused by a click, is the tree's: it chooses the active row, a node with children staying open", async () => {
    const onChange = vi.fn();
    wrap(<Linked onChange={onChange} />);
    const focused = link('Síkgeometria')!;
    // A click focuses the link (tabIndex -1), rc-tree activating no row.
    fireEvent.mouseDown(focused);
    act(() => focused.focus());
    expect(document.activeElement).toBe(focused);
    fireEvent.keyDown(focused, { key: 'Home' });
    fireEvent.keyDown(focused, { key: 'ArrowDown' });
    await expectActive('Síkgeometria');
    expect(fireEvent.keyDown(focused, { key: 'Enter' })).toBe(false);
    await waitFor(() => expect(shown()).toBe('sik'));
    await settled();
    expect(row('Kör')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("Enter on the current node's link chooses it again, the browser not following the link", async () => {
    const onChosen = vi.fn();
    wrap(<Linked onChosen={onChosen} />);
    const current = link('Algebra')!;
    act(() => current.focus());
    await expectActive('Algebra');
    expect(fireEvent.keyDown(current, { key: 'Enter' })).toBe(false);
    expect(onChosen).toHaveBeenCalledTimes(1);
    expect(shown()).toBe('alg');
  });

  it("Enter on a link while a disabled node or a folder is active: the browser does not follow it; the folder opens or closes", async () => {
    const onChange = vi.fn();
    wrap(<Linked onChange={onChange} />);
    const focused = link('Kör')!;
    fireEvent.mouseDown(focused);
    act(() => focused.focus());
    fireEvent.keyDown(focused, { key: 'End' });
    fireEvent.keyDown(focused, { key: 'ArrowUp' });
    await expectActive('Térgeometria');
    expect(fireEvent.keyDown(focused, { key: 'Enter' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(focused, { key: 'Home' });
    await expectActive('Geometria');
    expect(fireEvent.keyDown(focused, { key: 'Enter' })).toBe(false);
    await settled();
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
    expect(onChange).not.toHaveBeenCalled();
    expect(shown()).toBe('alg');
  });

  it('Enter chooses nothing while the active row is one a search has since hidden', async () => {
    const onChosen = vi.fn();
    wrap(<Inside initialValue="kor" expand="all" search onChosen={onChosen} />);
    focusTree();
    await expectActive('Kör');
    press('End');
    await expectActive('Algebra');
    search('kor'); // the focus stays on the tree
    await waitFor(() => expect(row('Algebra')).toBeNull());
    press('Enter');
    expect(onChosen).not.toHaveBeenCalled();
    expect(shown()).toBe('kor');
  });

  it("optional: Home reaches the empty value's row, and Enter chooses it", async () => {
    wrap(<Inside optional initialValue="alg" expand="all" />);
    focusTree();
    await expectActive('Algebra');
    press('Home');
    await expectActive('None');
    press('Enter');
    await waitFor(() => expect(shown()).toBe(''));
    expect(isSelected('None')).toBe(true);
  });

  it('Enter in the search box chooses nothing', async () => {
    wrap(<Inside initialValue="alg" expand="all" search />);
    focusTree();
    press('Home');
    press('ArrowDown');
    await expectActive('Síkgeometria');
    fireEvent.keyDown(screen.getByPlaceholderText('Search'), { key: 'Enter' });
    expect(shown()).toBe('alg');
  });
});

describe('OneOfTreeList: following the value', () => {
  const scrolled: [Element, unknown][] = [];
  function watchScrolling() {
    scrolled.length = 0;
    // jsdom has no scrollIntoView; the list calls it where there is one.
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true, writable: true, value(this: Element, options: unknown) { scrolled.push([this, options]); },
    });
  }
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("a value changed from outside opens its ancestors and scrolls its node into view (not on mount)", async () => {
    watchScrolling();
    const { rerender } = wrap(<Outside value="alg" />);
    expect(row('Síkgeometria')).toBeNull();
    expect(scrolled).toEqual([]);
    rerender(<AntApp><Outside value="kor" /></AntApp>);
    await waitFor(() => expect(row('Kör')).toBeInTheDocument());
    expect(row('Síkgeometria')).toBeInTheDocument();
    expect(isSelected('Kör')).toBe(true);
    expect(scrolled).toEqual([[row('Kör'), { block: 'nearest' }]]);
  });

  it('a node opening with motion (one ancestor closed) scrolls into view too', async () => {
    watchScrolling();
    const { rerender } = wrap(<Outside value="sik" />);
    expect(row('Kör')).toBeNull();
    rerender(<AntApp><Outside value="kor" /></AntApp>);
    await waitFor(() => expect(row('Kör')).toBeInTheDocument());
    expect(scrolled).toEqual([[row('Kör'), { block: 'nearest' }]]);
  });

  it("the user's own expansion is kept: a value elsewhere closes nothing", async () => {
    const { rerender } = wrap(<Outside value="kor" />);
    expect(row('Kör')).toBeInTheDocument();
    rerender(<AntApp><Outside value="alg" /></AntApp>);
    await settled();
    expect(rowTexts()).toEqual(['Geometria', 'Síkgeometria', 'Kör (3)', 'Térgeometria', 'Algebra']);
    expect(isSelected('Algebra')).toBe(true);
  });
});

describe('OneOfTreeList: links', () => {
  it('with hrefFor, each node that can be chosen is a link to it; a folder and a disabled node are not', () => {
    wrap(<Linked />);
    expect(link('Kör')).toHaveAttribute('href', '#?toc=kor');
    expect(link('Síkgeometria')).toHaveAttribute('href', '#?toc=sik');
    expect(link('Algebra')).toHaveAttribute('href', '#?toc=alg');
    expect(link('Geometria')).toBeNull();
    expect(link('Térgeometria')).toBeNull();
  });

  it('a node hrefFor gives no href for is plain text', () => {
    wrap(<Linked hrefFor={(value) => (value === 'kor' ? undefined : toc(value))} />);
    expect(link('Kör')).toBeNull();
    expect(link('Algebra')).toHaveAttribute('href', '#?toc=alg');
  });

  it('a plain click requests the node once, the browser not following the link', async () => {
    const onChange = vi.fn();
    wrap(<Linked onChange={onChange} />);
    const followed = fireEvent.click(link('Kör')!);
    expect(followed).toBe(false);
    await waitFor(() => expect(shown()).toBe('kor'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('kor');
  });

  it.each([['ctrlKey'], ['metaKey'], ['shiftKey'], ['altKey']])('a click with %s is left to the browser: no request', (modifier) => {
    const onChange = vi.fn();
    const onChosen = vi.fn();
    wrap(<Linked onChange={onChange} onChosen={onChosen} />);
    const followed = fireEvent.click(link('Kör')!, { [modifier]: true });
    expect(followed).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(onChosen).not.toHaveBeenCalled();
    expect(shown()).toBe('alg');
  });

  it('without hrefFor no node is a link', () => {
    wrap(<Inside expand="all" />);
    expect(row('Kör')).toBeInTheDocument();
    expect(document.querySelector('a')).toBeNull();
  });

  it('controls with no hrefFor member (built by hand, as before vultus-core 0.5.3): no links, a click still requests', async () => {
    function HandMade() {
      const [value, setValue] = useState<Geo | ''>('alg');
      const { hrefFor: _hrefFor, ...field } = useOneOfTreeField<Geo>({
        id: 'cat', label: 'Category', nodes: GEO, expand: 'all', value, onChange: setValue,
      });
      return <><OneOfTreeList field={field} /><output>{field.value}</output></>;
    }
    wrap(<HandMade />);
    expect(row('Kör')).toBeInTheDocument();
    expect(document.querySelector('a')).toBeNull();
    fireEvent.click(label('Kör'));
    await waitFor(() => expect(shown()).toBe('kor'));
  });

  it('a disabled field: no links, and a click requests nothing', () => {
    const onChange = vi.fn();
    wrap(<Linked onChange={onChange} enabled={denyWithReason('Read-only here')} />);
    expect(document.querySelector('a')).toBeNull();
    fireEvent.click(label('Kör'));
    expect(onChange).not.toHaveBeenCalled();
    expect(shown()).toBe('alg');
  });

  it('a pending commit: no links, and a click requests nothing', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} hrefFor={toc} />);
    expect(link('Kör')).toHaveAttribute('href', '#?toc=kor');
    fireEvent.click(link('Kör')!);
    expect(fire).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector('a')).toBeNull());
    fireEvent.click(label('Síkgeometria'));
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(link('Algebra')).toHaveAttribute('href', '#?toc=alg'));
    expect(shown()).toBe('kor');
  });

  it('optional: the first row links to the empty value', () => {
    wrap(<Linked optional placeholder="All categories" />);
    expect(screen.getAllByRole('treeitem')[0].querySelector('a')).toHaveAttribute('href', '#?toc=');
  });
});

describe('OneOfTreeList: onChosen (the drawer closing)', () => {
  it('is called after a click chooses a node, the current one too; not after a folder click', async () => {
    const onChosen = vi.fn();
    wrap(<Inside initialValue="alg" expand="all" onChosen={onChosen} />);
    fireEvent.click(label('Geometria'));
    expect(onChosen).not.toHaveBeenCalled();
    await settled();
    fireEvent.click(label('Algebra'));
    expect(onChosen).toHaveBeenCalledTimes(1);
    fireEvent.click(label('Geometria'));
    await waitFor(() => expect(row('Kör')).toBeInTheDocument());
    fireEvent.click(label('Kör'));
    await waitFor(() => expect(shown()).toBe('kor'));
    expect(onChosen).toHaveBeenCalledTimes(2);
  });

  it('is called after a plain click on a link', async () => {
    const onChosen = vi.fn();
    wrap(<Linked onChosen={onChosen} />);
    fireEvent.click(link('Kör')!);
    await waitFor(() => expect(shown()).toBe('kor'));
    expect(onChosen).toHaveBeenCalledTimes(1);
  });
});

describe('OneOfTreeList: search', () => {
  it('no search box by default', () => {
    wrap(<Inside />);
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
  });

  it('the search box is named after the field', () => {
    wrap(<Inside search />);
    expect(screen.getByRole('textbox', { name: 'Search Category' })).toBeInTheDocument();
  });

  it('keeps a match and its ancestors, accent- and case-insensitive, open', async () => {
    wrap(<Inside initialValue="alg" expand="none" search />);
    search('KOR');
    await waitFor(() => expect(rowTexts()).toEqual(['Geometria', 'Síkgeometria', 'Kör (3)']));
  });

  it("keeps a match's whole subtree", async () => {
    wrap(<Inside initialValue="alg" expand="none" search />);
    search('geometria');
    await waitFor(() => expect(rowTexts()).toEqual(['Geometria', 'Síkgeometria', 'Kör (3)', 'Térgeometria']));
  });

  it('the keyboard moves over the shown nodes only, and Enter chooses one', async () => {
    wrap(<Inside initialValue="alg" search />);
    search('kor');
    await waitFor(() => expect(rowTexts()).toEqual(['Geometria', 'Síkgeometria', 'Kör (3)']));
    focusTree();
    // The current node, Algebra, is hidden: the first shown node after it is active.
    await expectActive('Geometria');
    press('ArrowDown');
    await expectActive('Síkgeometria');
    press('ArrowDown');
    await expectActive('Kör');
    press('ArrowDown'); // Térgeometria and Algebra are hidden: wraps to Geometria
    await expectActive('Geometria');
    press('ArrowUp');
    await expectActive('Kör');
    press('Enter');
    await waitFor(() => expect(shown()).toBe('kor'));
  });

  it('a search hiding the current node keeps the value, selected again after the search', async () => {
    wrap(<Inside initialValue="alg" search />);
    search('kor');
    await waitFor(() => expect(row('Algebra')).toBeNull());
    expect(shown()).toBe('alg');
    search('');
    await waitFor(() => expect(row('Algebra')).toBeInTheDocument());
    expect(isSelected('Algebra')).toBe(true);
    expect(shown()).toBe('alg');
  });

  it("the expansion from before comes back after the search", async () => {
    wrap(<Inside initialValue="alg" search />);
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
    search('kor');
    await waitFor(() => expect(row('Kör')).toBeInTheDocument());
    search('');
    await settled();
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
  });

  it("no match: antd's empty notice instead of the tree", () => {
    wrap(<Inside search />);
    search('zzz');
    expect(screen.queryByRole('tree')).toBeNull();
    expect(document.querySelector('.ant-empty')).toBeTruthy();
    search('');
    expect(screen.getByRole('tree')).toBeInTheDocument();
  });

  it("optional: the empty value's row is hidden while searching", async () => {
    wrap(<Inside optional search />);
    expect(rowTexts()[0]).toBe('None');
    search('alg');
    await waitFor(() => expect(rowTexts()).toEqual(['Algebra']));
  });
});

describe('OneOfTreeList: optional', () => {
  it("a first row reads the placeholder, requests empty, and shows selected while the value is empty", async () => {
    wrap(<Inside optional initialValue="alg" placeholder="All categories" />);
    expect(rowTexts()[0]).toBe('All categories');
    expect(isSelected('All categories')).toBe(false);
    expect(isSelected('Algebra')).toBe(true);
    fireEvent.click(label('All categories'));
    await waitFor(() => expect(shown()).toBe(''));
    expect(isSelected('All categories')).toBe(true);
    expect(selected()).toEqual(['All categories']);
    expect(root()).toHaveAttribute('data-value', '');
  });

  it('without a placeholder the row reads "None"', () => {
    wrap(<Inside optional />);
    expect(rowTexts()[0]).toBe('None');
    expect(isSelected('None')).toBe(true);
  });

  it('not optional: no such row', () => {
    wrap(<Inside placeholder="All categories" />);
    expect(rowTexts()[0]).toBe('Geometria');
    expect(screen.queryByText('All categories')).toBeNull();
  });
});

describe('OneOfTreeList: field conventions', () => {
  it('a confirmation comes first, its OK named after the chosen node; OK commits', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={() => ({ kind: 'cascade-modal', title: 'Move the task?', content: 'Sure?' })} />);
    fireEvent.click(label('Kör'));
    expect(fire).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByText('Move the task?').length).toBeGreaterThan(0));
    const ok = screen.getAllByRole('button').find((b) => b.textContent === 'Kör');
    expect(ok).toBeTruthy();
    await act(async () => { fireEvent.click(ok!); });
    expect(fire).toHaveBeenCalledWith('kor');
    await waitFor(() => expect(shown()).toBe('kor'));
  });

  it('pending: the tree disabled, a spinner by the search box', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} search />);
    fireEvent.click(label('Kör'));
    expect(fire).toHaveBeenCalledWith('kor');
    await waitFor(() => expect(row('Algebra')).toHaveAttribute('aria-disabled', 'true'));
    expect(document.querySelector('.ant-spin')).toBeTruthy();
    await act(async () => { finish(); });
    await waitFor(() => expect(row('Algebra')).not.toHaveAttribute('aria-disabled', 'true'));
    expect(document.querySelector('.ant-spin')).toBeNull();
  });

  it('a disabled field can still be browsed: a click on any node with children opens or closes it, choosing nothing', async () => {
    wrap(<Inside initialValue="alg" expand="all" enabled={denyWithReason('Read-only here')} />);
    fireEvent.click(label('Síkgeometria'));
    await settled();
    expect(row('Kör')).toBeNull();
    fireEvent.click(label('Síkgeometria'));
    await waitFor(() => expect(row('Kör')).toBeInTheDocument());
    await settled();
    fireEvent.click(label('Geometria'));
    await settled();
    expect(rowTexts()).toEqual(['Geometria', 'Algebra']);
    expect(shown()).toBe('alg');
  });

  it('a disabled field: every node disabled, its reason on hover, no change', async () => {
    wrap(<Inside initialValue="alg" expand="all" enabled={denyWithReason('Read-only here')} />);
    expect(row('Kör')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.mouseEnter(root().closest('.vultus-tooltip-anchor')!);
    await waitFor(() => expect(screen.getByText('Read-only here')).toBeInTheDocument());
    fireEvent.click(label('Kör'));
    expect(shown()).toBe('alg');
  });

  it('the control sits in the stable tooltip anchor, a block', () => {
    wrap(<Inside />);
    const anchor = root().closest<HTMLElement>('.vultus-tooltip-anchor')!;
    expect(anchor).not.toBeNull();
    expect(anchor.style.display).toBe('block');
  });
});

describe('OneOfTreeList: in <Field>', () => {
  const CATEGORY: FieldDefinition = { kind: 'oneOfTree', id: 'cat', label: 'Category', nodes: GEO };

  it('widget="list" renders OneOfTreeList', () => {
    wrap(<Field definition={CATEGORY} widget="list" />);
    expect(screen.getByRole('tree', { name: 'Category' })).toBeInTheDocument();
    expect(root().querySelector('.ant-tree')).not.toBeNull();
    expect(document.querySelector('.ant-select')).toBeNull();
  });

  it("the definition's hint picks it, with its search", () => {
    wrap(<Field definition={{ ...CATEGORY, widget: { name: 'list', search: true } }} />);
    expect(screen.getByRole('tree', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search Category' })).toBeInTheDocument();
  });
});
