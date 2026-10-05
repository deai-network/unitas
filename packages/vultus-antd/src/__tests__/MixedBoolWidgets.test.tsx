import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { denyWithReason, useBoolField, useMixedBoolField, type MixedBool } from 'vultus-core';
import { BoolCheckbox } from '../BoolCheckbox.js';
import { BoolSwitch } from '../BoolSwitch.js';
import { VultusProvider } from '../VultusProvider.js';

const descriptions = {
  true: 'All entities are on autopilot.',
  false: 'No entity is on autopilot.',
  mixed: 'Some entities are on autopilot, but not all. Click to enable all.',
};

function Aggregate({ value, fire, enabled = true }: { value: MixedBool; fire: (next: boolean) => void; enabled?: boolean }) {
  const field = useMixedBoolField({
    id: 'autopilot', label: 'Autopilot', description: 'Runs the syncs unattended.',
    valueDescriptions: descriptions, value, commit: { fire },
    enabled: enabled ? true : denyWithReason('Only admins can change autopilot.'),
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

describe('tooltip', () => {
  it('enabled: the description, then the current state', async () => {
    wrap(<Aggregate value={false} fire={vi.fn()} />);
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    const state = await screen.findByText(`Current state: ${descriptions.false}`);
    expect(state.parentElement!.textContent).toBe(`Runs the syncs unattended.Current state: ${descriptions.false}`);
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

  it('a plain boolean field without texts has no tooltip', () => {
    function Plain() {
      const field = useBoolField({ id: 'p', label: 'Plain' });
      return <BoolSwitch field={field} />;
    }
    wrap(<Plain />);
    expect(screen.getByRole('switch').closest('span[style]')).toBeNull();
  });
});
