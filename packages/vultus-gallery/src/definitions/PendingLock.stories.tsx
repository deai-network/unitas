import type { Meta, StoryObj } from '@storybook/react-vite';
import { Form, Space, Tag, theme } from 'antd';
import { useState } from 'react';
import { ActionButton, ActionContextMenu, CombinedActionButton, Field, useAction, type FieldDefinition } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';
import { CATEGORIES, GRADES, ROUNDS, schoolYear } from './taskFilters.js';

/**
 * The pending lock: while a field is pending (its commit runs, or its `pending` option says the
 * app is busy with it), its widget is locked, not disabled: it keeps the keyboard focus, is said
 * unavailable, looks disabled and changes nothing. Here every kind with each of its widgets,
 * each committed to a pretend server.
 */
const meta: Meta = { title: 'Definitions/Pending lock' };
export default meta;

/** One field of each kind with each of its widgets. */
const EVERY_WIDGET: FieldDefinition[] = [
  { kind: 'boolean', id: 'boolSwitch', label: 'Boolean (switch)' },
  { kind: 'boolean', id: 'boolCheckbox', label: 'Boolean (checkbox)', widget: 'checkbox' },
  { kind: 'oneOf', id: 'oneOfSelect', label: 'One of (select)', choices: GRADES },
  { kind: 'oneOf', id: 'oneOfSegmented', label: 'One of (segmented)', choices: GRADES, widget: 'segmented' },
  { kind: 'oneOf', id: 'oneOfSlider', label: 'One of (slider)', choices: GRADES, widget: 'slider' },
  { kind: 'manyOf', id: 'manyOfCheckboxes', label: 'Many of (checkboxes)', choices: ROUNDS },
  { kind: 'manyOf', id: 'manyOfSelect', label: 'Many of (select)', choices: ROUNDS, widget: 'select' },
  { kind: 'manyOf', id: 'manyOfSwitches', label: 'Many of (switches)', choices: ROUNDS, widget: 'switches' },
  { kind: 'numeric', id: 'numericInput', label: 'Numeric (input)', min: 1, max: 60, integer: true },
  { kind: 'numeric', id: 'numericSlider', label: 'Numeric (slider)', min: 1, max: 5, integer: true, widget: 'slider' },
  { kind: 'range', id: 'range', label: 'Range (slider)', min: 2010, max: 2025, format: schoolYear },
  { kind: 'text', id: 'textInput', label: 'Text (input)', placeholder: 'Type, then Enter' },
  { kind: 'text', id: 'textSearch', label: 'Text (search)', placeholder: 'Type, then Enter', widget: 'search' },
  { kind: 'oneOfTree', id: 'oneOfTreePicker', label: 'One of tree (picker)', nodes: CATEGORIES },
  { kind: 'oneOfTree', id: 'oneOfTreeList', label: 'One of tree (list)', nodes: CATEGORIES, widget: 'list' },
  { kind: 'manyOfTree', id: 'manyOfTreePicker', label: 'Many of tree (picker)', nodes: CATEGORIES },
  { kind: 'manyOfTree', id: 'manyOfTreeChecklist', label: 'Many of tree (checklist)', nodes: CATEGORIES, widget: 'checklist' },
];

const INITIAL: Record<string, unknown> = {
  boolSwitch: false, boolCheckbox: true,
  oneOfSelect: 'any', oneOfSegmented: 'any', oneOfSlider: '10',
  manyOfCheckboxes: ['final'], manyOfSelect: ['final'], manyOfSwitches: ['final'],
  numericInput: 12, numericSlider: 3, range: [2015, 2020],
  textInput: '', textSearch: '',
  oneOfTreePicker: 'algebra', oneOfTreeList: 'algebra', manyOfTreePicker: ['oszthatosag'], manyOfTreeChecklist: ['oszthatosag'],
};

interface Args { latencyMs: number; appPending: boolean }

/** Slow actions as a button, a combined button and a context menu row, counting their fires. */
function Actions({ latencyMs }: { latencyMs: number }) {
  const { token } = theme.useToken();
  const [fires, setFires] = useState(0);
  const fire = async () => { setFires((n) => n + 1); await delay(latencyMs); };
  const generate = useAction({ id: 'generate', label: 'Generate', variant: 'primary', fire });
  const exportAll = useAction({ id: 'export', label: 'Export', fire });
  const archive = useAction({ id: 'archive', label: 'Archive', fire });
  const reindex = useAction({ id: 'reindex', label: 'Reindex', fire });
  return (
    <Space size={32} align="center" wrap>
      <Example label="ActionButton"><ActionButton action={generate} /></Example>
      <Example label="CombinedActionButton"><CombinedActionButton actions={[exportAll, archive]} /></Example>
      <Example label="ActionContextMenu (Shift+F10)">
        <ActionContextMenu actions={[reindex]}>
          <a href="#row" onClick={(e) => e.preventDefault()} style={{ padding: '4px 12px', borderRadius: token.borderRadiusSM, background: token.colorPrimary, color: token.colorTextLightSolid }}>
            Right-click me
          </a>
        </ActionContextMenu>
      </Example>
      <Example label="fires"><Tag data-testid="fires">{fires}</Tag></Example>
    </Space>
  );
}

export const EveryWidget: StoryObj<Args> = {
  name: 'Every widget, committed slowly',
  args: { latencyMs: 2000, appPending: false },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 6000, step: 250 } } },
  render: function Render({ latencyMs, appPending }) {
    const [values, setValues] = useState(INITIAL);
    return (
      <Showcase
        title="Every widget keeps the keyboard focus while pending"
        note="Each field is <Field item> committed to a pretend server (latencyMs). Tab to a widget and change it with the keyboard (arrows, Space, or typing and Enter): while the commit runs the widget is locked (it looks disabled, shows the spinner and changes nothing) but keeps the focus, so once it commits the keys work again where you left them. A list or tree open as pending starts closes and stays closed. 'appPending' makes every field pending for the app's own reason (the `pending` option), to see every locked widget at once; Tab still moves through them. Below, slow actions: press Enter on a button, then Enter again while it runs: the button is locked, keeps the focus, and fires once ('fires' counts). Or open the menu with Shift+F10 and pick its row (the menu closes), then open it again while the action runs: the row is locked (its spinner, the disabled look), keeps the focus, and Enter on it fires nothing."
      >
        <Form layout="vertical" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(300px, 420px))', columnGap: 48 }}>
          {EVERY_WIDGET.map((d) => (
            <Field
              key={d.id}
              item
              definition={d}
              pending={appPending}
              value={values[d.id] as never}
              commit={{ fire: async (next: unknown) => { await delay(latencyMs); setValues((v) => ({ ...v, [d.id]: next })); } }}
            />
          ))}
        </Form>
        <Actions latencyMs={latencyMs} />
      </Showcase>
    );
  },
};
