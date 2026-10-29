import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
import { useState } from 'react';
import { denyWithReason, useNumericField, type FieldCommit, type NumericFieldOptions } from 'vultus-core';
import { NumericInput } from '../NumericInput.js';
import { NumericSlider } from '../NumericSlider.js';
import { openTooltips } from './helpers/tooltips.js';

function Inside(opts: Partial<Omit<NumericFieldOptions, 'value' | 'onChange' | 'commit'>>) {
  const field = useNumericField({
    id: 'count', label: 'Count', min: 0, max: 100, initialValue: 10, ...opts,
  } as NumericFieldOptions);
  return <><NumericInput field={field} /><output>{field.value}</output></>;
}

function Committed({ fire, confirmation, initial = 10 }: {
  fire: (next: number) => Promise<void> | void;
  confirmation?: FieldCommit<number>['confirmation'];
  initial?: number;
}) {
  const [stored, setStored] = useState<number>(initial);
  const field = useNumericField({
    id: 'count', label: 'Count', min: 0, max: 100, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><NumericInput field={field} /><output>{field.value}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const input = () => screen.getByRole('spinbutton');
const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('NumericInput', () => {
  it('shows the value in the input and in data-value', () => {
    wrap(<Inside initialValue={42} />);
    expect(input()).toHaveValue('42');
    expect(document.querySelector('[data-field-id="count"]')).toHaveAttribute('data-value', '42');
  });

  it('typing keeps a draft: the input shows it, the stored value does not change', () => {
    wrap(<Inside initialValue={10} />);
    type('55');
    expect(input()).toHaveValue('55');
    expect(shown()).toBe('10');
  });

  it('blur requests the typed draft', async () => {
    wrap(<Inside initialValue={10} />);
    type('55');
    fireEvent.blur(input());
    await waitFor(() => expect(shown()).toBe('55'));
  });

  it('Enter requests the typed draft', async () => {
    wrap(<Inside initialValue={10} />);
    type('55');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shown()).toBe('55'));
  });

  it('an empty draft on blur returns to the field\'s value, requesting nothing', async () => {
    wrap(<Inside initialValue={10} />);
    type('');
    fireEvent.blur(input());
    await waitFor(() => expect(input()).toHaveValue('10'));
    expect(shown()).toBe('10');
  });

  it('an unparsable draft on blur returns to the field\'s value', async () => {
    wrap(<Inside initialValue={10} />);
    type('abc');
    fireEvent.blur(input());
    await waitFor(() => expect(input()).toHaveValue('10'));
    expect(shown()).toBe('10');
  });

  it('a stepper click requests at once', async () => {
    wrap(<Inside initialValue={10} step={5} />);
    fireEvent.mouseDown(screen.getByLabelText('Increase Value'));
    await waitFor(() => expect(shown()).toBe('15'));
  });

  it('pressing Enter twice before a slow commit lands requests once', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    type('55');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(fire).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(shown()).toBe('55'));
  });

  it('the draft follows the field\'s value when it changes from outside', () => {
    function Outside() {
      const [value, setValue] = useState(10);
      const field = useNumericField({ id: 'count', label: 'Count', min: 0, max: 100, value, onChange: setValue });
      return <><NumericInput field={field} /><button onClick={() => setValue(70)}>External set</button></>;
    }
    wrap(<Outside />);
    type('33');
    fireEvent.click(screen.getByText('External set'));
    expect(input()).toHaveValue('70');
  });

  it('commit: requests with the field\'s confirmation first', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={(next) => (next > 50 ? { kind: 'popconfirm', question: 'Raise it?' } : undefined)} />);
    type('80');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(await screen.findByText('Raise it?')).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    await waitFor(() => expect(fire).toHaveBeenCalledWith(80));
  });

  it('disabled: no change, shows the reason on hover', async () => {
    wrap(<Inside enabled={denyWithReason('Locked for this task')} />);
    expect(input()).toBeDisabled();
    fireEvent.mouseEnter(input().closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Locked for this task')).toBeInTheDocument());
  });

  it('the unit shows as the suffix', () => {
    wrap(<Inside unit="%" initialValue={20} />);
    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('integer: a fractional typed value is rounded on commit', async () => {
    wrap(<Inside integer initialValue={10} />);
    type('12.6');
    fireEvent.blur(input());
    await waitFor(() => expect(shown()).toBe('13'));
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });
});

/** A committed numeric field the app holds pending (its `pending` option) while "Settle" is toggled on. */
function Settling() {
  const [stored, setStored] = useState(10);
  const [pending, setPending] = useState(false);
  const field = useNumericField({
    id: 'count', label: 'Count', min: 0, max: 100, value: stored, pending,
    commit: { fire: (next) => { setStored(next); } },
  });
  return <><NumericInput field={field} /><output>{field.value}</output><button onClick={() => setPending((p) => !p)}>Settle</button></>;
}

/** antd's disabled text colour and background, as this theme renders them inline. */
function DisabledLookProbe() {
  const { token } = theme.useToken();
  return <span data-testid="probe" style={{ color: token.colorTextDisabled, background: token.colorBgContainerDisabled }} />;
}

describe('NumericInput while pending', () => {
  it('the app\'s own: read-only, not disabled, said unavailable, no steppers; typing, an arrow key and Enter request nothing', () => {
    wrap(<Inside pending initialValue={10} />);
    expect(input()).not.toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByLabelText('Increase Value')).toBeNull();
    type('55');
    expect(input()).toHaveAttribute('aria-valuenow', '10');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.blur(input());
    expect(input()).toHaveAttribute('aria-valuenow', '10');
    expect(input()).toHaveValue('10');
    expect(shown()).toBe('10');
  });

  it('keeps the look of a disabled input: the disabled text colour and background, the not-allowed cursor', () => {
    wrap(<><Inside pending /><DisabledLookProbe /></>);
    const probe = screen.getByTestId('probe').style;
    expect(probe.color).not.toBe('');
    const root = document.querySelector<HTMLElement>('.ant-input-number')!;
    expect(root.style.color).toBe(probe.color);
    expect(root.style.background).toBe(probe.background);
    expect(root.style.cursor).toBe('not-allowed');
    expect(input().style.color).toBe(probe.color);
    expect(input().style.cursor).toBe('not-allowed');
  });

  it('a draft typed before pending starts is kept while pending and after it, then requested as ever', async () => {
    wrap(<Settling />);
    type('55');
    fireEvent.click(screen.getByText('Settle'));
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveValue('55');
    fireEvent.click(screen.getByText('Settle'));
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).toHaveValue('55');
    expect(shown()).toBe('10');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shown()).toBe('55'));
  });

  it('an arrow key on an emptied draft while pending leaves it empty', () => {
    wrap(<Settling />);
    type('');
    fireEvent.click(screen.getByText('Settle'));
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(input()).toHaveValue('');
    expect(shown()).toBe('10');
  });

  it('its commit: read-only while it runs, typing changes nothing; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    type('55');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(fire).toHaveBeenCalledWith(55));
    expect(input()).not.toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    type('77');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input()).toHaveAttribute('aria-valuenow', '55');
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(shown()).toBe('55');
    expect(input()).toHaveValue('55');
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).not.toHaveAttribute('aria-disabled');
  });

  it('a failed commit: the input shows the stored value again', async () => {
    let fail!: () => void;
    const fire = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = () => reject(new Error('refused')); }));
    wrap(<Committed fire={fire} />);
    type('55');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(fire).toHaveBeenCalledWith(55));
    await act(async () => { fail(); });
    await waitFor(() => expect(input()).toHaveValue('10'));
    expect(shown()).toBe('10');
  });

  it('not enabled and pending: disabled as before, not read-only', () => {
    wrap(<Inside pending enabled={denyWithReason('Locked for this task')} />);
    expect(input()).toBeDisabled();
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).not.toHaveAttribute('aria-disabled');
  });
});

function SliderInside({ showValue, ...opts }: { showValue?: boolean } & Partial<Omit<NumericFieldOptions, 'value' | 'onChange' | 'commit'>>) {
  const field = useNumericField({
    id: 'volume', label: 'Volume', description: 'How loud notifications play.', min: 0, max: 10, initialValue: 5, ...opts,
  } as NumericFieldOptions);
  return <><NumericSlider field={field} showValue={showValue} /><output>{field.value}</output></>;
}

function SliderCommitted({ fire, confirmation }: {
  fire: (next: number) => Promise<void> | void;
  confirmation?: FieldCommit<number>['confirmation'];
}) {
  const [stored, setStored] = useState(5);
  const field = useNumericField({
    id: 'volume', label: 'Volume', min: 0, max: 10, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><NumericSlider field={field} /><output>{field.value}</output></>;
}

const handle = () => screen.getByRole('slider');
const press = (key: string, keyCode: number) => {
  fireEvent.keyDown(handle(), { key, keyCode });
  fireEvent.keyUp(handle(), { key, keyCode });
};

describe('NumericSlider', () => {
  it('throws without min and max', () => {
    const Bad = () => {
      const field = useNumericField({ id: 'n', label: 'N' });
      return <NumericSlider field={field} />;
    };
    expect(() => wrap(<Bad />)).toThrow("Field 'n': NumericSlider needs min and max");
  });

  it('shows the current value; an arrow key moves and requests once', async () => {
    wrap(<SliderInside />);
    expect(handle()).toHaveAttribute('aria-valuenow', '5');
    press('ArrowRight', 39);
    await waitFor(() => expect(shown()).toBe('6'));
  });

  it('the handle\'s tooltip shows field.format(value)', async () => {
    wrap(<SliderInside format={(n) => `${n}x`} />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-handle')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent('5x');
  });

  it('the track shows the field\'s own tooltip; the handle holds it back (its own would double up)', async () => {
    wrap(<SliderInside />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-rail')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent('How loud notifications play.');
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-handle')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).not.toHaveTextContent('How loud notifications play.');
  });

  it('showValue puts the formatted value before the slider', () => {
    wrap(<SliderInside showValue format={(n) => `${n} dB`} />);
    expect(screen.getByText('5 dB')).toBeInTheDocument();
  });

  it('commit: one request per move, with the field\'s confirmation first', async () => {
    const fire = vi.fn();
    wrap(<SliderCommitted fire={fire} confirmation={(next) => (next > 8 ? { kind: 'popconfirm', question: 'Go louder?' } : undefined)} />);
    press('ArrowRight', 39);
    await waitFor(() => expect(fire).toHaveBeenCalledWith(6));
  });

  it('while the confirmation is asked the handle stays on the requested value; Cancel returns it', async () => {
    wrap(<SliderCommitted fire={vi.fn()} confirmation={(next) => (next > 5 ? { kind: 'popconfirm', question: 'Go louder?' } : undefined)} />);
    press('ArrowRight', 39);
    expect(await screen.findByText('Go louder?')).toBeInTheDocument();
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
    expect(shown()).toBe('5');
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Cancel'))!);
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '5'));
    expect(shown()).toBe('5');
  });

  it('a move while a confirmation is asked is not taken: the handle stays on the asked value, which OK commits', async () => {
    const fire = vi.fn();
    wrap(<SliderCommitted fire={fire} confirmation={(next) => (next > 5 ? { kind: 'popconfirm', question: 'Go louder?' } : undefined)} />);
    press('ArrowRight', 39);
    expect(await screen.findByText('Go louder?')).toBeInTheDocument();
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
    press('ArrowRight', 39);
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '6'));
    await act(async () => { fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!); });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(6);
    await waitFor(() => expect(shown()).toBe('6'));
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
  });

  it('a committed move: the handle stays on the requested value while the commit runs (no jump back)', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<SliderCommitted fire={fire} />);
    press('ArrowRight', 39);
    await waitFor(() => expect(fire).toHaveBeenCalledWith(6));
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
    expect(shown()).toBe('5');
    await act(async () => { finish(); });
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
    expect(shown()).toBe('6');
  });

  it('a failed commit: the handle returns to the stored value', async () => {
    let fail!: () => void;
    const fire = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = () => reject(new Error('refused')); }));
    wrap(<SliderCommitted fire={fire} />);
    press('ArrowRight', 39);
    await waitFor(() => expect(fire).toHaveBeenCalledWith(6));
    await act(async () => { fail(); });
    await waitFor(() => expect(handle()).toHaveAttribute('aria-valuenow', '5'));
    expect(shown()).toBe('5');
  });

  it('disabled: the reason on hover, no change', async () => {
    wrap(<SliderInside enabled={denyWithReason('Muted for this call')} />);
    press('ArrowRight', 39);
    expect(shown()).toBe('5');
    fireEvent.mouseEnter(document.querySelector('[data-field-id="volume"]')!.closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Muted for this call')).toBeInTheDocument());
  });

  it('renders nothing when hidden', () => {
    wrap(<SliderInside hidden />);
    expect(screen.queryByRole('slider')).toBeNull();
  });
});

describe('NumericSlider while pending', () => {
  it('the app\'s own: locked, not disabled: the handle keeps its tab stop, is said unavailable; an arrow key requests nothing, the handle stays', () => {
    wrap(<SliderInside pending />);
    expect(handle()).toHaveAttribute('tabindex', '0');
    expect(handle()).not.toHaveClass('ant-slider-handle-disabled');
    expect(handle()).toHaveAttribute('aria-disabled', 'true');
    expect(document.querySelector('.ant-slider')).toHaveClass('ant-slider-disabled');
    fireEvent.keyDown(handle(), { key: 'ArrowRight', keyCode: 39 });
    expect(handle()).toHaveAttribute('aria-valuenow', '5');
    fireEvent.keyUp(handle(), { key: 'ArrowRight', keyCode: 39 });
    expect(handle()).toHaveAttribute('aria-valuenow', '5');
    expect(shown()).toBe('5');
  });

  it('its commit: the handle stays on the requested value, a further move requests nothing; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<SliderCommitted fire={fire} />);
    press('ArrowRight', 39);
    await waitFor(() => expect(fire).toHaveBeenCalledWith(6));
    await waitFor(() => expect(handle()).toHaveAttribute('aria-disabled', 'true'));
    expect(handle()).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(handle(), { key: 'ArrowRight', keyCode: 39 });
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
    fireEvent.keyUp(handle(), { key: 'ArrowRight', keyCode: 39 });
    expect(handle()).toHaveAttribute('aria-valuenow', '6');
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(shown()).toBe('6');
    expect(handle()).toHaveAttribute('aria-disabled', 'false');
    expect(document.querySelector('.ant-slider')).not.toHaveClass('ant-slider-disabled');
  });

  it('not enabled and pending: disabled as before', () => {
    wrap(<SliderInside pending enabled={denyWithReason('Muted for this call')} />);
    expect(handle()).not.toHaveAttribute('tabindex');
    expect(handle()).toHaveClass('ant-slider-handle-disabled');
    expect(handle()).toHaveAttribute('aria-disabled', 'true');
  });
});
