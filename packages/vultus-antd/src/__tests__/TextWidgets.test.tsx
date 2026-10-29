import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp, theme } from 'antd';
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

  it('commit: after Enter the input keeps focus while pending (locked: read-only, not disabled), and antd prints no dynamic-suffix warning', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    wrap(<Committed fire={fire} />);
    input().focus();
    type('Ada');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(input()).toHaveAttribute('readonly'));
    expect(input()).not.toBeDisabled();
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(input());
    type('Grace');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input()).toHaveValue('Ada');
    expect(fire).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await waitFor(() => expect(shown()).toBe('Ada'));
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).not.toHaveAttribute('aria-disabled');
    const focusWarnings = errorSpy.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('lose focus')));
    expect(focusWarnings).toHaveLength(0);
    errorSpy.mockRestore();
  });
});

/** A committed text field the app holds pending (its `pending` option) while "Settle" is toggled on. */
function Settling() {
  const [stored, setStored] = useState('');
  const [pending, setPending] = useState(false);
  const field = useTextField({
    id: 'name', label: 'Name', value: stored, pending, commit: { fire: (next) => { setStored(next); } },
  });
  return <><TextInput field={field} /><output>{field.value}</output><button onClick={() => setPending((p) => !p)}>Settle</button></>;
}

/** antd's disabled text colour and background, as this theme renders them inline. */
function DisabledLookProbe() {
  const { token } = theme.useToken();
  return <span data-testid="probe" style={{ color: token.colorTextDisabled, background: token.colorBgContainerDisabled }} />;
}

describe('TextInput while pending', () => {
  it('the app\'s own: read-only, not disabled, said unavailable; typing changes nothing', () => {
    wrap(<Inside pending initialValue="Ada" />);
    expect(input()).not.toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    type('Grace');
    expect(input()).toHaveValue('Ada');
    expect(shown()).toBe('Ada');
  });

  it('a textarea likewise', () => {
    wrap(<Inside pending control="textarea" initialValue="bio" />);
    expect(input()).not.toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    type('memoir');
    expect(input()).toHaveValue('bio');
    expect(shown()).toBe('bio');
  });

  it('keeps the look of a disabled input: the disabled text colour and background, the not-allowed cursor', () => {
    wrap(<><Inside pending /><DisabledLookProbe /></>);
    const probe = screen.getByTestId('probe').style;
    expect(probe.color).not.toBe('');
    const root = document.querySelector<HTMLElement>('.ant-input-affix-wrapper')!;
    expect(root.style.color).toBe(probe.color);
    expect(root.style.background).toBe(probe.background);
    expect(root.style.cursor).toBe('not-allowed');
    expect(input().style.color).toBe(probe.color);
    expect(input().style.cursor).toBe('not-allowed');
  });

  it('a textarea keeps that look too', () => {
    wrap(<><Inside pending control="textarea" /><DisabledLookProbe /></>);
    const probe = screen.getByTestId('probe').style;
    expect(input().style.color).toBe(probe.color);
    expect(input().style.background).toBe(probe.background);
    expect(input().style.cursor).toBe('not-allowed');
  });

  it('a draft typed before pending starts is kept while pending and after it, then requested as ever', async () => {
    wrap(<Settling />);
    type('Ada');
    fireEvent.click(screen.getByText('Settle'));
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveValue('Ada');
    type('Grace');
    expect(input()).toHaveValue('Ada');
    fireEvent.click(screen.getByText('Settle'));
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).toHaveValue('Ada');
    expect(shown()).toBe('');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(shown()).toBe('Ada'));
  });

  it('a failed commit: the input shows the stored value again', async () => {
    let fail!: () => void;
    const fire = vi.fn(() => new Promise<void>((_resolve, reject) => { fail = () => reject(new Error('refused')); }));
    wrap(<Committed fire={fire} initial="Ada" />);
    type('Grace');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(fire).toHaveBeenCalledWith('Grace'));
    expect(input()).toHaveValue('Grace');
    await act(async () => { fail(); });
    await waitFor(() => expect(input()).toHaveValue('Ada'));
    expect(shown()).toBe('Ada');
  });

  it('a cancelled confirmation: the input shows the stored value again', async () => {
    const fire = vi.fn();
    wrap(<Committed fire={fire} initial="Ada" confirmation={(next) => (next.length > 3 ? { kind: 'popconfirm', question: 'Use this name?' } : undefined)} />);
    type('Adaline');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(await screen.findByText('Use this name?')).toBeInTheDocument();
    expect(input()).toHaveValue('Adaline');
    fireEvent.click(screen.getAllByRole('button').find((b) => b.textContent?.includes('Cancel'))!);
    await waitFor(() => expect(input()).toHaveValue('Ada'));
    expect(fire).not.toHaveBeenCalled();
    expect(shown()).toBe('Ada');
  });

  it('not enabled and pending: disabled as before, not read-only', () => {
    wrap(<Inside pending enabled={denyWithReason('Locked for this task')} />);
    expect(input()).toBeDisabled();
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).not.toHaveAttribute('aria-disabled');
  });
});

function SearchInside(opts: Partial<Omit<TextFieldOptions, 'value' | 'onChange' | 'commit'>> & { onEnter?: (typed: string) => void }) {
  const { onEnter, ...rest } = opts;
  const field = useTextField({ id: 'query', label: 'Search', ...rest } as TextFieldOptions);
  return <><SearchInput field={field} onEnter={onEnter} /><output>{field.value}</output></>;
}

function SearchCommitted({ fire, confirmation, initial = '', onEnter }: {
  fire: (next: string) => Promise<void> | void;
  confirmation?: FieldCommit<string>['confirmation'];
  initial?: string;
  onEnter?: (typed: string) => void;
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

  it('commit: Enter requests the typed draft, then calls onEnter with it (the value shows it only once committed)', async () => {
    const fire = vi.fn();
    const onEnter = vi.fn();
    wrap(<SearchCommitted fire={fire} onEnter={onEnter} />);
    type('cat');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledWith('cat');
    await waitFor(() => expect(shown()).toBe('cat'));
  });

  it('inside the field: Enter calls onEnter (the value was already requested live)', () => {
    const onEnter = vi.fn();
    wrap(<SearchInside initialValue="" onEnter={onEnter} />);
    type('cat');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledWith('cat');
    expect(shown()).toBe('cat');
  });

  it('the clear button requests \'\'', async () => {
    wrap(<SearchInside initialValue="cats" />);
    const clearBtn = document.querySelector('.ant-input-clear-icon') as HTMLElement;
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
    await waitFor(() => expect(shown()).toBe(''));
  });

  it('commit: the clear button requests \'\' at once (not just the draft), as Escape does', async () => {
    const fire = vi.fn();
    wrap(<SearchCommitted fire={fire} initial="cats" />);
    const clearBtn = document.querySelector('.ant-input-clear-icon') as HTMLElement;
    fireEvent.click(clearBtn);
    expect(input()).toHaveValue('');
    await waitFor(() => expect(fire).toHaveBeenCalledWith(''));
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

  it('commit, mid-composition: Enter neither requests the draft nor calls onEnter', () => {
    const fire = vi.fn();
    const onEnter = vi.fn();
    wrap(<SearchCommitted fire={fire} onEnter={onEnter} />);
    type('ねこ');
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(fire).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(input()).toHaveValue('ねこ');
  });

  it('mid-composition, Escape does not clear', () => {
    wrap(<SearchInside initialValue="cats" />);
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    expect(shown()).toBe('cats');
  });

  it('the draft follows the field\'s value when it changes from outside', () => {
    function OutsideCommitted() {
      const [stored, setStored] = useState('cats');
      const field = useTextField({
        id: 'query', label: 'Search', value: stored, commit: { fire: (next) => { setStored(next); } },
      });
      return <><SearchInput field={field} /><button onClick={() => setStored('dogs')}>External set</button></>;
    }
    wrap(<OutsideCommitted />);
    type('birds');
    fireEvent.click(screen.getByText('External set'));
    expect(input()).toHaveValue('dogs');
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

describe('SearchInput while pending', () => {
  it('the app\'s own: read-only, not disabled, said unavailable, no clear button; typing, Escape and Enter change nothing', () => {
    const onEnter = vi.fn();
    wrap(<SearchInside pending initialValue="cats" onEnter={onEnter} />);
    expect(input()).not.toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    expect(document.querySelector('.ant-input-clear-icon')).toHaveClass('ant-input-clear-icon-hidden');
    type('dogs');
    fireEvent.keyDown(input(), { key: 'Escape' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input()).toHaveValue('cats');
    expect(shown()).toBe('cats');
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('its commit: the clear button, Escape and Enter change nothing while it runs; back to normal after', async () => {
    let finish!: () => void;
    const fire = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onEnter = vi.fn();
    wrap(<SearchCommitted fire={fire} initial="cats" onEnter={onEnter} />);
    type('dogs');
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(fire).toHaveBeenCalledWith('dogs'));
    expect(onEnter).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input()).toHaveAttribute('readonly'));
    expect(input()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(document.querySelector<HTMLElement>('.ant-input-clear-icon')!);
    fireEvent.keyDown(input(), { key: 'Escape' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(input()).toHaveValue('dogs');
    expect(fire).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(shown()).toBe('dogs');
    expect(input()).not.toHaveAttribute('readonly');
  });

  it('keeps the look of a disabled input', () => {
    wrap(<><SearchInside pending /><DisabledLookProbe /></>);
    const probe = screen.getByTestId('probe').style;
    const root = document.querySelector<HTMLElement>('.ant-input-affix-wrapper')!;
    expect(root.style.color).toBe(probe.color);
    expect(root.style.background).toBe(probe.background);
    expect(root.style.cursor).toBe('not-allowed');
    expect(input().style.color).toBe(probe.color);
  });

  it('not enabled and pending: disabled as before, not read-only', () => {
    wrap(<SearchInside pending enabled={denyWithReason('Search is off')} />);
    expect(input()).toBeDisabled();
    expect(input()).not.toHaveAttribute('readonly');
    expect(input()).not.toHaveAttribute('aria-disabled');
  });
});

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

/** Types `text` at `at` as a keystroke does: the DOM value and the caret change, then the input event fires. */
function typeAt(el: HTMLInputElement, at: number, text: string) {
  valueSetter.call(el, el.value.slice(0, at) + text + el.value.slice(at));
  el.setSelectionRange(at + text.length, at + text.length);
  fireEvent.input(el);
}

/** Deletes the character before `at`, as Backspace does. */
function backspaceAt(el: HTMLInputElement, at: number) {
  valueSetter.call(el, el.value.slice(0, at - 1) + el.value.slice(at));
  el.setSelectionRange(at - 1, at - 1);
  fireEvent.input(el);
}

describe.each([['TextInput', TextInput], ['SearchInput', SearchInput]] as const)('%s, live, over an app that stores asynchronously', (_, Widget) => {
  /** The app keeps the value and stores each change a tick later (`later`, a timer each); `external` sets it from outside. */
  function AsyncOutside({ initial = 'abc' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    const field = useTextField({ id: 'q', label: 'Query', value, onChange: (next) => { setTimeout(() => setValue(next), 0); } });
    return <><Widget field={field} /><output>{field.value}</output><button onClick={() => setValue('external')}>External set</button></>;
  }
  /** Lets the app's pending stores land. */
  const landed = () => act(() => new Promise((resolve) => { setTimeout(resolve, 5); }));
  const el = () => input() as HTMLInputElement;

  it('typing in the middle keeps the caret', async () => {
    wrap(<AsyncOutside />);
    act(() => el().focus());
    typeAt(el(), 1, 'X');
    expect(el().value).toBe('aXbc');
    expect(el().selectionStart).toBe(2);
    await landed();
    expect(shown()).toBe('aXbc');
    expect(el().value).toBe('aXbc');
    expect(el().selectionStart).toBe(2);
  });

  it('keystrokes before the first lands all land, and an own change landing late does not take the input back', async () => {
    wrap(<AsyncOutside />);
    act(() => el().focus());
    typeAt(el(), 3, 'X');
    typeAt(el(), 4, 'Y');
    expect(el().value).toBe('abcXY');
    // The first store lands ('abcX'), the second is still on its way: the input keeps 'abcXY'.
    await act(() => new Promise((resolve) => { setTimeout(resolve, 0); }));
    expect(el().value).toBe('abcXY');
    await landed();
    expect(shown()).toBe('abcXY');
    expect(el().value).toBe('abcXY');
  });

  it('typing back to the stored value while a change is on its way still requests it', async () => {
    wrap(<AsyncOutside />);
    act(() => el().focus());
    typeAt(el(), 3, 'd');
    backspaceAt(el(), 4);
    expect(el().value).toBe('abc');
    await landed();
    expect(shown()).toBe('abc');
    expect(el().value).toBe('abc');
  });

  it('a change from outside (not one of the widget\'s requests) shows in the input', async () => {
    wrap(<AsyncOutside />);
    typeAt(el(), 3, 'X');
    await landed();
    fireEvent.click(screen.getByText('External set'));
    expect(shown()).toBe('external');
    expect(el().value).toBe('external');
  });
});
