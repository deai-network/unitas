import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import { denyWithReason, useOneOfField, type FieldCommit, type OneOfChoice, type OneOfFieldOptions } from 'vultus-core';
import { OneOfSlider } from '../OneOfSlider.js';
import { openTooltips } from './helpers/tooltips.js';

type Effort = 'low' | 'medium' | 'high' | 'max';

const LEVELS: OneOfChoice<Effort>[] = [
  { value: 'low', label: 'Low', description: 'Answers quickly' },
  { value: 'medium', label: 'Medium', description: 'Thinks a little' },
  { value: 'high', label: 'High', description: 'Thinks **carefully**' },
  { value: 'max', label: 'Max', description: 'Thinks as long as it needs', variant: 'danger',
    enabled: denyWithReason('Not on this model') },
];

function Inside(opts: Partial<Omit<OneOfFieldOptions<Effort>, 'value' | 'onChange' | 'commit'>>) {
  const field = useOneOfField<Effort>({
    id: 'effort', label: 'Effort', description: 'How much should the model think?',
    choices: LEVELS, initialValue: 'medium', ...opts,
  } as OneOfFieldOptions<Effort>);
  return <><OneOfSlider field={field} /><output>{field.value}</output></>;
}

function Committed({ fire, confirmation }: {
  fire: (next: Effort) => Promise<void> | void;
  confirmation?: FieldCommit<Effort>['confirmation'];
}) {
  const [stored, setStored] = useState<Effort>('medium');
  const field = useOneOfField<Effort>({
    id: 'effort', label: 'Effort', choices: LEVELS, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><OneOfSlider field={field} /><output>{field.value}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const handle = () => screen.getByRole('slider');
const mark = (label: string) => screen.getByText(label);
// The slider moves on keydown and ends the move on keyup, as a real key press does.
const press = (key: string, keyCode: number) => {
  fireEvent.keyDown(handle(), { key, keyCode });
  fireEvent.keyUp(handle(), { key, keyCode });
};

describe('OneOfSlider', () => {
  it('shows the current choice: the handle sits on it and names it', () => {
    wrap(<Inside />);
    expect(handle()).toHaveAttribute('aria-valuenow', '1');
    expect(handle()).toHaveAttribute('aria-valuetext', 'Medium');
    expect(handle()).toHaveAttribute('aria-label', 'Effort');
  });

  it('clicking a mark chooses it', async () => {
    wrap(<Inside />);
    fireEvent.click(mark('High'));
    await waitFor(() => expect(shown()).toBe('high'));
  });

  it('the arrow keys move to the next choice', async () => {
    wrap(<Inside />);
    press('ArrowRight', 39);
    await waitFor(() => expect(shown()).toBe('high'));
  });

  it('a disabled choice cannot be chosen: the handle stays; its mark shows the reason, then its description', async () => {
    wrap(<Inside initialValue="high" />);
    fireEvent.click(mark('Max'));
    expect(shown()).toBe('high');
    expect(handle()).toHaveAttribute('aria-valuenow', '2');
    fireEvent.mouseEnter(mark('Max').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Not on this model')).toBeInTheDocument());
    expect(screen.getByText('Thinks as long as it needs')).toBeInTheDocument();
  });

  it('an arrow key onto a disabled choice requests nothing: the handle returns', async () => {
    wrap(<Inside initialValue="high" />);
    fireEvent.keyDown(handle(), { key: 'ArrowRight', keyCode: 39 });
    expect(handle()).toHaveAttribute('aria-valuenow', '3');
    fireEvent.keyUp(handle(), { key: 'ArrowRight', keyCode: 39 });
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '2'));
    expect(shown()).toBe('high');
  });

  it('hovering a mark shows its choice\'s description', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(mark('High').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('carefully', { selector: 'strong' })).toBeInTheDocument());
  });

  it('hovering any part of the slider (here its rail) shows what the field is, then the current state', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-rail')!);
    await waitFor(() => expect(screen.getByText('How much should the model think?')).toBeInTheDocument());
    expect(screen.getByText('Current state: Thinks a little')).toBeInTheDocument();
  });

  it('on a mark with its own tooltip, that one shows instead of the field\'s', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-rail')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    fireEvent.mouseEnter(mark('High').closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('carefully', { selector: 'strong' })).toBeInTheDocument());
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent('Thinks carefully');
  });

  it('hovering the handle shows what the field is, then the current state', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(handle());
    await waitFor(() => expect(screen.getByText('How much should the model think?')).toBeInTheDocument());
    expect(screen.getByText('Current state: Thinks a little')).toBeInTheDocument();
  });

  it('commit: one request per move, with the choice\'s confirmation first', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire}
      confirmation={(next) => (next === 'low' ? { kind: 'popconfirm', question: 'Think less?' } : undefined)} />);
    fireEvent.click(mark('High'));
    await waitFor(() => expect(fire).toHaveBeenCalledTimes(1));
    expect(fire).toHaveBeenCalledWith('high');
    fireEvent.click(mark('Low'));
    expect(await screen.findByText('Think less?')).toBeInTheDocument();
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!); });
    expect(fire).toHaveBeenLastCalledWith('low');
  });

  it('while a confirmation is open, the slider holds back its tooltips (they would cover it)', async () => {
    wrap(<Committed fire={vi.fn()}
      confirmation={(next) => (next === 'low' ? { kind: 'popconfirm', question: 'Think less?' } : undefined)} />);
    fireEvent.mouseEnter(mark('Low').closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    fireEvent.click(mark('Low'));
    expect(await screen.findByText('Think less?')).toBeInTheDocument();
    expect(openTooltips()).toHaveLength(0);
  });

  it('a committed move: the handle stays on the requested choice while the commit runs (no jump back)', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    fireEvent.click(mark('High'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith('high'));
    expect(handle()).toHaveAttribute('aria-valuenow', '2');
    expect(shown()).toBe('medium');
    await act(async () => { finish(); });
    expect(handle()).toHaveAttribute('aria-valuenow', '2');
    expect(shown()).toBe('high');
  });

  it('a failed commit: the handle returns to the stored choice', async () => {
    let fail!: () => void;
    const fire = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = () => reject(new Error('refused')); }));
    wrap(<Committed fire={fire} />);
    fireEvent.click(mark('High'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith('high'));
    await act(async () => { fail(); });
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '1'));
    expect(shown()).toBe('medium');
  });

  it('while the confirmation is asked the handle stays on the requested choice; Cancel returns it', async () => {
    wrap(<Committed fire={vi.fn()}
      confirmation={(next) => (next === 'low' ? { kind: 'popconfirm', question: 'Think less?' } : undefined)} />);
    fireEvent.click(mark('Low'));
    expect(await screen.findByText('Think less?')).toBeInTheDocument();
    expect(handle()).toHaveAttribute('aria-valuenow', '0');
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Cancel'))!);
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '1'));
    expect(shown()).toBe('medium');
  });

  it('a danger choice\'s mark is in the danger colour while enabled', () => {
    wrap(<Inside choices={LEVELS.map((c) => (c.value === 'max' ? { ...c, enabled: true } : c))} />);
    expect(mark('Max')).toHaveStyle({ color: 'rgb(255, 77, 79)' });
  });

  it('a disabled field: the reason on hover of its handle, no change', async () => {
    wrap(<Inside enabled={denyWithReason('Locked for this task')} />);
    fireEvent.click(mark('High'));
    expect(shown()).toBe('medium');
    fireEvent.mouseEnter(document.querySelector('[data-field-id="effort"]')!.closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Locked for this task')).toBeInTheDocument());
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
