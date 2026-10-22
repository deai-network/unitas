import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App as AntApp, Modal, Tooltip } from 'antd';
import type { SpinnerProps } from 'vultus-core';
import { ActionContextMenu } from '../ActionContextMenu.js';
import { VultusProvider } from '../VultusProvider.js';
import * as vultusAntd from '../index.js';
import { makeStatus } from './helpers/makeStatus.js';
import { openTooltips } from './helpers/tooltips.js';

function wrap(node: React.ReactNode) {
  return <AntApp>{node}</AntApp>;
}

function RecSpinner(p: SpinnerProps) {
  return <span data-testid="rec-spinner" data-key={p.spinnerKey} />;
}

/** The child every test wraps: a link, as on Praeceptor's interval bars. */
function segment(onClick = vi.fn()) {
  return <a href="#seg" onClick={onClick}>1–100</a>;
}

function link(): HTMLElement {
  return screen.getByRole('link', { name: '1–100' });
}

/** Right-clicks the child and returns the open menu. */
async function openMenu(): Promise<HTMLElement> {
  fireEvent.contextMenu(link());
  return screen.findByRole('menu');
}

function row(menu: HTMLElement, name: string): HTMLElement {
  return within(menu).getByRole('menuitem', { name });
}

describe('ActionContextMenu', () => {
  // Modal.confirm (through Modal.useModal) leaves its dialog behind between
  // tests; destroy it so identical titles and buttons don't collide.
  afterEach(() => { Modal.destroyAll(); });

  it('exported from the package index', () => {
    expect(vultusAntd.ActionContextMenu).toBe(ActionContextMenu);
  });

  it('a right click on the child opens the rows at once, in order, instead of the browser\'s menu', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    const drop = makeStatus({ id: 'drop', label: 'Drop' });
    render(wrap(<ActionContextMenu actions={[showLog, drop]}>{segment()}</ActionContextMenu>));
    expect(screen.queryByRole('menu')).toBeNull();

    // The event's default (the browser's own context menu) is prevented.
    expect(fireEvent.contextMenu(link())).toBe(false);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Show log', 'Drop']);
  });

  it('an invisible action is left out', async () => {
    const a = makeStatus({ id: 'a', label: 'Show log' });
    const hidden = makeStatus({ id: 'hidden', label: 'Secret', invisible: true });
    const b = makeStatus({ id: 'b', label: 'Drop' });
    render(wrap(<ActionContextMenu actions={[a, hidden, b]}>{segment()}</ActionContextMenu>));
    const menu = await openMenu();
    expect(within(menu).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Show log', 'Drop']);
    expect(within(menu).queryByText('Secret')).toBeNull();
  });

  it('a disabled action is greyed with its reason in a tooltip, and picking it fires nothing', async () => {
    const a = makeStatus({ id: 'a', label: 'Show log' });
    const drop = makeStatus({ id: 'drop', label: 'Drop', disabled: true, reason: 'The run is **still going**.' });
    render(wrap(<ActionContextMenu actions={[a, drop]}>{segment()}</ActionContextMenu>));
    const menu = await openMenu();
    const dropRow = row(menu, 'Drop');
    expect(dropRow).toHaveAttribute('aria-disabled', 'true');
    expect(row(menu, 'Show log')).not.toHaveAttribute('aria-disabled', 'true');

    fireEvent.mouseEnter(within(dropRow).getByText('Drop'));
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    // The reason is markdown (ReasonMarkdown).
    expect(openTooltips()[0]).toHaveTextContent('The run is still going.');
    expect(openTooltips()[0].querySelector('strong')).toHaveTextContent('still going');

    fireEvent.click(dropRow);
    expect(drop.fire).not.toHaveBeenCalled();
  });

  it('primary and danger as CombinedActionButton\'s rows, only while enabled', async () => {
    const go = makeStatus({ id: 'go', label: 'Go', variant: 'primary' });
    const drop = makeStatus({ id: 'drop', label: 'Drop', variant: 'danger' });
    const later = makeStatus({ id: 'later', label: 'Drop later', variant: 'danger', disabled: true, reason: 'nope' });
    render(wrap(<ActionContextMenu actions={[go, drop, later]}>{segment()}</ActionContextMenu>));
    const menu = await openMenu();
    expect(row(menu, 'Go').querySelector('span[style*="color"]')).toHaveTextContent('Go');
    expect(row(menu, 'Drop').className).toContain('ant-dropdown-menu-item-danger');
    expect(row(menu, 'Drop later').className).not.toContain('ant-dropdown-menu-item-danger');
  });

  it('the rows show their actions\' icons', async () => {
    const a = makeStatus({ id: 'a', label: 'Show log', icon: <span data-testid="icon-a" /> });
    const b = makeStatus({ id: 'b', label: 'Drop' });
    render(wrap(<ActionContextMenu actions={[a, b]}>{segment()}</ActionContextMenu>));
    const menu = await openMenu();
    expect(within(row(menu, 'Show log')).getByTestId('icon-a')).toBeInTheDocument();
  });

  it('picking an enabled row fires that action (and only it)', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    const drop = makeStatus({ id: 'drop', label: 'Drop' });
    render(wrap(<ActionContextMenu actions={[showLog, drop]}>{segment()}</ActionContextMenu>));
    const menu = await openMenu();
    fireEvent.click(row(menu, 'Drop'));
    expect(drop.fire).toHaveBeenCalledTimes(1);
    expect(showLog.fire).not.toHaveBeenCalled();
  });

  it('a popconfirm action asks first: Cancel does not fire it', async () => {
    const drop = makeStatus({ id: 'drop', label: 'Drop', variant: 'danger', confirmation: { kind: 'popconfirm', question: 'Drop 1–100?' } });
    const other = makeStatus({ id: 'other', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[other, drop]}>{segment()}</ActionContextMenu>));
    fireEvent.click(row(await openMenu(), 'Drop'));
    expect(await screen.findByText('Drop 1–100?')).toBeInTheDocument();
    expect(drop.fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(drop.fire).not.toHaveBeenCalled();
  });

  it('a popconfirm action asks first: OK fires it, its OK a danger button for a danger action', async () => {
    const drop = makeStatus({ id: 'drop', label: 'Drop', variant: 'danger', confirmation: { kind: 'popconfirm', question: 'Drop 1–100?' } });
    const other = makeStatus({ id: 'other', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[other, drop]}>{segment()}</ActionContextMenu>));
    fireEvent.click(row(await openMenu(), 'Drop'));
    expect(await screen.findByText('Drop 1–100?')).toBeInTheDocument();
    const ok = screen.getByRole('button', { name: /^OK$/i });
    expect(ok).toHaveClass('ant-btn-dangerous');
    fireEvent.click(ok);
    await waitFor(() => expect(drop.fire).toHaveBeenCalledTimes(1));
    expect(other.fire).not.toHaveBeenCalled();
  });

  it('the popconfirm points at the child: a press on the child keeps it open, one elsewhere dismisses it', async () => {
    const drop = makeStatus({ id: 'drop', label: 'Drop', confirmation: { kind: 'popconfirm', question: 'Drop 1–100?' } });
    const other = makeStatus({ id: 'other', label: 'Show log' });
    render(wrap(
      <div>
        <ActionContextMenu actions={[other, drop]}>{segment()}</ActionContextMenu>
        <button type="button">elsewhere</button>
      </div>,
    ));
    fireEvent.click(row(await openMenu(), 'Drop'));
    const bubble = (await screen.findByText('Drop 1–100?')).closest('.ant-popover') as HTMLElement;
    // rc-trigger tells "outside" from the element it anchors on: the child.
    fireEvent.mouseDown(link());
    expect(bubble.className).not.toMatch(/-leave/);
    fireEvent.mouseDown(screen.getByRole('button', { name: 'elsewhere' }));
    await waitFor(() => expect(bubble.className).toMatch(/-leave|ant-popover-hidden/));
    expect(drop.fire).not.toHaveBeenCalled();
  });

  it('a cascade-modal action asks first: Cancel does not fire it', async () => {
    const reset = makeStatus({
      id: 'reset', label: 'Reset', variant: 'danger',
      confirmation: { kind: 'cascade-modal', title: 'Reset the interval?', content: 'Its proposals go.' },
    });
    const other = makeStatus({ id: 'other', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[other, reset]}>{segment()}</ActionContextMenu>));
    fireEvent.click(row(await openMenu(), 'Reset'));
    await waitFor(() => expect(document.body.querySelector('.ant-modal-title')?.textContent).toBe('Reset the interval?'));
    expect(reset.fire).not.toHaveBeenCalled();
    const dialog = document.body.querySelector('.ant-modal') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(reset.fire).not.toHaveBeenCalled();
  });

  it('a cascade-modal action asks first: OK, labelled with the action, fires it', async () => {
    const reset = makeStatus({
      id: 'reset', label: 'Reset', variant: 'danger',
      confirmation: { kind: 'cascade-modal', title: 'Reset the interval?', content: 'Its proposals go.' },
    });
    const other = makeStatus({ id: 'other', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[other, reset]}>{segment()}</ActionContextMenu>));
    fireEvent.click(row(await openMenu(), 'Reset'));
    await waitFor(() => expect(document.body.querySelector('.ant-modal-title')?.textContent).toBe('Reset the interval?'));
    const dialog = document.body.querySelector('.ant-modal') as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(reset.fire).toHaveBeenCalledTimes(1));
  });

  it('a typing action opens the typing modal and fires once the phrase is typed', async () => {
    const del = makeStatus({
      id: 'del', label: 'Delete', variant: 'danger',
      confirmation: { kind: 'typing', title: 'Delete the source', entityName: 'grok', description: 'This cannot be undone.' },
    });
    const other = makeStatus({ id: 'other', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[other, del]}>{segment()}</ActionContextMenu>));
    fireEvent.click(row(await openMenu(), 'Delete'));
    const dialog = (await screen.findByText('Delete the source')).closest('.ant-modal') as HTMLElement;
    expect(del.fire).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'grok' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(del.fire).toHaveBeenCalledTimes(1);
  });

  it('a pending action\'s row is disabled, the lent Spinner as its icon, keyed to the action', async () => {
    const a = makeStatus({ id: 'show-log', label: 'Show log' });
    const drop = makeStatus({ id: 'drop', label: 'Drop', variant: 'danger', pending: true, icon: <span data-testid="icon-drop" /> });
    render(wrap(
      <VultusProvider components={{ Spinner: RecSpinner }}>
        <ActionContextMenu actions={[a, drop]}>{segment()}</ActionContextMenu>
      </VultusProvider>,
    ));
    const menu = await openMenu();
    const dropRow = row(menu, 'Drop');
    expect(dropRow).toHaveAttribute('aria-disabled', 'true');
    expect(dropRow.className).not.toContain('ant-dropdown-menu-item-danger');
    expect(within(dropRow).getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:drop');
    expect(within(dropRow).queryByTestId('icon-drop')).toBeNull();
    fireEvent.click(dropRow);
    expect(drop.fire).not.toHaveBeenCalled();
  });

  it('a pending action\'s row without a lent Spinner: antd\'s own small spinner', async () => {
    const a = makeStatus({ id: 'show-log', label: 'Show log' });
    const drop = makeStatus({ id: 'drop', label: 'Drop', pending: true });
    render(wrap(<ActionContextMenu actions={[a, drop]}>{segment()}</ActionContextMenu>));
    const menu = await openMenu();
    const dropRow = row(menu, 'Drop');
    expect(dropRow).toHaveAttribute('aria-disabled', 'true');
    expect(dropRow.querySelector('.ant-spin')).not.toBeNull();
  });

  it('the child\'s own left click is its own: its onClick fires, and the menu stays closed', () => {
    const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    const a = makeStatus({ id: 'a', label: 'Show log' });
    const b = makeStatus({ id: 'b', label: 'Drop' });
    render(wrap(<ActionContextMenu actions={[a, b]}>{segment(onClick)}</ActionContextMenu>));
    fireEvent.click(link());
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(a.fire).not.toHaveBeenCalled();
    expect(b.fire).not.toHaveBeenCalled();
  });

  it('the child\'s own context-menu handler still runs', async () => {
    const onContextMenu = vi.fn();
    const a = makeStatus({ id: 'a', label: 'Show log' });
    render(wrap(
      <ActionContextMenu actions={[a]}>
        <a href="#seg" onContextMenu={onContextMenu}>1–100</a>
      </ActionContextMenu>,
    ));
    await openMenu();
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('with no visible action the child renders alone: no menu, the browser\'s own not suppressed', () => {
    const hidden = makeStatus({ id: 'hidden', label: 'Secret', invisible: true });
    const { container } = render(wrap(<ActionContextMenu actions={[hidden]}>{segment()}</ActionContextMenu>));
    expect(fireEvent.contextMenu(link())).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    // Nothing added to the child (not even the dropdown's trigger class).
    expect(link().className).toBe('');
    expect(container.querySelectorAll('a')).toHaveLength(1);
  });

  it('with no actions at all, the same', () => {
    render(wrap(<ActionContextMenu actions={[]}>{segment()}</ActionContextMenu>));
    expect(fireEvent.contextMenu(link())).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opened from the keyboard (the menu key, Shift+F10: a contextmenu on the focused child), the menu takes the focus', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    const drop = makeStatus({ id: 'drop', label: 'Drop' });
    render(wrap(<ActionContextMenu actions={[showLog, drop]}>{segment()}</ActionContextMenu>));
    link().focus();
    const menu = await openMenu();
    // Its first row, so the arrow keys and Enter work from there.
    await waitFor(() => expect(document.activeElement).toBe(row(menu, 'Show log')));
  });

  it('Escape closes the menu and gives the focus back to the child', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[showLog]}>{segment()}</ActionContextMenu>));
    link().focus();
    const menu = await openMenu();
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', code: 'Escape', keyCode: 27 });
    await waitFor(() => expect(document.activeElement).toBe(link()));
    expect(showLog.fire).not.toHaveBeenCalled();
  });

  it('a pick gives the focus back to the child (where a dialog the action opens returns it)', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    render(wrap(<ActionContextMenu actions={[showLog]}>{segment()}</ActionContextMenu>));
    link().focus();
    const menu = await openMenu();
    await waitFor(() => expect(document.activeElement).toBe(row(menu, 'Show log')));
    fireEvent.click(row(menu, 'Show log'));
    expect(showLog.fire).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(link());
  });

  it('a close by a click elsewhere leaves the focus where that click put it', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    render(wrap(
      <div>
        <ActionContextMenu actions={[showLog]}>{segment()}</ActionContextMenu>
        <button type="button">elsewhere</button>
      </div>,
    ));
    link().focus();
    const menu = await openMenu();
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
    // A press moves the focus, then the click closes the menu.
    fireEvent.mouseDown(elsewhere);
    elsewhere.focus();
    fireEvent.click(elsewhere);
    await waitFor(() => expect(menu.closest('.ant-dropdown')!.className).toMatch(/-leave|ant-dropdown-hidden/));
    expect(document.activeElement).toBe(elsewhere);
    expect(showLog.fire).not.toHaveBeenCalled();
  });

  it('a menu that closes once the focus has left it does not take the focus back', async () => {
    const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
    render(wrap(
      <div>
        <ActionContextMenu actions={[showLog]}>{segment()}</ActionContextMenu>
        <button type="button">elsewhere</button>
      </div>,
    ));
    link().focus();
    const menu = await openMenu();
    await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });
    elsewhere.focus();
    // A scroll closes a menu put at the pointer.
    fireEvent.scroll(window);
    await waitFor(() => expect(menu.closest('.ant-dropdown')!.className).toMatch(/-leave|ant-dropdown-hidden/));
    expect(document.activeElement).toBe(elsewhere);
  });

  describe('through a child that is an antd Tooltip (as a bar\'s segment with its tooltip)', () => {
    function tipped() {
      return (
        <Tooltip title="1–100" trigger={['hover', 'focus']}>
          <span tabIndex={0} role="img" aria-label="1–100" />
        </Tooltip>
      );
    }
    const target = () => screen.getByRole('img', { name: '1–100' });

    it('a right click opens the menu instead of the browser\'s, and a pick fires', async () => {
      const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
      const drop = makeStatus({ id: 'drop', label: 'Drop' });
      render(wrap(<ActionContextMenu actions={[showLog, drop]}>{tipped()}</ActionContextMenu>));
      expect(fireEvent.contextMenu(target())).toBe(false);
      const menu = await screen.findByRole('menu');
      expect(within(menu).getAllByRole('menuitem').map((r) => r.textContent)).toEqual(['Show log', 'Drop']);
      fireEvent.click(row(menu, 'Drop'));
      expect(drop.fire).toHaveBeenCalledTimes(1);
      expect(showLog.fire).not.toHaveBeenCalled();
    });

    it('the tooltip still shows on hover', async () => {
      const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
      render(wrap(<ActionContextMenu actions={[showLog]}>{tipped()}</ActionContextMenu>));
      fireEvent.mouseEnter(target());
      await waitFor(() => expect(openTooltips().map((t) => t.textContent)).toEqual(['1–100']));
    });

    it('opened from the keyboard, the menu takes the focus; Escape gives it back to the child', async () => {
      const showLog = makeStatus({ id: 'show-log', label: 'Show log' });
      render(wrap(<ActionContextMenu actions={[showLog]}>{tipped()}</ActionContextMenu>));
      target().focus();
      fireEvent.contextMenu(target());
      const menu = await screen.findByRole('menu');
      await waitFor(() => expect(document.activeElement).toBe(row(menu, 'Show log')));
      fireEvent.keyDown(document.activeElement!, { key: 'Escape', code: 'Escape', keyCode: 27 });
      await waitFor(() => expect(document.activeElement).toBe(target()));
    });
  });
});
