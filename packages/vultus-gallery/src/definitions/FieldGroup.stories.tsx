import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card, Form, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router';
import { FieldContextProvider, FieldWidget, useFieldGroup, type FieldDefinition, type FieldGroup } from 'vultus-antd';
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

/** The dialog: each field of the group as a labelled form item, and a reset counting the fields that do not show their defaults. */
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
      note="useFieldGroup(PRINT_OPTIONS), each field's controls rendered with <FieldWidget item>. Paper's choices read ctx.values.layout: A4 and A5 for the rendered layout, Letter too for the original one. Copies show for the original layout only; hidden, they keep their value. Choose Original, then Letter, then Rendered: paper shows its fallback, A4, but keeps Letter, which shows again once the layout is Original again. 'Reset' counts the fields that show something other than their default, and clears every kept value. A value kept behind a fallback (Letter under Rendered) is not counted (with nothing else changed, Reset is disabled), and comes back when its field allows it."
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
        note="useFieldGroup(PRINT_OPTIONS, { stored: true }) under <ReactRouterArgStore> inside a memory router: each field is stored under its id, the URL beside the dialog follows each change (a replace), and a field at its current default leaves the query. The page opened with the original layout and Letter paper. Choose Rendered: paper shows A4, since the rendered layout offers no Letter, while ?paper=letter stays in the URL; choose Original again and Letter is back. 'Reset' counts the fields that show something other than their default; a value kept behind a fallback (?paper=letter under Rendered) is not counted, and comes back when its field allows it. Reset removes every key in one navigation, pushed, so Back brings the values back."
      >
        <RouterProvider router={router} />
      </Showcase>
    );
  },
};

/** A reading page's options: the spelling is pending while the page has not yet shown the one asked for. */
const READING_OPTIONS: FieldDefinition[] = [
  {
    kind: 'oneOf', id: 'variant', label: 'Spelling', widget: 'segmented',
    description: 'How the text is spelled.',
    choices: [
      { value: 'modern', label: 'Modern', description: 'Today\'s spelling' },
      { value: 'original', label: 'Original', description: 'As first printed' },
    ],
    pending: (ctx) => ctx.settling.has('variant'),
  },
  {
    kind: 'oneOf', id: 'size', label: 'Text size', widget: 'segmented',
    choices: [{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }],
  },
];

const SAMPLE: Record<string, string> = {
  modern: 'A cél: a hit és az erkölcs tanítása.',
  original: 'A czél: a hit és az erkölcs tanítása.',
};

/** The page's fields and text; the text is in the spelling the page shows, not yet the one asked for. */
function ReadingCard({ shown }: { shown: string }) {
  const group = useFieldGroup(READING_OPTIONS, { stored: true });
  const location = useLocation();
  return (
    <>
      <Card title="Reading" style={{ width: 380 }}>
        <Form layout="vertical">
          {group.fields.map((f) => <FieldWidget key={f.id} field={f} item />)}
        </Form>
        <Typography.Paragraph style={{ fontSize: group.values.size === 'large' ? 20 : 14, marginBottom: 0 }}>
          {SAMPLE[shown]}
        </Typography.Paragraph>
      </Card>
      <Space orientation="vertical" size={20}>
        <Example label="URL">
          <Typography.Text code data-testid="url">{`${location.pathname}${location.search}`}</Typography.Text>
        </Example>
        <Example label="the page shows"><Tag>{shown}</Tag></Example>
        <Example label="spelling pending"><Tag>{String(group.byId.variant.pending)}</Tag></Example>
      </Space>
    </>
  );
}

/**
 * The page: it shows the spelling the URL asks for only `settleMs` later (standing in for a
 * document rendered anew), and until then tells its fields that 'variant' is settling.
 */
function ReadingPage({ settleMs }: { settleMs: number }) {
  const [params] = useSearchParams();
  const asked = params.get('variant') ?? 'modern';
  const [shown, setShown] = useState(asked);
  useEffect(() => {
    if (shown === asked) return undefined;
    const timer = setTimeout(() => setShown(asked), settleMs);
    return () => clearTimeout(timer);
  }, [asked, shown, settleMs]);
  const context = useMemo(() => ({ settling: new Set(shown === asked ? [] : ['variant']) }), [asked, shown]);
  return (
    <FieldContextProvider value={context}>
      <ReadingCard shown={shown} />
    </FieldContextProvider>
  );
}

export const Settling: StoryObj<{ settleMs: number }> = {
  name: 'Pending while the page settles',
  args: { settleMs: 1500 },
  argTypes: { settleMs: { control: { type: 'range', min: 0, max: 5000, step: 100 } } },
  render: function Render({ settleMs }) {
    const router = useMemo(() => createMemoryRouter(
      [{
        path: '/',
        element: <ReactRouterArgStore><Outlet /></ReactRouterArgStore>,
        children: [{ path: 'read', element: <ReadingPage settleMs={settleMs} /> }],
      }],
      { initialEntries: ['/read'] },
    ), [settleMs]);
    return (
      <Showcase
        title="A field pending for the app's own reason"
        note="useFieldGroup(READING_OPTIONS, { stored: true }) under <ReactRouterArgStore>; the spelling's definition says pending: (ctx) => ctx.settling.has('variant'). The page shows the spelling the URL asks for only settleMs later (standing in for a document rendered anew), and until then gives its fields settling = {'variant'} through <FieldContextProvider>. Choose Original: the URL changes at once, the spelling control locks with a spinner after it and its segment tooltips stay closed; once the text shows the original spelling (czél), the control is free again. Text size has no pending option and stays usable throughout. Changing settleMs restarts the page."
      >
        <RouterProvider router={router} />
      </Showcase>
    );
  },
};
