import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card, Form, Space, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router';
import { FieldWidget, useFieldGroup, type FieldDefinition, type FieldGroup } from 'vultus-antd';
import { ReactRouterArgStore } from 'vultus-react-router';
import { Example, Showcase } from '../Showcase.js';

/**
 * Field groups: `useFieldGroup(definitions)` runs a list of definitions together, and every
 * option function of each one receives `ctx.values`, the group's values by field id. Here the
 * paper sizes on offer depend on the layout, and the copies show for one layout only. Each
 * field's controls render with `<FieldWidget item>`. A value that another field's change made
 * invalid shows the field's fallback, and shows again once it is valid again: nothing is
 * rewritten. The group keeps its values in its own state, or, with `{ stored: true }`, in the
 * nearest ArgStore: here the URL's query, through `<ReactRouterArgStore>` over a memory router.
 */
const meta: Meta = { title: 'Definitions/Field group' };
export default meta;

const A_SIZES = [{ value: 'a4', label: 'A4' }, { value: 'a5', label: 'A5' }];
const ALL_SIZES = [...A_SIZES, { value: 'letter', label: 'Letter' }];

/** The print dialog's options, as data: paper's choices and copies' visibility read the layout. */
const PRINT_OPTIONS: FieldDefinition[] = [
  {
    kind: 'oneOf', id: 'layout', label: 'Layout', widget: 'segmented',
    description: '**Rendered** sets the tasks anew for the sheet; **original** prints the scanned pages as they are.',
    choices: [{ value: 'rendered', label: 'Rendered' }, { value: 'original', label: 'Original' }],
  },
  {
    kind: 'oneOf', id: 'paper', label: 'Paper', description: 'The sheet size loaded in the printer.',
    choices: (ctx) => (ctx.values.layout === 'rendered' ? A_SIZES : ALL_SIZES),
  },
  {
    kind: 'numeric', id: 'copies', label: 'Copies', min: 1, max: 60, integer: true, description: 'One per **student**, usually.',
    visible: (ctx) => ctx.values.layout === 'original',
  },
];

/** The dialog: each field of the group as a labelled form item, and a reset counting the changed fields. */
function PrintCard({ group, onReset, children }: { group: FieldGroup; onReset: () => void; children?: ReactNode }) {
  return (
    <Card title="Print the task sheet" style={{ width: 380 }}>
      <Form layout="vertical">
        {group.fields.map((f) => <FieldWidget key={f.id} field={f} item />)}
      </Form>
      <Space>
        <Button disabled={group.changedCount === 0} onClick={onReset}>
          {group.changedCount === 0 ? 'Reset' : `Reset (${group.changedCount})`}
        </Button>
        {children}
      </Space>
    </Card>
  );
}

/** The group's values as the fields show them: a fallback, not the value kept under it. */
function ShownValues({ group }: { group: FieldGroup }) {
  return (
    <Example label="group.values">
      <Typography.Text code data-testid="values">{JSON.stringify(group.values)}</Typography.Text>
    </Example>
  );
}

function OwnStatePrint() {
  const group = useFieldGroup(PRINT_OPTIONS);
  return (
    <>
      <PrintCard group={group} onReset={() => group.resetAll()} />
      <ShownValues group={group} />
    </>
  );
}

export const OwnState: StoryObj = {
  name: 'Print dialog (the group\'s own state)',
  render: () => (
    <Showcase
      title="A print dialog whose options depend on each other"
      note="useFieldGroup(PRINT_OPTIONS), each field's controls rendered with <FieldWidget item>. Paper's choices read ctx.values.layout: A4 and A5 for the rendered layout, Letter too for the original one. Copies show for the original layout only; hidden, they keep their value. Choose Original, then Letter, then Rendered: paper shows its fallback, A4, but keeps Letter, which shows again once the layout is Original again. 'Reset' clears every kept value."
    >
      <OwnStatePrint />
    </Showcase>
  ),
};

function StoredPrint() {
  const group = useFieldGroup(PRINT_OPTIONS, { stored: true });
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <PrintCard group={group} onReset={() => group.resetAll('push')}>
        <Button onClick={() => navigate(-1)}>Back</Button>
      </PrintCard>
      <Space orientation="vertical" size={20}>
        <Example label="URL">
          <Typography.Text code data-testid="url" style={{ wordBreak: 'break-all' }}>{`${location.pathname}${location.search}`}</Typography.Text>
        </Example>
        <ShownValues group={group} />
      </Space>
    </>
  );
}

export const InTheUrl: StoryObj = {
  name: 'Print dialog in the URL (memory router)',
  render: function Render() {
    const [router] = useState(() => createMemoryRouter(
      [{
        path: '/',
        element: <ReactRouterArgStore><Outlet /></ReactRouterArgStore>,
        children: [{ path: 'print', element: <StoredPrint /> }],
      }],
      { initialEntries: ['/print?layout=original&paper=letter'] },
    ));
    return (
      <Showcase
        title="The same dialog, kept in the URL"
        note="useFieldGroup(PRINT_OPTIONS, { stored: true }) under <ReactRouterArgStore> inside a memory router: each field is stored under its id, the URL beside the dialog follows each change (a replace), and a field at its current default leaves the query. The page opened with the original layout and Letter paper. Choose Rendered: paper shows A4, since the rendered layout offers no Letter, while ?paper=letter stays in the URL; choose Original again and Letter is back. 'Reset' removes every key in one navigation, pushed, so Back brings the values back."
      >
        <RouterProvider router={router} />
      </Showcase>
    );
  },
};
