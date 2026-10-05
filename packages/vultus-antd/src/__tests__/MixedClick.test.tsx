import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useMixedBoolField, type MixedBool } from 'vultus-core';
import { BoolCheckbox } from '../BoolCheckbox.js';
import { BoolSwitch } from '../BoolSwitch.js';
import { DOUBLE_CLICK_MS } from '../useClickOrDoubleClick.js';

function Aggregate({ value, fire, confirmOff, kind }: {
  value: MixedBool; fire: (next: boolean) => void; confirmOff?: boolean; kind: 'switch' | 'checkbox';
}) {
  const field = useMixedBoolField({
    id: 'autopilot', label: 'Autopilot', value,
    commit: {
      fire,
      confirmation: (next) => (confirmOff && !next ? { kind: 'popconfirm', question: 'Turn autopilot off for all?' } : undefined),
    },
  });
  return kind === 'switch' ? <BoolSwitch field={field} /> : <BoolCheckbox field={field} />;
}

const control = (kind: 'switch' | 'checkbox') => screen.getByRole(kind);

afterEach(() => vi.useRealTimers());

describe.each(['switch', 'checkbox'] as const)('click and double click from mixed (%s)', (kind) => {
  it('a click requests on, only after the double-click window', async () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    render(<AntApp><Aggregate kind={kind} value="mixed" fire={fire} /></AntApp>);
    fireEvent.click(control(kind));
    expect(fire).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(DOUBLE_CLICK_MS + 10); });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(true, expect.anything());
  });

  it('a double click requests off, and never on', async () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    render(<AntApp><Aggregate kind={kind} value="mixed" fire={fire} /></AntApp>);
    fireEvent.click(control(kind));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    fireEvent.click(control(kind));
    await act(async () => { await vi.advanceTimersByTimeAsync(DOUBLE_CLICK_MS + 10); });
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(false, expect.anything());
  });

  it('a double click asks the confirmation for off', async () => {
    const fire = vi.fn();
    render(<AntApp><Aggregate kind={kind} value="mixed" fire={fire} confirmOff /></AntApp>);
    fireEvent.click(control(kind));
    fireEvent.click(control(kind));
    expect(await screen.findByText('Turn autopilot off for all?')).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    expect(fire).toHaveBeenCalledWith(false, expect.anything());
  });

  it('from on or off a click acts at once', () => {
    const fire = vi.fn();
    const { unmount } = render(<AntApp><Aggregate kind={kind} value={true} fire={fire} /></AntApp>);
    fireEvent.click(control(kind));
    expect(fire).toHaveBeenCalledWith(false, expect.anything());
    unmount();
    fire.mockClear();
    render(<AntApp><Aggregate kind={kind} value={false} fire={fire} /></AntApp>);
    fireEvent.click(control(kind));
    expect(fire).toHaveBeenCalledWith(true, expect.anything());
  });
});
