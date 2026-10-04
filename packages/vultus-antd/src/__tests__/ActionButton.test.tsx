import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('default iconPosition keeps the icon at the start', () => {
    render(wrap(<ActionButton action={makeStatus({ icon: <span data-testid="icon" /> })} />));
    expect(screen.getByRole('button').className).not.toContain('ant-btn-icon-end');
  });

  it('iconPosition="end" moves the icon (antd icon-end class) — including the loading slot while pending', () => {
    const { rerender } = render(
      wrap(<ActionButton action={makeStatus({ icon: <span data-testid="icon" /> })} iconPosition="end" />),
    );
    expect(screen.getByRole('button').className).toContain('ant-btn-icon-end');

    rerender(
      wrap(
        <ActionButton
          action={makeStatus({ icon: <span data-testid="icon" />, pending: true })}
          iconPosition="end"
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
