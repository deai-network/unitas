import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import { denyWithReason, useBoolField, type BoolFieldOptions, type FieldCommit } from 'vultus-core';
import { BoolCheckbox } from '../BoolCheckbox.js';
import { BoolSwitch } from '../BoolSwitch.js';
import { openTooltips } from './helpers/tooltips.js';

const widgets = { BoolSwitch, BoolCheckbox } as const;
type Kind = keyof typeof widgets;

function Inside({ kind, ...opts }: { kind: Kind } & Omit<BoolFieldOptions, 'value' | 'onChange' | 'commit'>) {
  const field = useBoolField({ id: 'notify', label: 'Notify me', ...opts } as BoolFieldOptions);
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{String(field.value)}</output></>;
}

/** The value lives outside (here in state); the commit stores it after `fire` succeeds. */
function Committed({ kind, fire, confirmation, enabled, description }: {
  kind: Kind;
  fire: (next: boolean) => Promise<void> | void;
  confirmation?: FieldCommit<boolean>['confirmation'];
  enabled?: BoolFieldOptions['enabled'];
  description?: string;
}) {
  const [stored, setStored] = useState(true);
  const field = useBoolField({
    id: 'source.enabled', label: 'Enabled', description, value: stored, enabled,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{String(field.value)}</output></>;
}

const control = (kind: Kind) => (kind === 'BoolSwitch' ? screen.getByRole('switch') : screen.getByRole('checkbox'));
const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);

describe.each(['BoolSwitch', 'BoolCheckbox'] as Kind[])('%s', (kind) => {
  it('shows the value and changes it inside the field', () => {
    wrap(<Inside kind={kind} />);
    expect(screen.getByRole('status').textContent).toBe('false');
    fireEvent.click(control(kind));
    expect(screen.getByRole('status').textContent).toBe('true');
  });

  it('commit: fires with the requested value, is locked while pending (focusable, said unavailable, changes ignored), then shows the stored value', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed kind={kind} fire={fire} />);
    fireEvent.click(control(kind));
    expect(fire).toHaveBeenCalledWith(false);
    await waitFor(() => expect(control(kind)).toHaveAttribute('aria-disabled', 'true'));
    expect(control(kind)).not.toBeDisabled();
    expect(document.querySelector('.ant-spin')).toBeTruthy();
    // A second click, and the switch's own arrow key, request nothing; the control still shows the field's value.
    fireEvent.click(control(kind));
    if (kind === 'BoolSwitch') fireEvent.keyDown(control(kind), { key: 'ArrowLeft', keyCode: 37, which: 37 });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(control(kind)).toBeChecked();
    expect(screen.getByRole('status').textContent).toBe('true');
    await act(async () => { finish(); });
    await waitFor(() => expect(control(kind)).not.toHaveAttribute('aria-disabled'));
    expect(control(kind)).not.toBeDisabled();
    expect(document.querySelector('.ant-spin')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('false');
  });

  it('pending (the app\'s own): locked, a click or key requests nothing', () => {
    wrap(<Inside kind={kind} pending />);
    expect(control(kind)).not.toBeDisabled();
    expect(control(kind)).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(control(kind));
    if (kind === 'BoolSwitch') fireEvent.keyDown(control(kind), { key: 'ArrowRight', keyCode: 39, which: 39 });
    expect(control(kind)).not.toBeChecked();
    expect(screen.getByRole('status').textContent).toBe('false');
  });

  it('not enabled and pending: disabled as before, not marked locked', () => {
    wrap(<Inside kind={kind} pending enabled={denyWithReason('Admins only')} />);
    expect(control(kind)).toBeDisabled();
    expect(control(kind)).not.toHaveAttribute('aria-disabled');
  });

  it('disabled: the reason on hover, no change', async () => {
    const fire = vi.fn();
    wrap(<Committed kind={kind} fire={fire} enabled={denyWithReason('Admins only')} />);
    expect(control(kind)).toBeDisabled();
    fireEvent.click(control(kind));
    expect(fire).not.toHaveBeenCalled();
    fireEvent.mouseEnter(control(kind).closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Admins only')).toBeInTheDocument());
  });

  it('confirmation for the requested value: switching off asks first', async () => {
    const fire = vi.fn();
    wrap(<Committed kind={kind} fire={fire}
      confirmation={(next) => (next ? undefined : { kind: 'popconfirm', question: 'Switch it off?' })} />);
    fireEvent.click(control(kind));
    expect(fire).not.toHaveBeenCalled();
    expect(await screen.findByText('Switch it off?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    expect(fire).toHaveBeenCalledWith(false);
  });

  it('while its confirmation is open, the widget holds back its tooltip (it would cover it)', async () => {
    wrap(<Committed kind={kind} fire={vi.fn()} description="Whether this source may sync"
      confirmation={(next) => (next ? undefined : { kind: 'popconfirm', question: 'Switch it off?' })} />);
    fireEvent.mouseEnter(control(kind).closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    fireEvent.click(control(kind));
    expect(await screen.findByText('Switch it off?')).toBeInTheDocument();
    expect(openTooltips()).toHaveLength(0);
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside kind={kind} hidden />);
    expect(screen.queryByRole(kind === 'BoolSwitch' ? 'switch' : 'checkbox')).toBeNull();
  });
});

describe('the locked look (antd\'s disabled look, without disabled)', () => {
  function OpacityProbe() {
    const { token } = theme.useToken();
    return <span data-testid="probe" style={{ opacity: token.opacityLoading }} />;
  }

  it('BoolSwitch: the switch at antd\'s disabled opacity, with the not-allowed cursor', () => {
    wrap(<><Inside kind="BoolSwitch" pending /><OpacityProbe /></>);
    const sw = screen.getByRole('switch');
    expect(screen.getByTestId('probe').style.opacity).not.toBe('');
    expect(sw.style.opacity).toBe(screen.getByTestId('probe').style.opacity);
    expect(sw.style.cursor).toBe('not-allowed');
  });

  it('BoolCheckbox: antd\'s disabled box and label, the input itself not disabled', () => {
    wrap(<Inside kind="BoolCheckbox" pending />);
    const input = screen.getByRole('checkbox');
    expect(input).not.toBeDisabled();
    expect(input.closest('.ant-checkbox')).toHaveClass('ant-checkbox-disabled');
    expect(input.closest('.ant-checkbox-wrapper')).toHaveClass('ant-checkbox-wrapper-disabled');
  });

  it('not pending: none of it', () => {
    wrap(<><Inside kind="BoolSwitch" /><Inside kind="BoolCheckbox" /></>);
    expect(screen.getByRole('switch').style.opacity).toBe('');
    expect(screen.getByRole('checkbox').closest('.ant-checkbox')).not.toHaveClass('ant-checkbox-disabled');
    expect(screen.getByRole('checkbox').closest('.ant-checkbox-wrapper')).not.toHaveClass('ant-checkbox-wrapper-disabled');
  });
});

describe('labels', () => {
  it('BoolSwitch: the label is the accessible name; BoolCheckbox: the label is shown', () => {
    wrap(<><Inside kind="BoolSwitch" /><Inside kind="BoolCheckbox" /></>);
    expect(screen.getByRole('switch', { name: 'Notify me' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Notify me' })).toBeInTheDocument();
  });
});

describe('descriptions in markdown', () => {
  it('BoolSwitch: the description in its tooltip renders as markdown', async () => {
    wrap(<Inside kind="BoolSwitch" description="Sends **email** notifications" />);
    fireEvent.mouseEnter(control('BoolSwitch').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('email', { selector: 'strong' })).toBeInTheDocument());
  });
});

describe('BoolSwitch texts inside the switch', () => {
  function Labelled({ initial }: { initial: boolean }) {
    const field = useBoolField({ id: 'autopilot', label: 'Autopilot', initialValue: initial });
    return <BoolSwitch field={field} checkedChildren="On" unCheckedChildren="Off" />;
  }

  it('shows checkedChildren when on and unCheckedChildren when off', () => {
    wrap(<Labelled initial />);
    const sw = screen.getByRole('switch');
    expect(sw.textContent).toContain('On');
    fireEvent.click(sw);
    expect(screen.getByRole('switch').textContent).toContain('Off');
  });
});
