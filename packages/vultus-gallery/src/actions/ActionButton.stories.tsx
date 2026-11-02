import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeleteOutlined, DoubleRightOutlined, PlayCircleOutlined, RightOutlined, SettingOutlined } from '@ant-design/icons';
import { Card, Switch } from 'antd';
import { ActionButton, CombinedActionButton, denyWithReason, useAction } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/** ActionButton renders an action descriptor (useAction). */
const meta: Meta = { title: 'Actions/ActionButton' };
export default meta;

export const Kinds: StoryObj = {
  name: 'Variants, pending, disabled',
  render: function Render() {
    const run = useAction({ id: 'run', label: 'Run', variant: 'primary', icon: <PlayCircleOutlined />, fire: () => delay(1500) });
    const plain = useAction({ id: 'plain', label: 'Refresh', fire: () => delay(600) });
    const remove = useAction({ id: 'remove', label: 'Delete', variant: 'danger', icon: <DeleteOutlined />, fire: () => delay(600) });
    const locked = useAction({ id: 'locked', label: 'Publish', variant: 'primary', enabled: denyWithReason('Only **admins** can publish.'), fire: () => {} });
    return (
      <Showcase title="Variants" note="Click to see pending (the button spins until fire resolves). A disabled action shows its reason (markdown) on hover.">
        <Example label='variant="primary"'><ActionButton action={run} /></Example>
        <Example label="default"><ActionButton action={plain} /></Example>
        <Example label="iconOnly (label = name + tooltip)"><ActionButton action={remove} iconOnly /></Example>
        <Example label='variant="danger"'><ActionButton action={remove} /></Example>
        <Example label="disabled with reason"><ActionButton action={locked} /></Example>
      </Showcase>
    );
  },
};

export const TextButtons: StoryObj = {
  name: 'Text buttons (menus)',
  render: function Render() {
    const recreate = useAction({ id: 'recreate', label: 'Re-create source', fire: () => delay(600) });
    const remove = useAction({ id: 'remove-text', label: 'Delete', variant: 'danger', icon: <DeleteOutlined />,
      confirmation: { kind: 'popconfirm', question: 'Delete this connection?' }, fire: () => delay(600) });
    return (
      <Showcase title="buttonVariant" note='buttonVariant="text" for the actions of a menu or pop-up panel; the action&apos;s own variant still picks the colour (here danger for Delete).'>
        <Example label='buttonVariant="text", block, align="start"'>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 220 }}>
            <ActionButton action={recreate} buttonVariant="text" block align="start" />
            <ActionButton action={remove} buttonVariant="text" block align="start" />
          </div>
        </Example>
      </Showcase>
    );
  },
};

interface CombinedIconOnlyArgs { firstDisabled: boolean }

export const CombinedIconOnly: StoryObj<CombinedIconOnlyArgs> = {
  name: 'Combined, iconOnly',
  args: { firstDisabled: false },
  render: function Render({ firstDisabled }) {
    const next = useAction({
      id: 'next', label: 'Next in the filtered list', icon: <RightOutlined />,
      enabled: firstDisabled ? denyWithReason('No more tasks in the **filtered** list.') : true,
      fire: () => delay(400),
    });
    const nextAll = useAction({ id: 'next-all', label: 'Next, ignoring the filters', icon: <DoubleRightOutlined />, fire: () => delay(400) });
    return (
      <Showcase title="iconOnly on a combined button" note="The main half shows only the icon of the action it would run now; hover it for that action's label. 'firstDisabled' disables the first action: the main half moves on to the next enabled one, and its icon (› to ») and label switch with it. The switch also works after a click, because keepOriginalDefault returns the main half to the first enabled action after each fire (without it, a click is a pick that holds the main half). The ⋯ list keeps every action's label and icon, a disabled one greyed with its reason on hover.">
        <Example label="CombinedActionButton iconOnly keepOriginalDefault"><CombinedActionButton actions={[next, nextAll]} iconOnly keepOriginalDefault /></Example>
      </Showcase>
    );
  },
};

export const ShowHidePair: StoryObj = {
  name: 'Show/hide pair (ariaExpanded)',
  render: function Render() {
    const [shown, setShown] = useState(false);
    const show = useAction({
      id: 'show-settings', label: 'Show settings', icon: <SettingOutlined />,
      invisible: shown, ariaExpanded: false, fire: () => setShown(true),
    });
    const hide = useAction({
      id: 'hide-settings', label: 'Hide settings', icon: <SettingOutlined />,
      invisible: !shown, ariaExpanded: true, fire: () => setShown(false),
    });
    return (
      <Showcase title="A settings gear" note="Two actions, one visible at a time: show (ariaExpanded false) and hide (ariaExpanded true). The gear renders the visible one, so it carries aria-expanded, and a screen reader says whether the panel is open.">
        <Example label="ActionButton action={[show, hide]} iconOnly">
          <ActionButton action={[show, hide]} iconOnly />
          {shown && (
            <Card size="small" style={{ marginTop: 8, width: 220 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label><Switch size="small" /> Show the notes</label>
                <label><Switch size="small" /> Show the answers</label>
              </div>
            </Card>
          )}
        </Example>
      </Showcase>
    );
  },
};

export const Confirmations: StoryObj = {
  render: function Render() {
    const pop = useAction({ id: 'pop', label: 'Archive', confirmation: { kind: 'popconfirm', question: 'Archive this project?' }, fire: () => delay(400) });
    const cascade = useAction({
      id: 'cascade', label: 'Delete source', variant: 'danger',
      confirmation: { kind: 'cascade-modal', title: 'Delete source?', content: 'Its 12 entities and their sync history are deleted too.' },
      fire: () => delay(400),
    });
    const typing = useAction({
      id: 'typing', label: 'Delete dataspace', variant: 'danger',
      confirmation: { kind: 'typing', title: 'Delete dataspace', entityName: 'acme-prod', description: 'This cannot be undone.' },
      fire: () => delay(400),
    });
    return (
      <Showcase title="Confirmations" note="The three ConfirmationSpec kinds; the same wrapper (Confirmable) serves the boolean fields.">
        <Example label="popconfirm"><ActionButton action={pop} /></Example>
        <Example label="cascade-modal"><ActionButton action={cascade} /></Example>
        <Example label="typing"><ActionButton action={typing} /></Example>
      </Showcase>
    );
  },
};

export const Messages: StoryObj = {
  name: 'Messages (ExecutionContext)',
  render: function Render() {
    const info = useAction({ id: 'info', label: 'Report info', fire: async (_a, ctx) => { await delay(300); ctx.info('Index rebuilt in 2.4 s.'); } });
    const warn = useAction({ id: 'warn', label: 'Report a warning', fire: async (_a, ctx) => { await delay(300); ctx.warn('Done, but 3 pairs were skipped.'); } });
    const err = useAction({ id: 'err', label: 'Report an error', fire: async (_a, ctx) => { await delay(300); ctx.error('One of 5 items failed.'); } });
    const fail = useAction({ id: 'fail', label: 'Fail', fire: async () => { await delay(300); throw { status: 409, body: { message: 'Conflict: renamed meanwhile.' } }; } });
    return (
      <Showcase title="Messages" note="fire(args, ctx): ctx.info / warn / error report messages while the action runs; VultusProvider shows them as toasts by severity. A thrown error fails the action (here an API-shaped 409).">
        <Example label="ctx.info"><ActionButton action={info} /></Example>
        <Example label="ctx.warn"><ActionButton action={warn} /></Example>
        <Example label="ctx.error"><ActionButton action={err} /></Example>
        <Example label="throw"><ActionButton action={fail} /></Example>
      </Showcase>
    );
  },
};
