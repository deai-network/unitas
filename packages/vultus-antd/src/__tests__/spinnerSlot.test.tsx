import { useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { SpinnerScope, useBoolField, useOneOfField, type SpinnerProps } from 'vultus-core';
import { VultusProvider } from '../VultusProvider.js';
import { ActionButton } from '../ActionButton.js';
import { CombinedActionButton } from '../CombinedActionButton.js';
import { FormSubmitButton } from '../FormSubmitButton.js';
import { BoolCheckbox } from '../BoolCheckbox.js';
import { BoolSwitch } from '../BoolSwitch.js';
import { OneOfSelect } from '../OneOfSelect.js';
import { OneOfSegmented } from '../OneOfSegmented.js';
import { makeStatus } from './helpers/makeStatus.js';

const calls: SpinnerProps[] = [];
function RecSpinner(p: SpinnerProps) {
  calls.push(p);
  return <span data-testid="rec-spinner" data-key={p.spinnerKey} />;
}

/** @param withSpinner Wraps `node` in a VultusProvider lending RecSpinner; without it, nothing is lent. */
function wrap(node: React.ReactNode, withSpinner = true) {
  return (
    <AntApp>
      {withSpinner ? <VultusProvider components={{ Spinner: RecSpinner }}>{node}</VultusProvider> : node}
    </AntApp>
  );
}

// Same `.ant-btn:not(.ant-dropdown-trigger)` query CombinedActionButton.test.tsx uses.
function mainBtn(container: HTMLElement): HTMLElement {
  const btn = container.querySelector('.ant-btn:not(.ant-dropdown-trigger)');
  if (!btn) throw new Error('main button not found');
  return btn as HTMLElement;
}

/** The size vultus-antd sites pass to a lent Spinner, from the last call keyed `key`. */
function sizeOf(key: string): SpinnerProps['size'] {
  return calls.filter((c) => c.spinnerKey === key).at(-1)?.size;
}

beforeEach(() => { calls.length = 0; });

describe('ActionButton — spinner slot', () => {
  it('pending: the provided Spinner replaces antd\'s loading icon, keyed to the action, size small', () => {
    const { container } = render(wrap(<ActionButton action={makeStatus({ id: 'save', pending: true })} />));
    const btn = screen.getByRole('button');
    const spinner = within(btn).getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:action:save');
    expect(container.querySelector('.anticon-loading')).toBeNull();
    expect(sizeOf('vultus:action:save')).toBe('small');
  });

  it('not pending: no Spinner rendered', () => {
    render(wrap(<ActionButton action={makeStatus({ id: 'save', pending: false })} />));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
  });

  it('without a provider: today\'s antd loading output, unchanged', () => {
    const { container } = render(wrap(<ActionButton action={makeStatus({ id: 'save', pending: true })} />, false));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(container.querySelector('.anticon-loading')).not.toBeNull();
  });

  it('iconPlacement="end" while pending: still ant-btn-icon-end, the provided Spinner sits in .ant-btn-icon in place of action.icon', () => {
    render(wrap(
      <ActionButton action={makeStatus({ id: 'save', pending: true, icon: <span data-testid="icon" /> })} iconPlacement="end" />,
    ));
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('ant-btn-icon-end');
    const iconSlot = btn.querySelector('.ant-btn-icon');
    expect(iconSlot).not.toBeNull();
    expect(within(iconSlot as HTMLElement).getByTestId('rec-spinner')).toBeInTheDocument();
    // action.icon itself does not render while pending — the Spinner took its slot.
    expect(screen.queryByTestId('icon')).toBeNull();
  });
});

describe('CombinedActionButton — spinner slot', () => {
  it('main half pending: the provided Spinner, keyed to the active action, size small', () => {
    const a = makeStatus({ id: 'a', label: 'A', pending: true });
    const b = makeStatus({ id: 'b', label: 'B' });
    const { container } = render(wrap(<CombinedActionButton actions={[a, b]} />));
    const main = mainBtn(container);
    expect(within(main).getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:a');
    expect(container.querySelector('.anticon-loading')).toBeNull();
    expect(sizeOf('vultus:action:a')).toBe('small');
  });

  it('without a provider: today\'s antd loading output, unchanged', () => {
    const a = makeStatus({ id: 'a', label: 'A', pending: true });
    const b = makeStatus({ id: 'b', label: 'B' });
    const { container } = render(wrap(<CombinedActionButton actions={[a, b]} />, false));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(mainBtn(container).querySelector('.anticon-loading')).not.toBeNull();
  });
});

describe('FormSubmitButton — spinner slot', () => {
  it('pending: the provided Spinner, keyed to the action, size small, antd\'s loading icon gone', () => {
    const { container } = render(wrap(<FormSubmitButton action={makeStatus({ id: 'submit', pending: true })} />));
    const btn = screen.getByRole('button');
    expect(within(btn).getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:submit');
    expect(container.querySelector('.anticon-loading')).toBeNull();
    expect(sizeOf('vultus:action:submit')).toBe('small');
  });

  it('without a provider: today\'s antd loading output, unchanged', () => {
    const { container } = render(wrap(<FormSubmitButton action={makeStatus({ id: 'submit', pending: true })} />, false));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(container.querySelector('.anticon-loading')).not.toBeNull();
  });
});

function PendingCheckbox() {
  const field = useBoolField({ id: 'enabled', label: 'Enabled', value: true, commit: { fire: () => new Promise<void>(() => {}) } });
  return <BoolCheckbox field={field} />;
}

describe('BoolCheckbox — spinner slot', () => {
  it('pending: the provided Spinner where antd\'s Spin was, no .ant-spin, inside the checkbox label, size small', async () => {
    render(wrap(<PendingCheckbox />));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getByRole('checkbox')).not.toBeDisabled();
    expect(document.querySelector('.ant-spin')).toBeNull();
    const spinner = screen.getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:field:enabled');
    expect(spinner.closest('.ant-checkbox-wrapper')).not.toBeNull();
    expect(sizeOf('vultus:field:enabled')).toBe('small');
  });

  it('without a provider: today\'s antd Spin, unchanged', async () => {
    render(wrap(<PendingCheckbox />, false));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(document.querySelector('.ant-spin')).not.toBeNull();
  });
});

function PendingSwitch() {
  const field = useBoolField({ id: 'enabled', label: 'Enabled', value: true, commit: { fire: () => new Promise<void>(() => {}) } });
  return <BoolSwitch field={field} />;
}

describe('BoolSwitch — spinner slot', () => {
  it('pending: no ant-switch-loading, the switch stays focusable (locked, not disabled), the provided Spinner follows it, size small', async () => {
    render(wrap(<PendingSwitch />));
    fireEvent.click(screen.getByRole('switch'));
    const switchEl = await waitFor(() => {
      const el = screen.getByRole('switch');
      expect(el).toHaveAttribute('aria-disabled', 'true');
      return el;
    });
    expect(switchEl).not.toBeDisabled();
    expect(switchEl.className).not.toContain('ant-switch-loading');
    const spinner = screen.getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:field:enabled');
    // The Spinner renders after the switch in the DOM.
    expect(switchEl.compareDocumentPosition(spinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sizeOf('vultus:field:enabled')).toBe('small');
  });

  it('without a provider: antd\'s Spin follows the switch; no loading switch (antd\'s Switch counts loading as disabled)', async () => {
    render(wrap(<PendingSwitch />, false));
    fireEvent.click(screen.getByRole('switch'));
    const switchEl = await waitFor(() => {
      const el = screen.getByRole('switch');
      expect(el).toHaveAttribute('aria-disabled', 'true');
      return el;
    });
    expect(switchEl).not.toBeDisabled();
    expect(switchEl.className).not.toContain('ant-switch-loading');
    const spin = document.querySelector('.ant-spin');
    expect(spin).not.toBeNull();
    expect(switchEl.compareDocumentPosition(spin!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
  });
});

function PendingSelect() {
  const [stored] = useState<'a' | 'b'>('a');
  const field = useOneOfField<'a' | 'b'>({
    id: 'choice',
    label: 'Choice',
    choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    value: stored,
    commit: { fire: () => new Promise<void>(() => {}) },
  });
  return <OneOfSelect field={field} />;
}

/** Selects 'B', putting the field (and so the Select) into its pending commit state. */
async function makeSelectPending() {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText('B')[0]);
  await waitFor(() => expect(document.querySelector('.ant-select')).toHaveClass('ant-select-loading'));
}

describe('OneOfSelect — spinner slot', () => {
  it('pending: the Select shows the provided Spinner as its suffix (loading) icon, size small, no antd default, no stray loadingIcon attribute, no console warning', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(wrap(<PendingSelect />));
    await makeSelectPending();
    const root = document.querySelector('.ant-select') as HTMLElement;
    expect(root).toHaveClass('ant-select-loading');
    const suffix = root.querySelector('.ant-select-suffix.ant-select-suffix-loading');
    expect(suffix).not.toBeNull();
    const spinner = within(suffix as HTMLElement).getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:field:choice');
    expect(root.querySelector('.anticon-loading')).toBeNull();
    expect(document.querySelector('[loadingicon]')).toBeNull();
    expect(sizeOf('vultus:field:choice')).toBe('small');
    const notRecognized = errorSpy.mock.calls.filter((args) => args.some((a) => typeof a === 'string' && a.includes('does not recognize')));
    expect(notRecognized).toHaveLength(0);
    errorSpy.mockRestore();
  });

  it('without a provider: antd\'s own loading icon while pending, no Spinner, no console warning', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(wrap(<PendingSelect />, false));
    await makeSelectPending();
    const root = document.querySelector('.ant-select') as HTMLElement;
    expect(root.querySelector('.anticon-loading')).not.toBeNull();
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    const notRecognized = errorSpy.mock.calls.filter((args) => args.some((a) => typeof a === 'string' && a.includes('does not recognize')));
    expect(notRecognized).toHaveLength(0);
    errorSpy.mockRestore();
  });
});

/** A segmented one-of field the app holds pending (its `pending` option), or not. */
function SettlingSegmented({ pending }: { pending: boolean }) {
  const [value, setValue] = useState<'a' | 'b'>('a');
  const field = useOneOfField<'a' | 'b'>({
    id: 'variant',
    label: 'Variant',
    choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    value,
    onChange: setValue,
    pending,
  });
  return <OneOfSegmented field={field} />;
}

describe('OneOfSegmented — spinner slot', () => {
  it('pending (the app\'s own): the control is locked (not disabled) and the provided Spinner follows it, keyed to the field, size small', () => {
    render(wrap(<SettlingSegmented pending />));
    const segmented = document.querySelector('.ant-segmented') as HTMLElement;
    expect(segmented).not.toHaveClass('ant-segmented-disabled');
    expect(segmented).toHaveAttribute('aria-disabled', 'true');
    const spinner = screen.getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:field:variant');
    expect(segmented.compareDocumentPosition(spinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sizeOf('vultus:field:variant')).toBe('small');
  });

  it('without a provider: antd\'s Spin follows it while pending', () => {
    render(wrap(<SettlingSegmented pending />, false));
    expect(document.querySelector('.ant-spin')).not.toBeNull();
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
  });

  it('not pending: no spinner, the control enabled', () => {
    render(wrap(<SettlingSegmented pending={false} />));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(document.querySelector('.ant-segmented')).not.toHaveClass('ant-segmented-disabled');
    expect(document.querySelector('.ant-segmented')).not.toHaveAttribute('aria-disabled');
  });

  it('the control keeps its node when pending comes and goes', () => {
    const { rerender } = render(wrap(<SettlingSegmented pending={false} />));
    const before = document.querySelector('.ant-segmented');
    rerender(wrap(<SettlingSegmented pending />));
    expect(document.querySelector('.ant-segmented')).toBe(before);
    rerender(wrap(<SettlingSegmented pending={false} />));
    expect(document.querySelector('.ant-segmented')).toBe(before);
  });
});

describe('SpinnerScope — vultus-antd sites', () => {
  it('prefixes a site\'s key with the scope name', () => {
    render(wrap(<SpinnerScope name="s1"><ActionButton action={makeStatus({ id: 'go', pending: true })} /></SpinnerScope>));
    expect(screen.getByTestId('rec-spinner')).toHaveAttribute('data-key', 's1/vultus:action:go');
  });
});

describe('rerender without, then with, a provider', () => {
  it('no hook-order error; the same DOM node survives; the Spinner appears once provided', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Same tree shape both times — only the lent components change — so a hook-order bug in
    // ActionButton itself (not a remount caused by the test) is what this would catch.
    const tree = (withSpinner: boolean) => (
      <AntApp>
        <VultusProvider components={withSpinner ? { Spinner: RecSpinner } : {}}>
          <ActionButton action={makeStatus({ id: 'go', pending: true })} />
        </VultusProvider>
      </AntApp>
    );
    const { rerender } = render(tree(false));
    const btnBefore = screen.getByRole('button');
    expect(screen.queryByTestId('rec-spinner')).toBeNull();

    rerender(tree(true));
    const btnAfter = screen.getByRole('button');
    expect(btnAfter).toBe(btnBefore); // same node: no remount, so this exercises the live hook order
    expect(screen.getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:go');

    const hookOrderErrors = errorSpy.mock.calls.filter((args) => args.some((a) => typeof a === 'string' && a.includes('change in the order of Hooks')));
    expect(hookOrderErrors).toHaveLength(0);
    errorSpy.mockRestore();
  });
});
