import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App as AntApp, ConfigProvider } from 'antd';
import { ActionButton } from '../ActionButton.js';
import { makeStatus } from './helpers/makeStatus.js';

function wrap(node: React.ReactNode) {
  return <AntApp>{node}</AntApp>;
}

describe('ActionButton', () => {
  it('renders nothing when invisible', () => {
    const { container } = render(wrap(<ActionButton action={makeStatus({ invisible: true })} />));
    expect(container.firstChild?.firstChild).toBeNull();
  });

  it('buttonVariant: a text button, the action\'s variant still picks the colour', () => {
    render(wrap(<>
      <ActionButton action={makeStatus({ id: 'plain', label: 'Plain' })} buttonVariant="text" />
      <ActionButton action={makeStatus({ id: 'del', label: 'Delete', variant: 'danger' })} buttonVariant="text" />
    </>));
    const plain = screen.getByRole('button', { name: 'Plain' });
    const del = screen.getByRole('button', { name: 'Delete' });
    expect(plain).toHaveClass('ant-btn-variant-text', 'ant-btn-color-default');
    expect(del).toHaveClass('ant-btn-variant-text', 'ant-btn-color-dangerous');
  });

  it('without buttonVariant: the usual outlined button', () => {
    render(wrap(<ActionButton action={makeStatus({ label: 'Plain' })} />));
    expect(screen.getByRole('button', { name: 'Plain' })).toHaveClass('ant-btn-variant-outlined');
  });

  it('iconOnly: no visible label; the label names the button and is its tooltip', async () => {
    render(wrap(<ActionButton action={makeStatus({ label: 'Delete', icon: <span>x</span>, variant: 'danger' })} iconOnly />));
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn).not.toHaveTextContent('Delete');
    expect(btn).toHaveClass('ant-btn-icon-only');
    fireEvent.mouseEnter(btn.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete');
  });

  it('iconOnly and disabled: the tooltip gives the label, then the reason', async () => {
    render(wrap(<ActionButton action={makeStatus({ label: 'Delete', icon: <span>x</span>, disabled: true, reason: 'Admins only' })} iconOnly />));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Delete' }).parentElement!);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Delete');
    expect(tip).toHaveTextContent('Admins only');
  });

  it('buttonColor shows a danger action in another colour', () => {
    render(wrap(<ActionButton action={makeStatus({ label: 'Cancel', variant: 'danger' })} buttonColor="default" />));
    const btn = screen.getByRole('button', { name: 'Cancel' });
    expect(btn).toHaveClass('ant-btn-color-default', 'ant-btn-variant-outlined');
    expect(btn).not.toHaveClass('ant-btn-dangerous');
  });

  it('array form: className reaches the combined buttons', () => {
    render(wrap(<ActionButton action={[makeStatus({ id: 'a', label: 'Analyze' }), makeStatus({ id: 'b', label: 'Sync' })]} className="look-y" />));
    for (const btn of screen.getAllByRole('button')) expect(btn).toHaveClass('look-y');
  });

  it('className reaches the button', () => {
    render(wrap(<ActionButton action={makeStatus({ label: 'Run' })} className="look-x" />));
    expect(screen.getByRole('button', { name: 'Run' })).toHaveClass('look-x');
  });

  it('pending → disabled', () => {
    render(wrap(<ActionButton action={makeStatus({ pending: true })} />));
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disabled → disabled; reason exposed via AntD Tooltip on hover', async () => {
    render(wrap(<ActionButton action={makeStatus({ disabled: true, reason: 'because' })} />));
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    // AntD wraps the disabled button in a span (workaround for AntD's
    // pointer-events:none on disabled buttons swallowing native hover).
    // Reason becomes Tooltip.title; on hover, Tooltip renders into a portal.
    // The span sits between the button and the Tooltip mount; hovering it
    // triggers the Tooltip's mouseenter handler.
    fireEvent.mouseEnter(btn.parentElement!);
    await waitFor(() => {
      expect(screen.getByText('because')).toBeInTheDocument();
    });
  });

  it('no confirmation → onClick fires action', () => {
    const fire = vi.fn();
    render(wrap(<ActionButton action={makeStatus({ fire })} />));
    fireEvent.click(screen.getByRole('button'));
    expect(fire).toHaveBeenCalled();
  });

  it('popconfirm: wraps button; onConfirm fires action', async () => {
    const fire = vi.fn();
    render(
      wrap(
        <ActionButton
          action={makeStatus({
            fire,
            confirmation: { kind: 'popconfirm', question: 'Sure?' },
          })}
        />,
      ),
    );
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Sure?')).toBeInTheDocument();
    const okBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'));
    if (okBtn) fireEvent.click(okBtn);
    expect(fire).toHaveBeenCalled();
  });

  it('default iconPlacement keeps the icon at the start', () => {
    render(wrap(<ActionButton action={makeStatus({ icon: <span data-testid="icon" /> })} />));
    expect(screen.getByRole('button').className).not.toContain('ant-btn-icon-end');
  });

  it('iconPlacement="end" moves the icon (antd icon-end class) — including the loading slot while pending', () => {
    const { rerender } = render(
      wrap(<ActionButton action={makeStatus({ icon: <span data-testid="icon" /> })} iconPlacement="end" />),
    );
    expect(screen.getByRole('button').className).toContain('ant-btn-icon-end');

    rerender(
      wrap(
        <ActionButton
          action={makeStatus({ icon: <span data-testid="icon" />, pending: true })}
          iconPlacement="end"
        />,
      ),
    );
    // Still icon-end while the loading spinner occupies the icon slot.
    expect(screen.getByRole('button').className).toContain('ant-btn-icon-end');
  });

  it('default align adds no justify-content style', () => {
    render(wrap(<ActionButton action={makeStatus()} />));
    expect(screen.getByRole('button').style.justifyContent).toBe('');
  });

  it('align="end" sets justify-content: flex-end', () => {
    render(wrap(<ActionButton action={makeStatus()} align="end" />));
    expect(screen.getByRole('button')).toHaveStyle({ justifyContent: 'flex-end' });
  });

  it('align="start" sets justify-content: flex-start', () => {
    render(wrap(<ActionButton action={makeStatus()} align="start" />));
    expect(screen.getByRole('button')).toHaveStyle({ justifyContent: 'flex-start' });
  });
});

describe('ActionButton — confirmation modal context', () => {
  it('cascade-modal confirmation renders under the app ConfigProvider (not a static modal)', async () => {
    const action = makeStatus({
      id: 'x',
      label: 'Delete',
      confirmation: { kind: 'cascade-modal', title: 'Delete it?', content: 'Sure?' },
    });
    render(
      <ConfigProvider prefixCls="vx">
        <ActionButton action={action} />
      </ConfigProvider>,
    );
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(document.body.querySelector('.vx-modal-confirm-title')?.textContent).toBe('Delete it?');
    });
  });
});

describe('ActionButton — typing confirmation', () => {
  const burnAll = () => makeStatus({
    id: 'burn',
    label: 'Burn all',
    variant: 'danger',
    confirmation: {
      kind: 'typing',
      title: 'Burn the pool?',
      entityName: 'burn pool',
      description: 'Every agent goes.',
      prompt: 'Zum Bestätigen {phrase} eingeben:',
    },
  });

  it('the OK button shows the action label, danger; the prompt places the phrase', async () => {
    render(wrap(<ActionButton action={burnAll()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Burn all' }));
    const dialog = (await screen.findByText('Burn the pool?')).closest('.ant-modal') as HTMLElement;
    const ok = within(dialog).getByRole('button', { name: 'Burn all' });
    expect(ok).toBeDisabled();
    expect(ok).toHaveClass('ant-btn-dangerous');
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();
    const phrase = within(dialog).getByText('burn pool', { selector: 'code' });
    expect(phrase.parentElement).toHaveTextContent(/^Zum Bestätigen burn pool eingeben:$/);
  });

  it('Enter with the phrase typed fires the action', async () => {
    const action = burnAll();
    render(wrap(<ActionButton action={action} />));
    fireEvent.click(screen.getByRole('button', { name: 'Burn all' }));
    const dialog = (await screen.findByText('Burn the pool?')).closest('.ant-modal') as HTMLElement;
    const input = within(dialog).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'burn pool' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(action.fire).toHaveBeenCalledTimes(1);
  });
});

describe('ActionButton — size', () => {
  // antd 6's size scale includes 'medium'; a ConfigProvider componentSize
  // can be passed straight through.
  it('accepts antd 6 sizes, including medium', () => {
    const { rerender } = render(wrap(<ActionButton action={makeStatus()} size="medium" />));
    const cls = () => screen.getByRole('button').className;
    expect(cls()).not.toMatch(/ant-btn-(sm|lg)\b/);
    rerender(wrap(<ActionButton action={makeStatus()} size="small" />));
    expect(cls()).toMatch(/ant-btn-sm\b/);
  });
});
