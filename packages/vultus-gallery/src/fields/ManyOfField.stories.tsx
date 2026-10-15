import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag } from 'antd';
import { useState } from 'react';
import { ManyOfCheckboxes, ManyOfSwitches, denyWithReason, useManyOfField, type OneOfChoice } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useManyOfField: a field whose value is a set of choices (moxb's ManyOf).
 * Each choice has a label, an optional note (e.g. a count) and may be
 * disabled with a reason, or dimmed (still selectable, in the description
 * colour). The same field renders as ManyOfCheckboxes (one checkbox per
 * choice, its note after the label) or ManyOfSwitches (a small switch and
 * its clickable label per choice).
 */
const meta: Meta = { title: 'Fields/Many of' };
export default meta;

type Channel = 'email' | 'sms' | 'push' | 'slack';

function channelChoices(slackConnected: boolean): OneOfChoice<Channel>[] {
  return [
    { value: 'email', label: 'Email', note: '128' },
    { value: 'sms', label: 'SMS', note: '12' },
    { value: 'push', label: 'Push', note: '0', dimmed: true },
    { value: 'slack', label: 'Slack', enabled: slackConnected || denyWithReason('Connect a Slack workspace first.') },
  ];
}

interface ChannelsArgs { slackConnected: boolean; readOnly: boolean; vertical: boolean; latencyMs: number }

export const NotificationChannels: StoryObj<ChannelsArgs> = {
  name: 'Notification channels',
  args: { slackConnected: false, readOnly: false, vertical: false, latencyMs: 600 },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ slackConnected, readOnly, vertical, latencyMs }) {
    const [stored, setStored] = useState<Channel[]>(['email']);
    const field = useManyOfField<Channel>({
      id: 'notifications.channels',
      label: 'Notification channels',
      description: 'Where to send alerts.',
      choices: channelChoices(slackConnected),
      enabled: readOnly ? denyWithReason('The session has ended.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (next.length === 0
          ? { kind: 'popconfirm', question: 'Turn off every channel? You will miss alerts.' }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Notification channels"
        note="Every choice is always listed, selected or not. A disabled choice (Slack, until connected) shows its reason on hover, then its description; a dimmed one (Push: nothing sent yet) stays selectable, shown in the description colour; each choice's note (a recent count) follows its label. Hover a choice for its own tooltip; 'readOnly' disables the whole field instead, with its reason over the whole control. Clearing every channel asks a confirmation first. 'vertical' lays the choices out in a column. Changes commit to a pretend server (latency)."
      >
        <Space size={32} align="start" wrap>
          <Example label="ManyOfCheckboxes"><ManyOfCheckboxes field={field} vertical={vertical} /></Example>
          <Example label="ManyOfSwitches"><ManyOfSwitches field={field} vertical={vertical} /></Example>
          <Example label="field.value"><Tag>{field.value.join(', ') || '(none)'}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};
