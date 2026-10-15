import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { App as AntApp } from 'antd';
import type { FieldDefinition } from 'vultus-core';
import { Field } from '../Field.js';

// A widget given `style={{ width: '100%' }}` fills its container, also with a description, when
// its control sits in the tooltip's span: the span takes the width (the tooltip stays on the control).

const description = 'What the field does';
const CASES: [string, FieldDefinition, string][] = [
  ['TextInput', { kind: 'text', id: 'f', label: 'F', description }, 'input'],
  ['SearchInput', { kind: 'text', id: 'f', label: 'F', description }, 'search'],
  ['ManyOfSelect', { kind: 'manyOf', id: 'f', label: 'F', description, choices: [{ value: 'a' }] }, 'select'],
  ['NumericInput', { kind: 'numeric', id: 'f', label: 'F', description, min: 0, max: 10 }, 'input'],
  ['NumericSlider', { kind: 'numeric', id: 'f', label: 'F', description, min: 0, max: 10 }, 'slider'],
  ['RangeSlider', { kind: 'range', id: 'f', label: 'F', description, min: 0, max: 10 }, 'slider'],
  ['OneOfSelect', { kind: 'oneOf', id: 'f', label: 'F', description, choices: [{ value: 'a' }, { value: 'b' }] }, 'select'],
  ['OneOfSlider', { kind: 'oneOf', id: 'f', label: 'F', description, choices: [{ value: 'a' }, { value: 'b' }] }, 'slider'],
  ['TreePicker', { kind: 'tree', id: 'f', label: 'F', description, nodes: [{ value: 'a' }] }, 'picker'],
];

/** The widget's outermost element: with a tooltip, the span the tooltip anchors on. */
const outermost = () => document.querySelector('.ant-app')!.firstElementChild as HTMLElement;

describe.each(CASES)('%s with style.width under a tooltip', (name, definition, widget) => {
  it('the tooltip\'s span takes the width', () => {
    render(<AntApp><Field<FieldDefinition> definition={definition} widget={widget as never} style={{ width: '100%' }} /></AntApp>);
    expect(outermost().tagName).toBe('SPAN');
    expect(outermost().style.width).toBe('100%');
  });

  if (name.endsWith('Slider')) {
    it('the slider fills the width: its body is a flex box of that width, the slider grows in it', () => {
      render(<AntApp><Field<FieldDefinition> definition={definition} widget={widget as never} style={{ width: '100%' }} /></AntApp>);
      const body = document.querySelector<HTMLElement>('[data-field-id="f"]')!;
      expect(body.style.display).toBe('flex');
      expect(body.style.width).toBe('100%');
      const slider = body.querySelector<HTMLElement>('.ant-slider')!;
      expect(slider.style.flexGrow).toBe('1');
      expect(slider.style.width).toBe('');
    });

    if (name !== 'OneOfSlider') {
      it('with showValue in a given width, the value stays on one line beside the slider', () => {
        render(<AntApp><Field<FieldDefinition> definition={definition} widget={{ name: 'slider', showValue: true } as never} style={{ width: '100%' }} /></AntApp>);
        const body = document.querySelector<HTMLElement>('[data-field-id="f"]')!;
        const value = body.firstElementChild as HTMLElement;
        expect(value.classList.contains('ant-slider')).toBe(false);
        expect(value.style.whiteSpace).toBe('nowrap');
      });
    }

    it('without a width the body stays inline', () => {
      render(<AntApp><Field<FieldDefinition> definition={definition} widget={widget as never} /></AntApp>);
      const body = document.querySelector<HTMLElement>('[data-field-id="f"]')!;
      expect(['inline-flex', 'inline-block']).toContain(body.style.display);
      expect(body.style.width).toBe('');
    });
  }
});
