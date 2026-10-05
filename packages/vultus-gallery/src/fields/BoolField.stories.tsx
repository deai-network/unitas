import type { Meta, StoryObj } from '@storybook/react-vite';
import { Descriptions, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { BoolCheckbox, BoolSwitch, denyWithReason, useBoolField } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useBoolField (vultus-core) with its two widgets (vultus-antd). One field,
 * two looks: BoolSwitch and BoolCheckbox render the same controls object.
 */
const meta: Meta = { title: 'Fields/Boolean' };
export default meta;

function Both({ field }: { field: Parameters<typeof BoolSwitch>[0]['field'] }) {
  return (
    <Space size={32} align="center">
      <Example label="BoolSwitch"><BoolSwitch field={field} /></Example>
      <Example label="BoolCheckbox"><BoolCheckbox field={field} /></Example>
      <Example label="field.value"><Tag>{String(field.value)}</Tag></Example>
    </Space>
  );
}

export const ValueInsideTheField: StoryObj = {
  name: 'Value inside the field',
  render: function Render() {
    const field = useBoolField({ id: 'notify', label: 'Notify me', description: 'Send an e-mail when a sync fails.' });
    return (
      <Showcase title="Value inside the field" note="initialValue (default false); the field keeps its own state. Both widgets render the same field, so changing one moves the other.">
        <Both field={field} />
      </Showcase>
    );
  },
};

export const ValueOutsideLocal: StoryObj = {
  name: 'Value outside, changed locally',
  render: function Render() {
    const [value, setValue] = useState(true);
    const field = useBoolField({ id: 'autoplay', label: 'Autoplay', value, onChange: setValue });
    return (
      <Showcase title="Value outside, changed locally" note="value + onChange: the caller owns the value (a form, a parent's state); setting it is local and synchronous.">
        <Both field={field} />
        <Example label="caller's state"><Tag color="blue">{String(value)}</Tag></Example>
      </Showcase>
    );
  },
};

interface CommitArgs {
  latencyMs: number;
  outcome: 'ok' | 'warning' | 'error';
  confirmSwitchingOff: boolean;
  adminOnly: boolean;
  hidden: boolean;
}

export const CommittedImmediately: StoryObj<CommitArgs> = {
  name: 'Value outside, committed immediately',
  args: { latencyMs: 1200, outcome: 'ok', confirmSwitchingOff: true, adminOnly: false, hidden: false },
  argTypes: {
    latencyMs: { control: { type: 'range', min: 0, max: 4000, step: 200 } },
    outcome: { control: 'inline-radio', options: ['ok', 'warning', 'error'] },
  },
  render: function Render({ latencyMs, outcome, confirmSwitchingOff, adminOnly, hidden }) {
    // The pretend server: the stored value changes only when the commit succeeds.
    const [stored, setStored] = useState(true);
    const field = useBoolField({
      id: 'source.enabled',
      label: 'Enabled',
      hidden,
      enabled: adminOnly ? denyWithReason('Only admins can enable or disable a source.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (confirmSwitchingOff && !next
          ? { kind: 'popconfirm', question: 'Disable this source? Its entities stop syncing.' }
          : undefined),
        fire: async (next, ctx) => {
          await delay(latencyMs);
          if (outcome === 'error') throw { status: 500, body: { message: 'The server refused the change.' } };
          setStored(next);
          if (outcome === 'warning') ctx.warn('Done, but 3 entity-target pairs were skipped (known bad).');
        },
      },
    });
    return (
      <Showcase
        title="Value outside, committed immediately"
        note="value + commit: the change is stored by an action. While it runs the field is pending; afterwards it shows whatever the caller's value is (unchanged after a failure). Messages from the commit appear as toasts. Use the controls panel to change latency, outcome, confirmation, permission and visibility."
      >
        <Both field={field} />
        <Example label="stored on the server"><Tag color="green">{String(stored)}</Tag></Example>
        <Example label="field.pending"><Tag>{String(field.pending)}</Tag></Example>
        <Example label="field.messages">
          <Typography.Text code>{JSON.stringify(field.messages)}</Typography.Text>
        </Example>
      </Showcase>
    );
  },
};

export const ControlsObject: StoryObj = {
  name: 'What a widget receives',
  render: function Render() {
    const field = useBoolField({ id: 'demo', label: 'Demo', disabled: denyWithReason('Read-only in this view') });
    const { setValue: _s, toggle: _t, confirmationFor: _c, ...data } = field;
    return (
      <Showcase title="The controls object" note="Everything a field widget renders comes from the field's controls; setValue, toggle and confirmationFor are the functions next to these values.">
        <Descriptions bordered size="small" column={1} style={{ minWidth: 420 }}
          items={Object.entries(data).map(([key, value]) => ({ key, label: key, children: <code>{JSON.stringify(value)}</code> }))} />
      </Showcase>
    );
  },
};
