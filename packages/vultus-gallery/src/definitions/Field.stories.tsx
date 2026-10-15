import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, Form, Space, Tag } from 'antd';
import { useState } from 'react';
import { Field, denyWithReason, type ExecutionContext, type FieldDefinition } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';
import { CATEGORIES, TASK_FILTERS } from './taskFilters.js';

/**
 * Fields as data: a FieldDefinition is a field hook's options in their inside form, tagged by
 * `kind`. `<Field definition={d} />` runs the kind's hook and renders its widget: the
 * definition's `widget` hint (a name, or `{ name, ...displayOptions }`), else the kind's
 * default. Render-site props win over the definition: `widget` over the hint, `label`,
 * `description`, `enabled`/`disabled`, `visible`/`hidden` and `placeholder` over its values,
 * the other props over the hint's display options. `item` puts the field in a labelled antd
 * form item, for a vertical form such as a print dialog.
 */
const meta: Meta = { title: 'Definitions/Field' };
export default meta;

const hintText = (d: FieldDefinition) => (d.widget === undefined ? '(default)' : JSON.stringify(d.widget).replace(/"/g, '\''));

const MIXED: FieldDefinition = { kind: 'mixed-boolean', id: 'sources', label: 'All sources', initialValue: 'mixed', widget: 'checkbox' };

const CHAPTER: FieldDefinition = { kind: 'oneOfTree', id: 'chapter', label: 'Chapter', nodes: CATEGORIES, widget: 'list' };

export const EveryKind: StoryObj = {
  name: 'A list of definitions, every kind',
  render: () => (
    <Showcase
      title="A task module's filters, as data"
      note="One <Field definition={d} /> per definition, the value inside each field. Each caption gives the kind and the definition's widget hint; without one, the kind's default widget (switch, select, checkboxes, input, slider, picker). 'chapter' hints 'list', an OneOfTreeList instead of its default picker. The last one, a mixed-boolean aggregate, cannot be stored, but renders like the others."
    >
      <Space orientation="vertical" size={20}>
        {[...TASK_FILTERS, CHAPTER, MIXED].map((d) => (
          <Example key={d.id} label={`${d.id}: ${d.kind} · ${hintText(d)}`}>
            <Field definition={d} />
          </Example>
        ))}
      </Space>
    </Showcase>
  ),
};

const byId = (id: string) => TASK_FILTERS.find((d) => d.id === id)!;
const ROUNDS_IN_A_COLUMN: FieldDefinition = { ...byId('rounds'), widget: { name: 'checkboxes', vertical: true } };

export const HintsAndOverrides: StoryObj = {
  name: 'Hints and render-site overrides',
  render: () => (
    <>
      <Showcase
        title="The widget"
        note="Grade's definition hints 'segmented'; the render site may name another widget of the kind (a name the kind has no widget for throws)."
      >
        <Example label="grade, as defined"><Field definition={byId('grade')} /></Example>
        <Example label={'widget="select"'}><Field definition={byId('grade')} widget="select" style={{ width: 120 }} /></Example>
        <Example label={'widget="slider"'}><Field definition={byId('grade')} widget="slider" style={{ width: 220 }} /></Example>
      </Showcase>
      <Showcase
        title="Display options"
        note="Rounds hints { name: 'checkboxes', vertical: true }. A render-site prop overrides one display option; a different widget named at the render site does not get the hint's options (they are the hinted widget's)."
      >
        <Example label="rounds, as defined (vertical)"><Field definition={ROUNDS_IN_A_COLUMN} /></Example>
        <Example label="vertical={false}"><Field definition={ROUNDS_IN_A_COLUMN} vertical={false} /></Example>
        <Example label={'widget="switches"'}><Field definition={ROUNDS_IN_A_COLUMN} widget="switches" /></Example>
        <Example label={'widget="select"'}><Field definition={ROUNDS_IN_A_COLUMN} widget="select" style={{ width: 260 }} /></Example>
      </Showcase>
      <Showcase
        title="The definition's values"
        note="The same definitions with a render-site label, a reason to disable (hover it), and a placeholder; the categories with ManyOfTreePicker's phone layout (panel and summary are its display options)."
      >
        <Example label={'label="Rounds of 2025"'}><Field definition={byId('rounds')} label="Rounds of 2025" widget="switches" item /></Example>
        <Example label="enabled={denyWithReason(…)}">
          <Field definition={byId('grade')} enabled={denyWithReason('Set by the teacher for this class.')} />
        </Example>
        <Example label={'placeholder="Any category"'}>
          <Field definition={byId('categories')} placeholder="Any category" panel="drawer" summary="firstWords" style={{ width: 260 }} />
        </Example>
      </Showcase>
    </>
  ),
};

/** The print dialog's options, as data. */
const PRINT_OPTIONS: FieldDefinition[] = [
  {
    kind: 'oneOf', id: 'paper', label: 'Paper', description: 'The sheet size loaded in the printer.',
    choices: [{ value: 'a4', label: 'A4' }, { value: 'a5', label: 'A5' }, { value: 'letter', label: 'Letter' }],
  },
  {
    kind: 'oneOf', id: 'orientation', label: 'Orientation', widget: 'segmented',
    choices: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }],
  },
  { kind: 'numeric', id: 'copies', label: 'Copies', min: 1, max: 60, integer: true, description: 'One per **student**, usually.' },
  { kind: 'boolean', id: 'duplex', label: 'Both sides', description: 'Print on *both* sides of each sheet.' },
  { kind: 'text', id: 'header', label: 'Header', placeholder: 'Class 9.b, 15 October' },
  { kind: 'boolean', id: 'solutions', label: 'Include the solutions', widget: 'checkbox', description: 'At the end, after the last task.' },
];

const PRINTER: FieldDefinition = {
  kind: 'oneOf', id: 'printer', label: 'Printer', description: 'Where the sheets come out.',
  choices: [
    { value: 'office', label: 'Staff room' },
    { value: 'library', label: 'Library', note: 'low toner' },
    { value: 'room214', label: 'Room 214' },
  ],
};

export const PrintDialog: StoryObj<{ latencyMs: number }> = {
  name: 'Print dialog (item)',
  args: { latencyMs: 600 },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ latencyMs }) {
    const [printer, setPrinter] = useState('office');
    const fire = async (next: string, ctx: ExecutionContext) => {
      await delay(latencyMs);
      if (next === 'room214') {
        ctx.error('The printer in Room 214 is offline.');
        return;
      }
      if (next === 'library') ctx.warn('The library printer is low on toner.');
      setPrinter(next);
    };
    return (
      <Showcase
        title="Print dialog"
        note="<Field item> in a vertical antd Form: the label, the description (markdown) behind the label's info sign, and the last commit's messages under the control. The checkbox shows its own label, so its item has none. The printer is committed to a pretend server: Room 214 is refused (an error message, the item in the error status, the printer unchanged), the library is taken with a warning."
      >
        <Card title="Print the task sheet" style={{ width: 380 }}>
          <Form layout="vertical">
            <Field item definition={PRINTER} value={printer} commit={{ fire }} />
            {PRINT_OPTIONS.map((d) => <Field key={d.id} item definition={d} />)}
          </Form>
        </Card>
        <Example label="printer (stored)"><Tag>{printer}</Tag></Example>
      </Showcase>
    );
  },
};
