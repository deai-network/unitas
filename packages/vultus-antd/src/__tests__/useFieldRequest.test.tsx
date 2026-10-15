import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp, Button } from 'antd';
import type { ConfirmLabels } from '../useConfirm.js';
import { useFieldRequest, type RequestableField } from '../useFieldRequest.js';

/** A minimal RequestableField<number> for direct tests of the hook, apart from any widget. */
function makeField(overrides: Partial<RequestableField<number>> = {}): RequestableField<number> {
  return {
    enabled: true,
    pending: false,
    value: 10,
    label: 'Count',
    setValue: vi.fn(),
    confirmationFor: vi.fn(() => undefined),
    ...overrides,
  };
}

function Harness({ field, values, labelsFor, onTaken }: {
  field: RequestableField<number>;
  values: number[];
  labelsFor?: (next: number) => ConfirmLabels;
  /** Gets what each request answered: whether it was taken. */
  onTaken?: (taken: boolean) => void;
}) {
  const { request, wrap } = useFieldRequest(field, { equal: (a, b) => a === b, labelsFor });
  return wrap(
    <>
      {values.map((v) => (
        <Button key={v} onClick={() => { const taken = request(v); onTaken?.(taken); }}>{`Request ${v}`}</Button>
      ))}
    </>,
  );
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const requestButton = (v: number) => screen.getByText(`Request ${v}`);

describe('useFieldRequest', () => {
  it('refuses while disabled: setValue is never called', () => {
    const field = makeField({ enabled: false });
    wrap(<Harness field={field} values={[99]} />);
    fireEvent.click(requestButton(99));
    expect(field.setValue).not.toHaveBeenCalled();
    expect(field.confirmationFor).not.toHaveBeenCalled();
  });

  it('refuses while pending: setValue is never called', () => {
    const field = makeField({ pending: true });
    wrap(<Harness field={field} values={[99]} />);
    fireEvent.click(requestButton(99));
    expect(field.setValue).not.toHaveBeenCalled();
  });

  it('a request equal to the current value is a no-op: no confirmation is asked, setValue is never called', () => {
    const field = makeField({ value: 10 });
    wrap(<Harness field={field} values={[10]} />);
    fireEvent.click(requestButton(10));
    expect(field.confirmationFor).not.toHaveBeenCalled();
    expect(field.setValue).not.toHaveBeenCalled();
  });

  it('asks the field\'s confirmation first, then requests the confirmed value', async () => {
    const field = makeField({
      confirmationFor: (next) => (next > 50 ? { kind: 'popconfirm', question: 'Raise it?' } : undefined),
    });
    wrap(<Harness field={field} values={[99]} />);
    fireEvent.click(requestButton(99));
    expect(await screen.findByText('Raise it?')).toBeInTheDocument();
    expect(field.setValue).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    await waitFor(() => expect(field.setValue).toHaveBeenCalledWith(99));
  });

  it('requests at once without a confirmation', () => {
    const field = makeField();
    wrap(<Harness field={field} values={[99]} />);
    fireEvent.click(requestButton(99));
    expect(field.setValue).toHaveBeenCalledWith(99);
  });

  it('while a confirmation from an earlier request is still open, a second (different) request is refused', async () => {
    const field = makeField({
      confirmationFor: (next) => (next === 99 ? { kind: 'popconfirm', question: 'Raise it?' } : undefined),
    });
    wrap(<Harness field={field} values={[99, 50]} />);
    fireEvent.click(requestButton(99));
    expect(await screen.findByText('Raise it?')).toBeInTheDocument();
    fireEvent.click(requestButton(50));
    expect(field.setValue).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    await waitFor(() => expect(field.setValue).toHaveBeenCalledWith(99));
    expect(field.setValue).not.toHaveBeenCalledWith(50);
  });

  it('request answers whether it took the request: not the current value, nor one while a confirmation is open', async () => {
    const taken: boolean[] = [];
    const field = makeField({
      confirmationFor: (next) => (next === 99 ? { kind: 'popconfirm', question: 'Raise it?' } : undefined),
    });
    wrap(<Harness field={field} values={[10, 99, 50]} onTaken={(t) => taken.push(t)} />);
    fireEvent.click(requestButton(10));
    fireEvent.click(requestButton(99));
    expect(await screen.findByText('Raise it?')).toBeInTheDocument();
    fireEvent.click(requestButton(50));
    expect(taken).toEqual([false, true, false]);
  });

  it("labelsFor labels the OK for the requested value: a cascade modal's, on the first request", async () => {
    const field = makeField({ confirmationFor: () => ({ kind: 'cascade-modal', title: 'Change it?', content: 'Sure?' }) });
    wrap(<Harness field={field} values={[99]} labelsFor={(next) => ({ okText: `Set ${next}`, danger: next > 50 })} />);
    fireEvent.click(requestButton(99));
    const ok = await screen.findByRole('button', { name: 'Set 99' });
    expect(ok).toHaveClass('ant-btn-dangerous');
    fireEvent.click(ok);
    await waitFor(() => expect(field.setValue).toHaveBeenCalledWith(99));
  });

  it("without labelsFor a cascade modal's OK is the field's label", async () => {
    const field = makeField({ confirmationFor: () => ({ kind: 'cascade-modal', title: 'Change it?', content: 'Sure?' }) });
    wrap(<Harness field={field} values={[99]} />);
    fireEvent.click(requestButton(99));
    expect(await screen.findByRole('button', { name: 'Count' })).not.toHaveClass('ant-btn-dangerous');
  });
});
