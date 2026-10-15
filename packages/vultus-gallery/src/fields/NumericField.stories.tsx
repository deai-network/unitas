import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag } from 'antd';
import { useState } from 'react';
import { NumericInput, NumericSlider, denyWithReason, useNumericField } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useNumericField: a field whose value is a single number (moxb's Numeric),
 * with bounds (min/max/step), an optional unit and formatting. The same
 * field renders as NumericInput (antd's InputNumber) and NumericSlider
 * (antd's Slider, which needs min and max).
 */
const meta: Meta = { title: 'Fields/Numeric' };
export default meta;

export const ValueInsideTheField: StoryObj = {
  name: 'Value inside the field',
  render: function Render() {
    const field = useNumericField({
      id: 'notification.volume',
      label: 'Volume',
      description: 'How loud notification sounds play.',
      min: 0, max: 100, initialValue: 40, unit: '%',
    });
    return (
      <Showcase
        title="Value inside the field"
        note="initialValue, min/max and unit; NumericInput and NumericSlider render the same field, so changing one moves the other."
      >
        <Space size={32} align="center" wrap>
          <Example label="NumericInput"><NumericInput field={field} /></Example>
          <Example label="NumericSlider"><NumericSlider field={field} showValue /></Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

interface CommitArgs { latencyMs: number; confirmAboveNinety: boolean; readOnly: boolean }

export const CommittedImmediately: StoryObj<CommitArgs> = {
  name: 'Value outside, committed immediately',
  args: { latencyMs: 900, confirmAboveNinety: true, readOnly: false },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ latencyMs, confirmAboveNinety, readOnly }) {
    // The pretend server: the stored value changes only when the commit succeeds.
    const [stored, setStored] = useState(60);
    const field = useNumericField({
      id: 'cpu.limit',
      label: 'CPU limit',
      description: 'The most CPU this task may use.',
      min: 0, max: 100, unit: '%',
      enabled: readOnly ? denyWithReason('The task has finished.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (confirmAboveNinety && next > 90
          ? { kind: 'popconfirm', question: `Raise the CPU limit to ${next}%?` }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Value outside, committed immediately"
        note="value + commit: NumericInput requests on blur, Enter or a stepper click; NumericSlider at the end of a drag (onChangeComplete) — each with the field's confirmation first (here above 90%). While the commit runs the field is pending (the lent Spinner, or antd's own); afterwards both widgets show the stored value. Use the controls panel for latency, confirmation and permission."
      >
        <Space size={32} align="center" wrap>
          <Example label="NumericInput"><NumericInput field={field} /></Example>
          <Example label="NumericSlider"><NumericSlider field={field} showValue /></Example>
          <Example label="stored on the server"><Tag color="green">{stored}</Tag></Example>
          <Example label="field.pending"><Tag>{String(field.pending)}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

export const DisabledWithReason: StoryObj = {
  name: 'Disabled, with a reason',
  render: function Render() {
    const field = useNumericField({
      id: 'retries',
      label: 'Retries',
      description: 'How many times a failed job retries.',
      min: 0, max: 10, initialValue: 3,
      enabled: denyWithReason('Fixed by the plan; upgrade to change it.'),
    });
    return (
      <Showcase
        title="Disabled, with a reason"
        note="enabled: denyWithReason - hovering either widget shows the reason; no change is possible."
      >
        <Space size={32} align="center" wrap>
          <Example label="NumericInput"><NumericInput field={field} /></Example>
          <Example label="NumericSlider"><NumericSlider field={field} /></Example>
        </Space>
      </Showcase>
    );
  },
};

export const IntegerFormattedStepped: StoryObj = {
  name: 'Integer, formatted, stepped',
  render: function Render() {
    const field = useNumericField({
      id: 'request.timeout',
      label: 'Timeout',
      description: 'How long a request waits before giving up.',
      min: 0, max: 120, step: 5, integer: true, initialValue: 30,
      format: (n) => `${n}s`,
    });
    return (
      <Showcase
        title="Integer, formatted, stepped"
        note="integer rounds every request (a typed fractional draft is rounded on commit); step moves NumericInput's stepper and NumericSlider's handle by 5; format names the unit its own way (seconds here), used for field.valueText and the slider handle's own tooltip."
      >
        <Space size={32} align="center" wrap>
          <Example label="NumericInput"><NumericInput field={field} /></Example>
          <Example label="NumericSlider"><NumericSlider field={field} showValue /></Example>
        </Space>
      </Showcase>
    );
  },
};
