import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag } from 'antd';
import { useState } from 'react';
import { RangeSlider, denyWithReason, useRangeField, type NumberRange } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useRangeField: a field whose value is a `[from, to]` number range (moxb's
 * NumberRange), reusing numeric's bounds and formatting (min/max/step,
 * format). Praeceptor's school-years filter: each end a school year, shown
 * as e.g. '2010/11' by `format`; `valueText` joins both ends with an en
 * dash. The field renders as antd's Slider in `range` mode (RangeSlider).
 */
const meta: Meta = { title: 'Fields/Range' };
export default meta;

const schoolYear = (y: number) => `${y}/${String(y + 1).slice(-2)}`;

export const SchoolYears: StoryObj = {
  name: 'School years',
  render: function Render() {
    const field = useRangeField({
      id: 'report.schoolYears',
      label: 'School years',
      description: 'Which school years this report covers.',
      min: 2010, max: 2025, initialValue: [2015, 2022],
      format: schoolYear,
    });
    return (
      <Showcase
        title="School years"
        note="min/max and format: each handle's own tooltip and field.valueText (shown before the slider, showValue) use the school-year form '2010/11'; field.value stays the two plain years."
      >
        <Space size={32} align="center" wrap>
          <Example label="RangeSlider"><RangeSlider field={field} showValue /></Example>
          <Example label="field.value"><Tag>{field.value.join('–')}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

interface CommitArgs { latencyMs: number; confirmBeyondTenYears: boolean; readOnly: boolean }

export const CommittedWithConfirmation: StoryObj<CommitArgs> = {
  name: 'Value outside, committed with confirmation',
  args: { latencyMs: 900, confirmBeyondTenYears: true, readOnly: false },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ latencyMs, confirmBeyondTenYears, readOnly }) {
    // The pretend server: the stored value changes only when the commit succeeds.
    const [stored, setStored] = useState<NumberRange>([2018, 2023]);
    const field = useRangeField({
      id: 'report.schoolYears2',
      label: 'School years',
      description: 'Which school years this report covers.',
      min: 2000, max: 2025,
      format: schoolYear,
      enabled: readOnly ? denyWithReason('The report has been published.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (confirmBeyondTenYears && next[1] - next[0] > 10
          ? { kind: 'popconfirm', question: `Cover ${next[1] - next[0]} school years? That is a lot of data.` }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Value outside, committed with confirmation"
        note="value + commit: RangeSlider requests both ends at the end of a move (onChangeComplete), with the field's confirmation first (here when the range spans more than ten years). While the commit runs the field is pending (the lent Spinner, or antd's own); afterwards the slider shows the stored value. Use the controls panel for latency, confirmation and permission."
      >
        <Space size={32} align="center" wrap>
          <Example label="RangeSlider"><RangeSlider field={field} showValue /></Example>
          <Example label="stored on the server"><Tag color="green">{stored.join('–')}</Tag></Example>
          <Example label="field.pending"><Tag>{String(field.pending)}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

export const DisabledWithReason: StoryObj = {
  name: 'Disabled, with a reason',
  render: function Render() {
    const field = useRangeField({
      id: 'report.schoolYears3',
      label: 'School years',
      description: 'Which school years this report covers.',
      min: 2010, max: 2025, initialValue: [2015, 2022],
      format: schoolYear,
      enabled: denyWithReason('Fixed by the report template; duplicate the report to change it.'),
    });
    return (
      <Showcase
        title="Disabled, with a reason"
        note="enabled: denyWithReason - hovering the slider shows the reason; no change is possible."
      >
        <Space size={32} align="center" wrap>
          <Example label="RangeSlider"><RangeSlider field={field} showValue /></Example>
        </Space>
      </Showcase>
    );
  },
};
