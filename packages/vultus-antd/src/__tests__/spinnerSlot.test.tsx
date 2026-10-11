import { useState } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
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

beforeEach(() => { calls.length = 0; });

describe('ActionButton — spinner slot', () => {
  it('pending: the provided Spinner replaces antd\'s loading icon, keyed to the action', () => {
    const { container } = render(wrap(<ActionButton action={makeStatus({ id: 'save', pending: true })} />));
    const btn = screen.getByRole('button');
    const spinner = within(btn).getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:action:save');
    expect(container.querySelector('.anticon-loading')).toBeNull();
    expect(calls.find((c) => c.spinnerKey === 'vultus:action:save')).toMatchObject({ size: 'small' });
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

  it('iconPlacement="end" while pending: still ant-btn-icon-end, with the provided Spinner in the icon slot', () => {
    render(wrap(
      <ActionButton action={makeStatus({ id: 'save', pending: true, icon: <span data-testid="icon" /> })} iconPlacement="end" />,
    ));
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('ant-btn-icon-end');
    expect(within(btn).getByTestId('rec-spinner')).toBeInTheDocument();
  });
});

describe('CombinedActionButton — spinner slot', () => {
  it('main half pending: the provided Spinner, keyed to the active action', () => {
    const a = makeStatus({ id: 'a', label: 'A', pending: true });
    const b = makeStatus({ id: 'b', label: 'B' });
    const { container } = render(wrap(<CombinedActionButton actions={[a, b]} />));
    const main = mainBtn(container);
    expect(within(main).getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:a');
    expect(container.querySelector('.anticon-loading')).toBeNull();
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
  it('pending: the provided Spinner, keyed to the action', () => {
    render(wrap(<FormSubmitButton action={makeStatus({ id: 'submit', pending: true })} />));
    const btn = screen.getByRole('button');
    expect(within(btn).getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:submit');
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
  it('pending: the provided Spinner where antd\'s Spin was, no .ant-spin', async () => {
    render(wrap(<PendingCheckbox />));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(document.querySelector('.ant-spin')).toBeNull();
    expect(screen.getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:field:enabled');
  });

  it('without a provider: today\'s antd Spin, unchanged', async () => {
    render(wrap(<PendingCheckbox />, false));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeDisabled());
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(document.querySelector('.ant-spin')).not.toBeNull();
  });
});

function PendingSwitch() {
  const field = useBoolField({ id: 'enabled', label: 'Enabled', value: true, commit: { fire: () => new Promise<void>(() => {}) } });
  return <BoolSwitch field={field} />;
}

describe('BoolSwitch — spinner slot', () => {
  it('pending: no ant-switch-loading, the switch stays disabled, the provided Spinner follows it', async () => {
    render(wrap(<PendingSwitch />));
    fireEvent.click(screen.getByRole('switch'));
    const switchEl = await waitFor(() => {
      const el = screen.getByRole('switch');
      expect(el).toBeDisabled();
      return el;
    });
    expect(switchEl.className).not.toContain('ant-switch-loading');
    const spinner = screen.getByTestId('rec-spinner');
    expect(spinner).toHaveAttribute('data-key', 'vultus:field:enabled');
    // The Spinner renders after the switch in the DOM.
    expect(switchEl.compareDocumentPosition(spinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('without a provider: today\'s loading switch, unchanged', async () => {
    render(wrap(<PendingSwitch />, false));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('switch').className).toContain('ant-switch-loading'));
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

describe('OneOfSelect — spinner slot', () => {
  it('pending: the Select\'s loading icon is the provided Spinner', async () => {
    render(wrap(<PendingSelect />));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('B')[0]);
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false'));
    expect(screen.getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:field:choice');
  });

  it('without a provider: no Spinner rendered', async () => {
    render(wrap(<PendingSelect />, false));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('B')[0]);
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
  });
});

describe('SpinnerScope — vultus-antd sites', () => {
  it('prefixes a site\'s key with the scope name', () => {
    render(wrap(<SpinnerScope name="s1"><ActionButton action={makeStatus({ id: 'go', pending: true })} /></SpinnerScope>));
    expect(screen.getByTestId('rec-spinner')).toHaveAttribute('data-key', 's1/vultus:action:go');
  });
});

describe('rerender without, then with, a provider', () => {
  it('no hook-order error; the Spinner appears once provided', () => {
    const { rerender } = render(wrap(<ActionButton action={makeStatus({ id: 'go', pending: true })} />, false));
    expect(screen.queryByTestId('rec-spinner')).toBeNull();
    expect(() => rerender(wrap(<ActionButton action={makeStatus({ id: 'go', pending: true })} />, true))).not.toThrow();
    expect(screen.getByTestId('rec-spinner')).toHaveAttribute('data-key', 'vultus:action:go');
  });
});
