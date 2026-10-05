import type { Meta, StoryObj } from '@storybook/react-vite';
import { List, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { BoolCheckbox, BoolSwitch, aggregateBool, denyWithReason, useBoolField, useMixedBoolField } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useMixedBoolField: a boolean field over an aggregate. It shows on, off or
 * mixed and can be asked for on or off; the same BoolSwitch and BoolCheckbox
 * render it. The story mirrors the connection card's autopilot: each entity
 * has its own autopilot switch, the aggregate switches all of them.
 */
const meta: Meta = { title: 'Fields/Mixed boolean' };
export default meta;

interface Item { id: string; name: string; on: boolean; knownBad?: boolean }

const initialItems: Item[] = [
  { id: 'channels', name: 'Slack channels', on: true },
  { id: 'messages', name: 'Slack messages', on: false },
  { id: 'users', name: 'Slack users', on: true },
  { id: 'files', name: 'Slack files', on: false, knownBad: true },
];

/** One entity's own autopilot switch, committed to the pretend server. */
function ItemRow({ item, latencyMs, setOn }: { item: Item; latencyMs: number; setOn: (on: boolean) => void }) {
  const field = useBoolField({
    id: `entity.autopilot:${item.id}`,
    label: `Autopilot for ${item.name}`,
    value: item.on,
    enabled: item.knownBad ? denyWithReason('Its sync is known to fail: a required recipe is missing.') : true,
    valueDescriptions: { true: 'On autopilot.', false: 'Not on autopilot.' },
    commit: { fire: async (next) => { await delay(latencyMs); setOn(next); } },
  });
  return (
    <List.Item extra={<BoolSwitch field={field} size="small" />}>
      <Space>{item.name}{item.knownBad && <Tag color="warning">known bad</Tag>}</Space>
    </List.Item>
  );
}

interface Args { latencyMs: number; withItems: boolean }

export const Aggregate: StoryObj<Args> = {
  name: 'Aggregate over items (autopilot)',
  args: { latencyMs: 900, withItems: true },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ latencyMs, withItems }) {
    const [items, setItems] = useState(initialItems);
    const shown = withItems ? items : [];
    const setOn = (id: string, on: boolean) => setItems((all) => all.map((i) => (i.id === id ? { ...i, on } : i)));
    const value = aggregateBool(shown.map((i) => i.on));
    const autopilot = useMixedBoolField({
      id: 'connection.autopilot',
      label: 'Autopilot',
      description: 'Runs the syncs of this connection\'s entities unattended.',
      valueDescriptions: {
        true: 'All entities are on autopilot. Click to turn it off for all.',
        false: 'No entity is on autopilot. Click to turn it on for all.',
        mixed: 'Some entities are on autopilot, but not all. Click to turn it on for all, double-click to turn it off for all.',
      },
      enabled: value === undefined ? denyWithReason('This connection has no entities with targets yet.') : true,
      value: value ?? false,
      commit: {
        fire: async (next, ctx) => {
          await delay(latencyMs);
          const skipped = next ? items.filter((i) => i.knownBad && !i.on).length : 0;
          setItems((all) => all.map((i) => (next && i.knownBad ? i : { ...i, on: next })));
          if (skipped) ctx.warn(`Autopilot is on; ${skipped} entity was skipped because its sync is known to fail.`);
        },
      },
    });
    return (
      <Showcase
        title="Aggregate over items"
        note="The aggregate's value is derived (aggregateBool) from the items' own switches: change an item and the aggregate follows. A click on the aggregate turns all on (from off or mixed) or all off (from on); from mixed, a double click turns all off. The known-bad item cannot be turned on and is reported as skipped, so after turning all on the aggregate stays mixed: double-click to turn all off. Hover the switches for their texts. With no items the aggregate is disabled with a reason (toggle 'withItems')."
      >
        <Space size={32} align="center">
          <Example label="BoolSwitch"><BoolSwitch field={autopilot} /></Example>
          <Example label="BoolCheckbox"><BoolCheckbox field={autopilot} /></Example>
          <Example label="field.value"><Tag>{String(autopilot.value)}</Tag></Example>
        </Space>
        <div style={{ width: 420 }}>
          <Typography.Text type="secondary">Entities</Typography.Text>
          <List size="small" bordered dataSource={shown} locale={{ emptyText: 'No entities' }}
            renderItem={(item) => <ItemRow key={item.id} item={item} latencyMs={latencyMs} setOn={(on) => setOn(item.id, on)} />} />
        </div>
      </Showcase>
    );
  },
};
