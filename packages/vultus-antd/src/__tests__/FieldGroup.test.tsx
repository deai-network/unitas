import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useFieldGroup, type FieldDefinition, type FieldGroup } from 'vultus-core';
import { FieldWidget } from '../FieldWidget.js';

// vultus-core's print dialog (useFieldGroup's tests), labelled, rendered as an app renders a
// group: each field's controls with <FieldWidget item>, the widget by the definition's hint.
// Paper's choices depend on layout; copies shows for the original layout only.

const A_SIZES = [{ value: 'a4', label: 'A4' }, { value: 'a5', label: 'A5' }];
const ALL_SIZES = [...A_SIZES, { value: 'letter', label: 'Letter' }];

const PRINT: FieldDefinition[] = [
  {
    kind: 'oneOf', id: 'layout', label: 'Layout', widget: 'segmented',
    choices: [{ value: 'rendered', label: 'Rendered' }, { value: 'original', label: 'Original' }],
  },
  { kind: 'oneOf', id: 'paper', label: 'Paper', choices: (ctx) => (ctx.values.layout === 'rendered' ? A_SIZES : ALL_SIZES) },
  { kind: 'numeric', id: 'copies', label: 'Copies', min: 1, integer: true, visible: (ctx) => ctx.values.layout === 'original' },
];

/** The group, as the component running it last rendered it. */
let group!: FieldGroup;
function PrintDialog() {
  group = useFieldGroup(PRINT);
  return <>{group.fields.map((f) => <FieldWidget key={f.id} field={f} item />)}</>;
}

const wrap = () => render(<AntApp><PrintDialog /></AntApp>);

const paper = () => screen.getByRole('combobox', { name: 'Paper' });
const shownPaper = () => document.querySelector('[data-field-id="paper"]')!.getAttribute('data-value');

/** The paper select's choices, as its dropdown lists them (opened unless it is open). */
async function paperChoices(): Promise<(string | null)[]> {
  if (paper().getAttribute('aria-expanded') !== 'true') fireEvent.mouseDown(paper());
  await waitFor(() => expect(paper()).toHaveAttribute('aria-expanded', 'true'));
  return Array.from(document.querySelectorAll('.ant-select-item-option')).map((o) => o.textContent);
}

/** A layout, chosen on the segmented control. */
const chooseLayout = (label: string) => fireEvent.click(screen.getByText(label));

describe('a field group rendered with <FieldWidget item>', () => {
  it('each field in a labelled form item, by its widget hint', () => {
    wrap();
    expect(Array.from(document.querySelectorAll('.ant-form-item-label')).map((l) => l.textContent)).toEqual(['Layout', 'Paper']);
    expect(document.querySelector('.ant-form-item .ant-segmented[data-field-id="layout"]')).not.toBeNull();
    expect(document.querySelector('.ant-form-item [data-field-id="paper"]')).not.toBeNull();
  });

  it('choosing a layout changes the paper select\'s choices', async () => {
    wrap();
    expect(await paperChoices()).toEqual(['A4', 'A5']);
    chooseLayout('Original');
    expect(group.values.layout).toBe('original');
    expect(await paperChoices()).toEqual(['A4', 'A5', 'Letter']);
    chooseLayout('Rendered');
    expect(await paperChoices()).toEqual(['A4', 'A5']);
  });

  it('the hidden field renders nothing; it shows once the layout makes it visible', () => {
    wrap();
    expect(group.byId.copies.visible).toBe(false);
    expect(document.querySelector('[data-field-id="copies"]')).toBeNull();
    expect(screen.queryByText('Copies')).toBeNull();
    expect(document.querySelectorAll('.ant-form-item')).toHaveLength(2);

    chooseLayout('Original');
    expect(document.querySelector('.ant-form-item [data-field-id="copies"]')).not.toBeNull();
    expect(screen.getByText('Copies')).toBeInTheDocument();
    expect(document.querySelectorAll('.ant-form-item')).toHaveLength(3);

    chooseLayout('Rendered');
    expect(document.querySelector('[data-field-id="copies"]')).toBeNull();
    expect(document.querySelectorAll('.ant-form-item')).toHaveLength(2);
  });

  it('a choice made on the widget reaches the group; a layout without it shows the fallback, and back, the choice again', async () => {
    wrap();
    chooseLayout('Original');
    await paperChoices();
    fireEvent.click(Array.from(document.querySelectorAll('.ant-select-item-option')).find((o) => o.textContent === 'Letter')!);
    expect(group.values.paper).toBe('letter');
    expect(shownPaper()).toBe('letter');

    chooseLayout('Rendered');
    expect(group.values.paper).toBe('a4');
    expect(shownPaper()).toBe('a4');

    chooseLayout('Original');
    expect(group.values.paper).toBe('letter');
    expect(shownPaper()).toBe('letter');
  });
});
