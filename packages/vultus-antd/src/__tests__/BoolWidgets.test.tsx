import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import { denyWithReason, useBoolField, type BoolFieldOptions, type FieldCommit } from 'vultus-core';
import { BoolCheckbox } from '../BoolCheckbox.js';
import { BoolSwitch } from '../BoolSwitch.js';

const widgets = { BoolSwitch, BoolCheckbox } as const;
type Kind = keyof typeof widgets;

function Inside({ kind, ...opts }: { kind: Kind } & Omit<BoolFieldOptions, 'value' | 'onChange' | 'commit'>) {
  const field = useBoolField({ id: 'notify', label: 'Notify me', ...opts } as BoolFieldOptions);
  const Widget = widgets[kind];
  return <><Widget field={field} /><output>{String(field.value)}</output></>;
}

/** The value lives outside (here in state); the commit stores it after `fire` succeeds. */
function Committed({ kind, fire, confirmation, enabled }: {
  kind: Kind;
  fire: (next: boolean) => Promise<void> | void;
  confirmation?: FieldCommit<boolean>['confirmation'];
  enabled?: BoolFieldOptions['enabled'];
}) {
  const [stored, setStored] = useState(true);
  const field = useBoolField({
    id: 'source.enabled', label: 'Enabled', value: stored, enabled,
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

  it('commit: fires with the requested value, is locked while pending, then shows the stored value', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed kind={kind} fire={fire} />);
    fireEvent.click(control(kind));
    expect(fire).toHaveBeenCalledWith(false);
    await waitFor(() => expect(control(kind)).toBeDisabled());
    expect(screen.getByRole('status').textContent).toBe('true');
    await act(async () => { finish(); });
    await waitFor(() => expect(control(kind)).not.toBeDisabled());
    expect(screen.getByRole('status').textContent).toBe('false');
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

  it('renders nothing when hidden', () => {
    wrap(<Inside kind={kind} hidden />);
    expect(screen.queryByRole(kind === 'BoolSwitch' ? 'switch' : 'checkbox')).toBeNull();
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
