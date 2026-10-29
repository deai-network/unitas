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

function Committed({ fire, confirmation, initial = 'medium' }: {
  fire: (next: Effort) => Promise<void> | void;
  confirmation?: FieldCommit<Effort>['confirmation'];
  initial?: Effort;
}) {
  const [stored, setStored] = useState<Effort>(initial);
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

  it('another enabled mark: what the field is, then its description led by "Switch to:"', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(mark('High').closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent(/^How much should the model think\?\s*Switch to: Thinks carefully$/);
  });

  it('the current mark: what the field is, then its description led by "Current state:"', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(mark('Medium').closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent(/^How much should the model think\?\s*Current state: Thinks a little$/);
  });

  it('a disabled mark: what the field is, its reason, then its description without "Switch to:"', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(mark('Max').closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent(/^How much should the model think\?\s*Not on this model\s*Thinks as long as it needs$/);
  });

  it('hovering any part of the slider (here its rail) shows only what the field is, nothing about the values', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-rail')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent(/^How much should the model think\?$/);
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

  it('hovering the handle shows only what the field is', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(handle());
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent(/^How much should the model think\?$/);
  });

  it('a field without a description: no tooltip on the track; a mark still shows its own', async () => {
    wrap(<Inside description={undefined} />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-rail')!);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(0);
    fireEvent.mouseEnter(mark('High').closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent(/^Switch to: Thinks carefully$/);
  });

  it('the accessible description still names the current state', () => {
    wrap(<Inside />);
    const root = document.querySelector<HTMLElement>('[data-field-id="effort"]')!;
    expect(root.getAttribute('aria-description')).toBe('How much should the model think? Current state: Thinks a little');
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

  it('a move while a confirmation is asked is not taken: the handle stays on the asked choice, which OK commits', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} initial="low"
      confirmation={(next) => (next === 'medium' ? { kind: 'popconfirm', question: 'Think more?' } : undefined)} />);
    press('ArrowRight', 39);
    expect(await screen.findByText('Think more?')).toBeInTheDocument();
    expect(handle()).toHaveAttribute('aria-valuenow', '1');
    press('ArrowRight', 39);
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '1'));
    await act(async () => { fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!); });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith('medium');
    await waitFor(() => expect(shown()).toBe('medium'));
    expect(handle()).toHaveAttribute('aria-valuenow', '1');
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

describe('OneOfSlider while pending', () => {
  it('the app\'s own: locked, not disabled: the handle keeps its tab stop, is said unavailable; an arrow key or a mark click requests nothing, the handle stays', () => {
    wrap(<Inside pending />);
    expect(handle()).toHaveAttribute('tabindex', '0');
    expect(handle()).not.toHaveClass('ant-slider-handle-disabled');
    expect(handle()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(handle(), { key: 'ArrowRight', keyCode: 39 });
    expect(handle()).toHaveAttribute('aria-valuenow', '1');
    fireEvent.keyUp(handle(), { key: 'ArrowRight', keyCode: 39 });
    fireEvent.click(mark('High'));
    expect(handle()).toHaveAttribute('aria-valuenow', '1');
    expect(shown()).toBe('medium');
  });

  it('the app\'s own: Home, End, PageUp and PageDown move nothing (their default prevented), the focus stays; Tab passes', () => {
    wrap(<Inside pending />);
    act(() => handle().focus());
    for (const [key, keyCode] of [['Home', 36], ['End', 35], ['PageUp', 33], ['PageDown', 34]] as const) {
      expect(fireEvent.keyDown(handle(), { key, keyCode })).toBe(false);
      fireEvent.keyUp(handle(), { key, keyCode });
      expect(handle()).toHaveAttribute('aria-valuenow', '1');
    }
    expect(document.activeElement).toBe(handle());
    expect(fireEvent.keyDown(handle(), { key: 'Tab', keyCode: 9 })).toBe(true);
    expect(shown()).toBe('medium');
  });

  it('the app\'s own: the marks hold back their tooltips (a "Switch to:" it cannot act on would mislead)', async () => {
    wrap(<Inside pending />);
    fireEvent.mouseEnter(mark('High').closest('span[style]')!);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(openTooltips()).toHaveLength(0);
  });

  it('keeps the look of a disabled slider (antd\'s own disabled class on it)', () => {
    wrap(<Inside pending />);
    expect(document.querySelector('.ant-slider')).toHaveClass('ant-slider-disabled');
  });

  it('its commit: the handle stays on the requested choice, a further move requests nothing; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    fireEvent.click(mark('High'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith('high'));
    await waitFor(() => expect(handle()).toHaveAttribute('aria-disabled', 'true'));
    expect(handle()).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(handle(), { key: 'ArrowLeft', keyCode: 37 });
    expect(handle()).toHaveAttribute('aria-valuenow', '2');
    fireEvent.keyUp(handle(), { key: 'ArrowLeft', keyCode: 37 });
    // antd re-renders the handle on its own (its focus state), the widget not: still said unavailable.
    act(() => handle().focus());
    expect(handle()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(mark('Low'));
    expect(handle()).toHaveAttribute('aria-valuenow', '2');
    expect(handle()).toHaveAttribute('aria-disabled', 'true');
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(shown()).toBe('high');
    expect(handle()).toHaveAttribute('aria-valuenow', '2');
    expect(handle()).toHaveAttribute('aria-disabled', 'false');
    expect(document.querySelector('.ant-slider')).not.toHaveClass('ant-slider-disabled');
  });

  it('not enabled and pending: disabled as before', () => {
    wrap(<Inside pending enabled={denyWithReason('Locked for this task')} />);
    expect(handle()).not.toHaveAttribute('tabindex');
    expect(handle()).toHaveClass('ant-slider-handle-disabled');
    expect(handle()).toHaveAttribute('aria-disabled', 'true');
  });
});
