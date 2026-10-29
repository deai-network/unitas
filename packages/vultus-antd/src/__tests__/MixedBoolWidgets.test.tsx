import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { denyWithReason, useBoolField, useMixedBoolField, type MixedBool } from 'vultus-core';
import { BoolCheckbox } from '../BoolCheckbox.js';
import { BoolSwitch } from '../BoolSwitch.js';
import { DOUBLE_CLICK_MS } from '../useClickOrDoubleClick.js';
import { VultusProvider } from '../VultusProvider.js';
import { openTooltips } from './helpers/tooltips.js';

const descriptions = {
  true: 'All entities are on autopilot.',
  false: 'No entity is on autopilot.',
  mixed: 'Some entities are on autopilot, but not all. Click to enable all.',
};

function Aggregate({ value, fire, enabled = true, pending }: { value: MixedBool; fire: (next: boolean) => void; enabled?: boolean; pending?: boolean }) {
  const field = useMixedBoolField({
    id: 'autopilot', label: 'Autopilot', description: 'Runs the syncs unattended.',
    valueDescriptions: descriptions, value, commit: { fire },
    enabled: enabled ? true : denyWithReason('Only admins can change autopilot.'),
    pending,
  });
  return <><BoolSwitch field={field} /><BoolCheckbox field={field} /></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);

describe('mixed boolean fields in the boolean widgets', () => {
  it('mixed: the switch is not checked, its knob sits in the middle; the checkbox is indeterminate', () => {
    wrap(<Aggregate value="mixed" fire={vi.fn()} />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw.querySelector<HTMLElement>('.ant-switch-handle')!.style.insetInlineStart).toBe('50%');
    expect(screen.getByRole('checkbox').closest('.ant-checkbox')).toHaveClass('ant-checkbox-indeterminate');
  });

  it('a click from mixed requests on, in both widgets', async () => {
    const fire = vi.fn();
    wrap(<Aggregate value="mixed" fire={fire} />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith(true, expect.anything()));
    fire.mockClear();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith(true, expect.anything()));
  });

  it('on and off render as usual', () => {
    const { unmount } = wrap(<Aggregate value={true} fire={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch').querySelector<HTMLElement>('.ant-switch-handle')!.style.insetInlineStart).toBe('');
    unmount();
    wrap(<Aggregate value={false} fire={vi.fn()} />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('the description and the current state are the accessible description', () => {
    wrap(<Aggregate value="mixed" fire={vi.fn()} />);
    const expected = `Runs the syncs unattended. Current state: ${descriptions.mixed}`;
    expect(screen.getByRole('switch')).toHaveAttribute('aria-description', expected);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-description', expected);
  });
});

describe('a pending mixed field', () => {
  it('both widgets lock (focusable, said unavailable); a click from mixed requests nothing and mixed stays shown', async () => {
    const fire = vi.fn();
    wrap(<Aggregate value="mixed" fire={fire} pending />);
    for (const el of [screen.getByRole('switch'), screen.getByRole('checkbox')]) {
      expect(el).not.toBeDisabled();
      expect(el).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(el);
    }
    await act(() => new Promise((resolve) => { setTimeout(resolve, DOUBLE_CLICK_MS + 100); }));
    expect(fire).not.toHaveBeenCalled();
    const sw = screen.getByRole('switch');
    expect(sw.querySelector<HTMLElement>('.ant-switch-handle')!.style.insetInlineStart).toBe('50%');
    expect(sw).toHaveClass('ant-switch-disabled');
    expect(screen.getByRole('checkbox').closest('.ant-checkbox')).toHaveClass('ant-checkbox-indeterminate');
  });

  it.each(['switch', 'checkbox'] as const)('a click on the locked %s leaves no trace: the first click once pending ends is a single click (on), not the second half of a double click (off)', async (role) => {
    const fire = vi.fn();
    const { rerender } = wrap(<Aggregate value="mixed" fire={fire} pending />);
    fireEvent.click(screen.getByRole(role));
    rerender(<AntApp><Aggregate value="mixed" fire={fire} /></AntApp>);
    fireEvent.click(screen.getByRole(role));
    await act(() => new Promise((resolve) => { setTimeout(resolve, DOUBLE_CLICK_MS + 100); }));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(true, expect.anything());
  });

  describe.each(['switch', 'checkbox'] as const)('a click on the %s from mixed whose wait ends after the lock starts', (role) => {
    it.each([false, true])('requests nothing, the field being locked by then (a second click while locked: %s)', async (second) => {
      const fire = vi.fn();
      const { rerender } = wrap(<Aggregate value="mixed" fire={fire} />);
      fireEvent.click(screen.getByRole(role));
      rerender(<AntApp><Aggregate value="mixed" fire={fire} pending /></AntApp>);
      if (second) fireEvent.click(screen.getByRole(role));
      await act(() => new Promise((resolve) => { setTimeout(resolve, DOUBLE_CLICK_MS + 100); }));
      expect(fire).not.toHaveBeenCalled();
    });
  });

  it('a click on the locked mixed checkbox (on the box or on its label) leaves its input indeterminate, so it is still said to be mixed', () => {
    wrap(<Aggregate value="mixed" fire={vi.fn()} pending />);
    const input = screen.getByRole('checkbox') as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    // The click's activation is cancelled (a browser then restores `checked` too; jsdom's cancel
    // inverts it after React restored it, so `checked` is not checked here).
    expect(fireEvent.click(input)).toBe(false);
    expect(input.indeterminate).toBe(true);
    fireEvent.click(input.closest('label')!);
    expect(input.indeterminate).toBe(true);
  });

  it('not enabled and pending: both disabled as before, not marked locked', () => {
    wrap(<Aggregate value="mixed" fire={vi.fn()} enabled={false} pending />);
    for (const el of [screen.getByRole('switch'), screen.getByRole('checkbox')]) {
      expect(el).toBeDisabled();
      expect(el).not.toHaveAttribute('aria-disabled');
    }
  });
});

describe('tooltip', () => {
  it('enabled: the description, then the current state', async () => {
    wrap(<Aggregate value={false} fire={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    const state = await screen.findByText(`Current state: ${descriptions.false}`);
    expect(state.closest('[role="tooltip"]')!.textContent).toBe(`Runs the syncs unattended.Current state: ${descriptions.false}`);
  });

  it('the app translates "Current state:" through VultusProvider', async () => {
    render(<AntApp><VultusProvider texts={{ currentState: 'Jelenlegi állapot:' }}>
      <Aggregate value={false} fire={vi.fn()} />
    </VultusProvider></AntApp>);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-description', `Runs the syncs unattended. Jelenlegi állapot: ${descriptions.false}`);
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    expect(await screen.findByText(`Jelenlegi állapot: ${descriptions.false}`)).toBeInTheDocument();
  });

  it('disabled: the reason, then the description; no value description', async () => {
    wrap(<Aggregate value="mixed" fire={vi.fn()} enabled={false} />);
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    const reason = await screen.findByText('Only admins can change autopilot.');
    const tip = reason.closest('.ant-tooltip-container, .ant-tooltip-inner') ?? reason.parentElement!.parentElement!;
    expect(tip.textContent).toContain('Runs the syncs unattended.');
    expect(tip.textContent).not.toContain('Click to enable all');
  });

  it('a plain boolean field without texts has no tooltip', async () => {
    function Plain() {
      const field = useBoolField({ id: 'p', label: 'Plain' });
      return <BoolSwitch field={field} />;
    }
    wrap(<Plain />);
    // The tooltip's span is there all the same (see withTooltip); hovering it opens nothing.
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    await act(() => new Promise((resolve) => { setTimeout(resolve, 300); }));
    expect(openTooltips()).toHaveLength(0);
  });
});
