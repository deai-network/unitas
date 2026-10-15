import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import { denyWithReason, useRangeField, type FieldCommit, type NumberRange, type RangeFieldOptions } from 'vultus-core';
import { RangeSlider } from '../RangeSlider.js';
import { openTooltips } from './helpers/tooltips.js';

function Inside({ showValue, ...opts }: { showValue?: boolean } & Partial<Omit<RangeFieldOptions, 'value' | 'onChange' | 'commit'>>) {
  const field = useRangeField({
    id: 'years', label: 'School years', description: 'Years shown on the chart.',
    min: 2010, max: 2025, initialValue: [2012, 2020], ...opts,
  } as RangeFieldOptions);
  return <><RangeSlider field={field} showValue={showValue} /><output>{field.value.join(',')}</output></>;
}

function Committed({ fire, confirmation }: {
  fire: (next: NumberRange) => Promise<void> | void;
  confirmation?: FieldCommit<NumberRange>['confirmation'];
}) {
  const [stored, setStored] = useState<NumberRange>([2012, 2020]);
  const field = useRangeField({
    id: 'years', label: 'School years', min: 2010, max: 2025, value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><RangeSlider field={field} /><output>{field.value.join(',')}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const handles = () => screen.getAllByRole('slider');
const press = (handle: HTMLElement, key: string, keyCode: number) => {
  fireEvent.keyDown(handle, { key, keyCode });
  fireEvent.keyUp(handle, { key, keyCode });
};

describe('RangeSlider', () => {
  it('shows the current value: two handles at the ends', () => {
    wrap(<Inside />);
    const [from, to] = handles();
    expect(from).toHaveAttribute('aria-valuenow', '2012');
    expect(to).toHaveAttribute('aria-valuenow', '2020');
    expect(from).toHaveAttribute('aria-label', 'School years');
  });

  it('a completed move (keyup) requests both ends', async () => {
    wrap(<Inside />);
    const [from] = handles();
    press(from, 'ArrowRight', 39);
    await waitFor(() => expect(shown()).toBe('2013,2020'));
  });

  it('a drag step (keydown alone, before keyup) does not request', () => {
    wrap(<Inside />);
    const [from] = handles();
    fireEvent.keyDown(from, { key: 'ArrowRight', keyCode: 39 });
    expect(from).toHaveAttribute('aria-valuenow', '2013');
    expect(shown()).toBe('2012,2020');
  });

  it('each handle\'s tooltip shows field.format(n)', async () => {
    wrap(<Inside format={(n) => `${n}/${String(n + 1).slice(2)}`} />);
    const [from] = handles();
    fireEvent.mouseEnter(from);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent('2012/13');
  });

  it('the track shows the field\'s own tooltip; a handle holds it back (its own would double up)', async () => {
    wrap(<Inside />);
    fireEvent.mouseEnter(document.querySelector<HTMLElement>('.ant-slider-rail')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).toHaveTextContent('Years shown on the chart.');
    fireEvent.mouseEnter(handles()[0]);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0]).not.toHaveTextContent('Years shown on the chart.');
  });

  it('showValue puts the formatted range before the slider', () => {
    wrap(<Inside showValue format={(n) => `${n}/${String(n + 1).slice(2)}`} />);
    expect(screen.getByText('2012/13–2020/21')).toBeInTheDocument();
  });

  it('data-value is the two ends joined by \'..\'', () => {
    wrap(<Inside />);
    expect(document.querySelector('[data-field-id="years"]')).toHaveAttribute('data-value', '2012..2020');
  });

  it('commit: one request per move, with the field\'s confirmation first', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={(next) => (next[1] > 2023 ? { kind: 'popconfirm', question: 'Extend further?' } : undefined)} />);
    const [from] = handles();
    press(from, 'ArrowRight', 39);
    await waitFor(() => expect(fire).toHaveBeenCalledWith([2013, 2020]));
  });

  it('commit above the confirmation\'s threshold: asked first, nothing fired until OK', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={(next) => (next[1] > 2020 ? { kind: 'popconfirm', question: 'Extend further?' } : undefined)} />);
    const [, to] = handles();
    press(to, 'ArrowRight', 39);
    expect(await screen.findByText('Extend further?')).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    await waitFor(() => expect(fire).toHaveBeenCalledWith([2012, 2021]));
  });

  it('disabled: the reason on hover, no change', async () => {
    wrap(<Inside enabled={denyWithReason('Locked for this report')} />);
    const [from] = handles();
    press(from, 'ArrowRight', 39);
    expect(shown()).toBe('2012,2020');
    fireEvent.mouseEnter(document.querySelector('[data-field-id="years"]')!.closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Locked for this report')).toBeInTheDocument());
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
  });
});
