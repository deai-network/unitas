import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { FieldDefinition } from 'vultus-core';
import { Field } from '../Field.js';
import { openTooltips } from './helpers/tooltips.js';

// A control keeps its identity when its tooltip comes or goes with its value (a value with a
// value description and one without): withTooltip's wrapper is always there, so React does not
// remount the control and the keyboard focus stays on it.

const wrap = (node: React.ReactNode) => render(<AntApp>{node}</AntApp>);

const PAPER: FieldDefinition = {
  kind: 'oneOf', id: 'paper', label: 'Paper', description: 'The sheet size',
  // Only A4 has a description: the current state ("Current state: …") shows for A4 alone.
  choices: [{ value: 'a4', label: 'A4', description: 'The usual size' }, { value: 'a3', label: 'A3' }],
};
const DUPLEX: FieldDefinition = {
  kind: 'boolean', id: 'duplex', label: 'Both sides', description: 'Print on both sides',
  valueDescriptions: { true: 'Printing on both sides' },
};
const { description: _none, ...DUPLEX_UNDESCRIBED } = DUPLEX as FieldDefinition & { description?: string };

/** Opens the select and clicks the option with this label, the focus staying on the select. */
async function pick(label: string) {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0));
  const option = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find((o) => o.textContent === label)!;
  fireEvent.click(option);
}

describe('a control whose tooltip comes and goes with its value keeps its identity and the focus', () => {
  it.each([[true], [false]])('a select, picking a choice without a description and back (item: %s)', async (item) => {
    wrap(<Field item={item} definition={PAPER} />);
    const root = document.querySelector('[data-field-id="paper"]')!;
    const input = screen.getByRole('combobox');
    act(() => input.focus());
    await pick('A3');
    await waitFor(() => expect(document.querySelector('[data-field-id="paper"]')).toHaveAttribute('data-value', 'a3'));
    expect(document.querySelector('[data-field-id="paper"]')).toBe(root);
    expect(document.activeElement).toBe(input);
    await pick('A4');
    await waitFor(() => expect(document.querySelector('[data-field-id="paper"]')).toHaveAttribute('data-value', 'a4'));
    expect(document.querySelector('[data-field-id="paper"]')).toBe(root);
    expect(document.activeElement).toBe(input);
  });

  it.each([
    ['in an item', DUPLEX, true],
    ['outside an item, without a description', DUPLEX_UNDESCRIBED as FieldDefinition, false],
  ])('a switch with a value description for one value only, toggled on and off (%s)', async (_, definition, item) => {
    wrap(<Field item={item} definition={definition} />);
    const control = screen.getByRole('switch');
    act(() => control.focus());
    fireEvent.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('switch')).toBe(control);
    expect(document.activeElement).toBe(control);
    fireEvent.click(control);
    await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'false'));
    expect(screen.getByRole('switch')).toBe(control);
    expect(document.activeElement).toBe(control);
  });

  // The checkbox shows its own label, so its item has no info sign and keeps the description in the
  // tooltip: a field without a description is the one whose tooltip comes and goes, in an item too.
  it.each([
    ['in an item', true],
    ['outside an item', false],
  ])('a checkbox with a value description for one value only, toggled on and off (%s)', async (_, item) => {
    wrap(<Field item={item} definition={{ ...(DUPLEX_UNDESCRIBED as FieldDefinition), widget: 'checkbox' }} />);
    const control = screen.getByRole('checkbox');
    expect(control.closest('.vultus-tooltip-anchor')).not.toBeNull();
    act(() => control.focus());
    fireEvent.click(control);
    await waitFor(() => expect(control).toBeChecked());
    expect(screen.getByRole('checkbox')).toBe(control);
    expect(document.activeElement).toBe(control);
    fireEvent.click(control);
    await waitFor(() => expect(control).not.toBeChecked());
    expect(screen.getByRole('checkbox')).toBe(control);
    expect(document.activeElement).toBe(control);
  });

  it('with no title the wrapper is there but no tooltip opens', async () => {
    wrap(<Field definition={DUPLEX_UNDESCRIBED as FieldDefinition} />);
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    await act(() => new Promise((resolve) => { setTimeout(resolve, 300); }));
    expect(openTooltips()).toHaveLength(0);
  });
});
