import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState } from 'react';
import { denyWithReason, useTextField, type FieldCommit, type TextFieldOptions } from 'vultus-core';
import { TextInput } from '../TextInput.js';
import { SearchInput } from '../SearchInput.js';

function Inside(opts: Partial<Omit<TextFieldOptions, 'value' | 'onChange' | 'commit'>>) {
  const field = useTextField({ id: 'name', label: 'Name', ...opts } as TextFieldOptions);
  return <><TextInput field={field} /><output>{field.value}</output></>;
}

/** The value lives outside, changed locally (onChange): no commit round trip, requests on every change. */
function Outside({ onChangeExtra }: { onChangeExtra?: (next: string) => void } = {}) {
  const [value, setValue] = useState('');
  const field = useTextField({
    id: 'name', label: 'Name', value, onChange: (next) => { setValue(next); onChangeExtra?.(next); },
  });
  return <><TextInput field={field} /><output>{field.value}</output></>;
}

function Committed({ fire, confirmation, initial = '' }: {
  fire: (next: string) => Promise<void> | void;
  confirmation?: FieldCommit<string>['confirmation'];
  initial?: string;
}) {
  const [stored, setStored] = useState<string>(initial);
  const field = useTextField({
    id: 'name', label: 'Name', value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><TextInput field={field} /><output>{field.value}</output></>;
}

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);
const shown = () => screen.getByRole('status').textContent;
const input = () => screen.getByRole('textbox');
const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('TextInput', () => {
  it('shows the value in the input and in data-value; aria-label is the label', () => {
    wrap(<Inside initialValue="Ada" />);
    expect(input()).toHaveValue('Ada');
    expect(document.querySelector('[data-field-id="name"]')).toHaveAttribute('data-value', 'Ada');
    expect(input()).toHaveAttribute('aria-label', 'Name');
  });

  it('renders a textarea when control is \'textarea\'', () => {
    wrap(<Inside control="textarea" initialValue="bio" />);
    expect(input().tagName).toBe('TEXTAREA');
  });

  it('shows the placeholder', () => {
    wrap(<Inside placeholder="Your name" />);
    expect(input()).toHaveAttribute('placeholder', 'Your name');
  });

  it('inside the field: each keystroke requests at once', () => {
    wrap(<Inside initialValue="" />);
    type('A');
    expect(shown()).toBe('A');
    type('Ad');
    expect(shown()).toBe('Ad');
  });

  it('value outside, changed locally: each keystroke requests at once', () => {
    const seen: string[] = [];
    wrap(<Outside onChangeExtra={(next) => seen.push(next)} />);
    type('A');
    type('Ad');
    expect(seen).toEqual(['A', 'Ad']);
    expect(shown()).toBe('Ad');
  });

  it('commit: typing keeps a draft; the stored value does not change until it commits', () => {
    wrap(<Committed fire={vi.fn()} />);
    type('Ada');
    expect(input()).toHaveValue('Ada');
    expect(shown()).toBe('');
  });

  it('commit: blur requests the typed draft', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} />);
    type('Ada');
    fireEvent.blur(input());
    await waitFor(() => expect(shown()).toBe('Ada'));
    expect(fire).toHaveBeenCalledWith('Ada');
  });

  it('commit: Enter requests the typed draft', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} />);
    type('Ada');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shown()).toBe('Ada'));
    expect(fire).toHaveBeenCalledWith('Ada');
  });

  it('commit, textarea: Enter is a newline, not a request; blur still requests', async () => {
    const fire = vi.fn();
    function CommittedArea() {
      const [stored, setStored] = useState('');
      const field = useTextField({
        id: 'bio', label: 'Bio', control: 'textarea', value: stored,
        commit: { fire: async (next) => { await fire(next); setStored(next); } },
      });
      return <><TextInput field={field} /><output>{field.value}</output></>;
    }
    wrap(<CommittedArea />);
    type('Line one');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(fire).not.toHaveBeenCalled();
    expect(shown()).toBe('');
    fireEvent.blur(input());
    await waitFor(() => expect(shown()).toBe('Line one'));
  });

  it('the draft follows the field\'s value when it changes from outside', () => {
    function OutsideCommitted() {
      const [stored, setStored] = useState('Ada');
      const field = useTextField({
        id: 'name', label: 'Name', value: stored, commit: { fire: (next) => { setStored(next); } },
      });
      return <><TextInput field={field} /><button onClick={() => setStored('Grace')}>External set</button></>;
    }
    wrap(<OutsideCommitted />);
    type('Marie');
    fireEvent.click(screen.getByText('External set'));
    expect(input()).toHaveValue('Grace');
  });

  it('commit: requests with the field\'s confirmation first', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} confirmation={(next) => (next.length > 3 ? { kind: 'popconfirm', question: 'Use this name?' } : undefined)} />);
    type('Adaline');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(await screen.findByText('Use this name?')).toBeInTheDocument();
    expect(fire).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('OK'))!);
    await waitFor(() => expect(fire).toHaveBeenCalledWith('Adaline'));
  });

  it('disabled: no change, shows the reason on hover', async () => {
    wrap(<Inside enabled={denyWithReason('Locked for this task')} />);
    expect(input()).toBeDisabled();
    fireEvent.mouseEnter(input().closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Locked for this task')).toBeInTheDocument());
  });

  it('renders nothing when hidden', () => {
    wrap(<Inside hidden />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

function SearchInside(opts: Partial<Omit<TextFieldOptions, 'value' | 'onChange' | 'commit'>> & { onEnter?: () => void }) {
  const { onEnter, ...rest } = opts;
  const field = useTextField({ id: 'query', label: 'Search', ...rest } as TextFieldOptions);
  return <><SearchInput field={field} onEnter={onEnter} /><output>{field.value}</output></>;
}

function SearchCommitted({ fire, confirmation, initial = '', onEnter }: {
  fire: (next: string) => Promise<void> | void;
  confirmation?: FieldCommit<string>['confirmation'];
  initial?: string;
  onEnter?: () => void;
}) {
  const [stored, setStored] = useState<string>(initial);
  const field = useTextField({
    id: 'query', label: 'Search', value: stored,
    commit: { confirmation, fire: async (next) => { await fire(next); setStored(next); } },
  });
  return <><SearchInput field={field} onEnter={onEnter} /><output>{field.value}</output></>;
}

describe('SearchInput', () => {
  it('shows the value, the search icon and data-value', () => {
    wrap(<SearchInside initialValue="cats" />);
    expect(input()).toHaveValue('cats');
    expect(document.querySelector('[data-field-id="query"]')).toHaveAttribute('data-value', 'cats');
    expect(document.querySelector('.anticon-search')).toBeInTheDocument();
  });

  it('inside the field: each keystroke requests at once', () => {
    wrap(<SearchInside initialValue="" />);
    type('cat');
    expect(shown()).toBe('cat');
  });

  it('commit: typing keeps a draft, requests on blur', async () => {
    const fire = vi.fn();
    wrap(<SearchCommitted fire={fire} />);
    type('cat');
    expect(shown()).toBe('');
    fireEvent.blur(input());
    await waitFor(() => expect(shown()).toBe('cat'));
  });

  it('commit: Enter requests the typed draft, then calls onEnter', async () => {
    const fire = vi.fn();
    const onEnter = vi.fn();
    wrap(<SearchCommitted fire={fire} onEnter={onEnter} />);
    type('cat');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shown()).toBe('cat'));
    expect(onEnter).toHaveBeenCalled();
  });

  it('inside the field: Enter calls onEnter (the value was already requested live)', () => {
    const onEnter = vi.fn();
    wrap(<SearchInside initialValue="" onEnter={onEnter} />);
    type('cat');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalled();
    expect(shown()).toBe('cat');
  });

  it('the clear button requests \'\'', async () => {
    wrap(<SearchInside initialValue="cats" />);
    const clearBtn = document.querySelector('.ant-input-clear-icon') as HTMLElement;
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
    await waitFor(() => expect(shown()).toBe(''));
  });

  it('Escape clears, requesting \'\'', async () => {
    wrap(<SearchInside initialValue="cats" />);
    fireEvent.keyDown(input(), { key: 'Escape' });
    await waitFor(() => expect(shown()).toBe(''));
  });

  it('commit: Escape clears the draft and requests \'\'', async () => {
    const fire = vi.fn();
    wrap(<SearchCommitted fire={fire} initial="cats" />);
    type('catsanddogs');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input()).toHaveValue('');
    await waitFor(() => expect(fire).toHaveBeenCalledWith(''));
  });

  it('disabled: no change, shows the reason on hover', async () => {
    wrap(<SearchInside enabled={denyWithReason('Search is off')} />);
    expect(input()).toBeDisabled();
    fireEvent.mouseEnter(input().closest('span[style]')!);
    await waitFor(() => expect(screen.getByText('Search is off')).toBeInTheDocument());
  });

  it('renders nothing when hidden', () => {
    wrap(<SearchInside hidden />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
