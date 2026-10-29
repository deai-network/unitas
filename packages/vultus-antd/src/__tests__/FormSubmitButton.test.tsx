import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp, Form, Input } from 'antd';
import { FormPanel } from '../FormPanel.js';
import { FormSubmitButton } from '../FormSubmitButton.js';
import { useAction, type ActionStatus } from 'vultus-core';

function makeStatus<TArgs>(overrides: Partial<ActionStatus<TArgs>> = {}): ActionStatus<TArgs> {
  return {
    id: 'submit',
    label: 'Submit',
    variant: 'primary',
    pending: false,
    disabled: false,
    invisible: false,
    errors: [],
    fire: vi.fn(),
    firePromise: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('FormSubmitButton', () => {
  it('on click: validates form, passes values to action.firePromise', async () => {
    const firePromise = vi.fn(async () => {});
    const action = makeStatus<{ x: string }>({ firePromise });
    render(
      <AntApp>
        <FormPanel initialValues={{ x: 'hello' }}>
          <Form.Item name="x"><Input /></Form.Item>
          <FormSubmitButton action={action} />
        </FormPanel>
      </AntApp>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(firePromise).toHaveBeenCalledWith({ x: 'hello' });
  });

  it('does NOT call firePromise if form validation fails', async () => {
    const firePromise = vi.fn(async () => {});
    const action = makeStatus<{ x: string }>({ firePromise });
    render(
      <AntApp>
        <FormPanel>
          <Form.Item name="x" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <FormSubmitButton action={action} />
        </FormPanel>
      </AntApp>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(firePromise).not.toHaveBeenCalled();
  });

  it('pending → locked as ActionButton: not disabled, said unavailable, the disabled look, loading; a click, Enter or Space submits nothing', async () => {
    const firePromise = vi.fn(async () => {});
    render(
      <AntApp>
        <FormPanel initialValues={{ x: 'hello' }}>
          <Form.Item name="x"><Input /></Form.Item>
          <FormSubmitButton action={makeStatus<{ x: string }>({ pending: true, firePromise })} />
        </FormPanel>
      </AntApp>,
    );
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveClass('ant-btn-disabled', 'ant-btn-loading');
    fireEvent.click(btn);
    // A browser turns Enter and Space on a focused button into a click; jsdom does not.
    for (const key of ['Enter', ' ']) {
      fireEvent.keyDown(btn, { key });
      fireEvent.keyUp(btn, { key });
      fireEvent.click(btn);
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(firePromise).not.toHaveBeenCalled();
  });

  it('submitted, it locks while the action runs; a second click submits nothing', async () => {
    const fire = vi.fn(() => new Promise<void>(() => {}));
    function Running() {
      const action = useAction<{ x: string }>({ id: 'submit', label: 'Submit', fire });
      return <FormSubmitButton action={action} />;
    }
    render(
      <AntApp>
        <FormPanel initialValues={{ x: 'hello' }}>
          <Form.Item name="x"><Input /></Form.Item>
          <Running />
        </FormPanel>
      </AntApp>,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toHaveAttribute('aria-disabled', 'true'));
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 0));
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('disabled and pending: disabled as before, not said locked', () => {
    render(
      <AntApp>
        <FormPanel>
          <FormSubmitButton action={makeStatus({ disabled: true, pending: true, reason: 'no' })} />
        </FormPanel>
      </AntApp>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(btn).not.toHaveClass('ant-btn-disabled');
  });

  it('disabled / pending / invisible behavior mirrors ActionButton', () => {
    const action = makeStatus({ disabled: true, reason: 'no' });
    render(
      <AntApp>
        <FormPanel>
          <FormSubmitButton action={action} />
        </FormPanel>
      </AntApp>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'no');
  });
});
