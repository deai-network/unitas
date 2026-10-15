import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { App as AntApp, Form } from 'antd';
import type { FieldDefinition } from 'vultus-core';
import { Field } from '../Field.js';

// A field widget's own control sits in a stable span (class vultus-tooltip-anchor), there with or
// without a tooltip. The span is the control's layout box: the widget's layout style keys go to it
// and leave the control.

const description = 'What the field does';
const CHOICES = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
const CASES: [string, FieldDefinition, string][] = [
  ['TextInput', { kind: 'text', id: 'f', label: 'F' }, 'input'],
  ['TextInput (textarea)', { kind: 'text', id: 'f', label: 'F', control: 'textarea' }, 'input'],
  ['SearchInput', { kind: 'text', id: 'f', label: 'F', description }, 'search'],
  ['NumericInput', { kind: 'numeric', id: 'f', label: 'F', min: 0, max: 10 }, 'input'],
  ['NumericSlider', { kind: 'numeric', id: 'f', label: 'F', min: 0, max: 10 }, 'slider'],
  ['RangeSlider', { kind: 'range', id: 'f', label: 'F', description, min: 0, max: 10 }, 'slider'],
  ['OneOfSelect', { kind: 'oneOf', id: 'f', label: 'F', choices: CHOICES }, 'select'],
  ['OneOfSlider', { kind: 'oneOf', id: 'f', label: 'F', choices: CHOICES }, 'slider'],
  ['ManyOfSelect', { kind: 'manyOf', id: 'f', label: 'F', description, choices: CHOICES }, 'select'],
  ['ManyOfTreePicker', { kind: 'manyOfTree', id: 'f', label: 'F', nodes: [{ value: 'a' }] }, 'picker'],
];

const anchors = () => document.querySelectorAll<HTMLElement>('.vultus-tooltip-anchor');

describe.each(CASES)('%s: the anchor span', (_, definition, widget) => {
  it('is there, with the class vultus-tooltip-anchor, with or without a description', () => {
    render(<AntApp><Field<FieldDefinition> definition={definition} widget={widget as never} /></AntApp>);
    expect(anchors()).toHaveLength(1);
    expect(anchors()[0].tagName).toBe('SPAN');
  });

  it('takes the widget\'s layout keys (flex, margins); the control keeps neither', () => {
    render(<AntApp><Field<FieldDefinition> definition={definition} widget={widget as never} style={{ flex: 1, marginLeft: 8 }} /></AntApp>);
    const anchor = anchors()[0];
    expect(anchor.style.flexGrow).toBe('1');
    expect(anchor.style.marginLeft).toBe('8px');
    const control = anchor.firstElementChild as HTMLElement;
    expect(control.style.flexGrow).toBe('');
    expect(control.style.marginLeft).toBe('');
    for (const inside of anchor.querySelectorAll<HTMLElement>('[style]')) expect(inside.style.marginLeft).not.toBe('8px');
  });
});

describe('a select in a form item fills it, as antd intends (its span is a block); outside it keeps its natural width', () => {
  it.each([
    ['OneOfSelect', { kind: 'oneOf', id: 'f', label: 'F', description, choices: CHOICES }],
    ['ManyOfSelect', { kind: 'manyOf', id: 'f', label: 'F', choices: CHOICES, widget: 'select' }],
    ['ManyOfTreePicker', { kind: 'manyOfTree', id: 'f', label: 'F', description, nodes: [{ value: 'a' }] }],
  ] as [string, FieldDefinition][])('%s', (_, definition) => {
    render(<AntApp><Form><Field<FieldDefinition> item definition={definition} /></Form></AntApp>);
    const anchor = anchors()[0];
    expect(anchor.style.display).toBe('block');
    expect(anchor.querySelector('.ant-select')).toHaveClass('ant-select-in-form-item');
    expect((anchor.firstElementChild as HTMLElement).style.width).toBe('');
  });
});

describe('controls that are not a field widget\'s own keep the bare shape without a tooltip', () => {
  it('a many-of checkbox without a description has no wrapper span', () => {
    render(<AntApp><Field<FieldDefinition> definition={{ kind: 'manyOf', id: 'f', label: 'F', choices: CHOICES }} /></AntApp>);
    expect(anchors()).toHaveLength(0);
    expect(document.querySelector('[data-choice-value="a"]')!.closest('span[style]')).toBeNull();
  });
});
