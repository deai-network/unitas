import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { ConfirmTypingModal } from '../ConfirmTypingModal.js';

describe('ConfirmTypingModal', () => {
  it('OK disabled until typed string matches entityName', () => {
    render(
      <AntApp>
        <ConfirmTypingModal
          open
          title="Delete?"
          entityName="myproj"
          description="permanent"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </AntApp>,
    );
    const okBtn = screen.getByRole('button', { name: 'Delete' });
    expect(okBtn).toBeDisabled();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'myproj' } });
    expect(okBtn).not.toBeDisabled();
  });

  it('Cancel triggers onCancel', () => {
    const onCancel = vi.fn();
    render(
      <AntApp>
        <ConfirmTypingModal
          open
          title="X"
          entityName="x"
          description="x"
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />
      </AntApp>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Confirm triggers onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <AntApp>
        <ConfirmTypingModal
          open
          title="X"
          entityName="x"
          description="x"
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      </AntApp>,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('Enter in the input confirms when the typed text matches', () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'myproj' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Enter with a non-matching text does nothing', () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    fireEvent.keyUp(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    fireEvent.change(input, { target: { value: 'mypro' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('OK button shows okText', () => {
    renderModal({ okText: 'Burn all' });
    expect(screen.getByRole('button', { name: 'Burn all' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('OK is danger by default; danger={false} gives a plain OK', () => {
    const { unmount } = renderModal({});
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('ant-btn-dangerous');
    unmount();
    renderModal({ okText: 'Archive', danger: false });
    expect(screen.getByRole('button', { name: 'Archive' })).not.toHaveClass('ant-btn-dangerous');
  });

  it('default prompt when none is given: Type <phrase> to confirm:', () => {
    renderModal({});
    const phrase = screen.getByText('myproj', { selector: 'code' });
    expect(phrase.parentElement).toHaveTextContent(/^Type myproj to confirm:$/);
  });

  it('custom prompt: {phrase} is replaced by the highlighted phrase', () => {
    renderModal({ prompt: 'Zum Bestätigen {phrase} eingeben:' });
    const phrase = screen.getByText('myproj', { selector: 'code' });
    expect(phrase.parentElement).toHaveTextContent(/^Zum Bestätigen myproj eingeben:$/);
    expect(screen.queryByText(/Type/)).toBeNull();
  });

  it('custom prompt without {phrase}: the highlighted phrase follows it', () => {
    renderModal({ prompt: 'Gépeld be:' });
    const phrase = screen.getByText('myproj', { selector: 'code' });
    expect(phrase.parentElement).toHaveTextContent(/^Gépeld be: myproj$/);
  });
});

function renderModal(props: Partial<React.ComponentProps<typeof ConfirmTypingModal>>) {
  return render(
    <AntApp>
      <ConfirmTypingModal
        open
        title="Delete?"
        entityName="myproj"
        description="permanent"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        {...props}
      />
    </AntApp>,
  );
}
