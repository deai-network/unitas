import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { ActionButton, denyWithReason, useAction } from 'vultus-antd';
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
        <Example label='variant="danger"'><ActionButton action={remove} /></Example>
        <Example label="disabled with reason"><ActionButton action={locked} /></Example>
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
