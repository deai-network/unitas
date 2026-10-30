import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Card, Form, Space, Table, Tag, Typography } from 'antd';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router';
import { Field, argOf, setArg, stringType, useArg, useArgWriter, type ArgDefinition, type FieldDefinition } from 'vultus-antd';
import { ReactRouterArgStore, rest, useRouterArgStore, vanishing, type PathToken } from 'vultus-react-router';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * Arguments in the path and the fragment: `<ReactRouterArgStore path={[...]} fragment={...}>`, in a
 * route whose pattern ends in `*`, keeps some arguments in the path below that route and one in
 * `#…`; every other key stays in the query. Above the store they are all plain keys, so `useArg`
 * and `<Field stored>` read them as ever, and one write is one navigation across all three.
 * Changing a token that is not `independent` is going somewhere else: what the old place held
 * goes, except what the definitions call `permanent`.
 */
const meta: Meta<{ loaderMs: number }> = {
  title: 'Definitions/Path args',
  args: { loaderMs: 800 },
  argTypes: { loaderMs: { control: { type: 'range', min: 0, max: 5000, step: 100 } } },
};
export default meta;

/** A vanishing token's definition: its choices are the allowed values, and at its default, the first, the path has no segment for it. */
const VARIANT = {
  kind: 'oneOf', id: 'variant', label: 'Edition', widget: 'segmented',
  choices: [{ value: 'first', label: 'First' }, { value: 'revised', label: 'Revised' }],
} satisfies FieldDefinition;

/** The open task, a bare argument: what the path holds after the edition, slashes included. No task, no segment. */
const TASK: ArgDefinition<string> = { key: 'task', valueType: stringType, default: '' };

/** The reading place, kept in `#…`. */
const AT = { kind: 'text', id: 'at', label: 'Reading place (the fragment)', placeholder: '12.4' } satisfies FieldDefinition;

/** A filter of the place: it goes with it. */
const TOC = {
  kind: 'oneOf', id: 'toc', label: 'Section (a filter, not permanent)', widget: 'segmented',
  choices: [{ value: 'all', label: 'All' }, { value: 's19', label: 's19' }, { value: 's20', label: 's20' }],
} satisfies FieldDefinition;

/** A filter of the reader: it stays wherever the reader goes. */
const SIZE = {
  kind: 'oneOf', id: 'size', label: 'Text size (a filter, permanent)', widget: 'segmented', permanent: true,
  choices: [{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }],
} satisfies FieldDefinition;

const OPENED_AT = '/hu/pongracz/s19~modern?toc=s19&size=large#12.4';
const TASKS = ['s19~modern', 'a/b'];
const KEYS = [VARIANT.id, TASK.key, AT.id, TOC.id, SIZE.id];

/**
 * What a write said to the console, if anything. A refusal is a console warning and nothing else,
 * given as the write is made; to show it beside the button, the story listens in for that long.
 */
function warningDuring(write: () => void): string | undefined {
  const { warn } = console;
  let said: string | undefined;
  console.warn = (...args: unknown[]) => {
    said = args.join(' ');
    warn.apply(console, args);
  };
  try {
    write();
  } finally {
    console.warn = warn;
  }
  return said;
}

const shown = (value?: string) => <Typography.Text code>{value ?? 'undefined'}</Typography.Text>;

/** Every key as the store reads it (its own writes laid over the location) and as the rendered location holds it. */
function ReadAndRendered() {
  const store = useRouterArgStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  // A string, which compares equal while nothing changed.
  const snapshot = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(KEYS.map((key) => ({ key, read: store.read(key), rendered: store.readRendered(key) }))),
  );
  const rows = JSON.parse(snapshot) as { key: string; read?: string; rendered?: string }[];
  const ahead = rows.some(({ read, rendered }) => read !== rendered);
  return (
    <Example label="store.read(key) and store.readRendered(key)">
      <div data-testid="read-and-rendered">
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          dataSource={rows}
          columns={[
            { title: 'key', dataIndex: 'key' },
            { title: 'read', dataIndex: 'read', render: shown },
            { title: 'readRendered', dataIndex: 'rendered', render: shown },
          ]}
        />
      </div>
      <Tag data-testid="caught-up" color={ahead ? 'processing' : undefined} style={{ marginTop: 8 }}>
        {ahead ? 'The store is ahead of the URL' : 'The URL has caught up'}
      </Tag>
    </Example>
  );
}

/** The page in the route's element. What is below it is plain hooks: nothing here says where a key lives. */
function ModulePage() {
  const task = useArg(TASK);
  const write = useArgWriter();
  const location = useLocation();
  const navigate = useNavigate();
  const [mountedAt] = useState(() => new Date().toLocaleTimeString());
  const [refusal, setRefusal] = useState<{ warning: string; url: string }>();
  const url = `${location.pathname}${location.search}${location.hash}`;
  const tryTask = (value: string) => {
    const warning = warningDuring(() => task.set(value, 'push'));
    setRefusal(warning === undefined ? undefined : { warning, url });
  };
  return (
    <>
      <Card title="A module's page" style={{ width: 460 }}>
        <Form layout="vertical">
          <Field stored item definition={VARIANT} />
          <Form.Item label="Task (the rest of the path)">
            <Space wrap>
              <Button type={task.value === '' ? 'primary' : 'default'} onClick={() => task.set('', 'push')}>No task</Button>
              {TASKS.map((value) => (
                <Button key={value} type={task.value === value ? 'primary' : 'default'} onClick={() => task.set(value, 'push')}>{value}</Button>
              ))}
            </Space>
          </Form.Item>
          <Field stored item definition={AT} />
          <Field stored item definition={TOC} />
          <Field stored item definition={SIZE} />
        </Form>
        <Space orientation="vertical" size={12}>
          <Space wrap>
            <Button
              onClick={() => write(
                [setArg(argOf(TOC, {}), 's20'), setArg(argOf(AT, {}), '3.1'), setArg(TASK, 's19~modern')],
                'push',
              )}
            >
              s19~modern, section s20, at 3.1: one write
            </Button>
            <Button onClick={() => navigate(-1)}>Back</Button>
          </Space>
          <Space wrap>
            <Button danger onClick={() => tryTask('..')}>Try the task ..</Button>
            <Button danger onClick={() => tryTask('revised')}>Try the task revised</Button>
          </Space>
          {refusal?.url === url && (
            <Typography.Paragraph type="warning" data-testid="refusal" style={{ marginBottom: 0 }}>
              Refused. The console warned: <Typography.Text code>{refusal.warning}</Typography.Text> The URL stayed.
            </Typography.Paragraph>
          )}
        </Space>
      </Card>
      <Space orientation="vertical" size={20}>
        <Example label="URL">
          <Typography.Text code data-testid="url" style={{ wordBreak: 'break-all' }}>{url}</Typography.Text>
        </Example>
        <Example label="this page was mounted at"><Tag data-testid="mounted-at">{mountedAt}</Tag></Example>
        <ReadAndRendered />
      </Space>
    </>
  );
}

/** The story's memory router, with one route: the store in its element, a loader standing in for the page's data. */
function ModuleStory({ path, loaderMs, title, note }: { path: readonly PathToken[]; loaderMs: number; title: string; note: string }) {
  const router = useMemo(() => createMemoryRouter(
    [{
      id: 'module',
      path: ':lang/:module/*',
      // Until it is done the router stays where it was: the store is ahead of the URL.
      loader: async () => {
        await delay(loaderMs);
        return null;
      },
      element: <ReactRouterArgStore path={path} fragment={AT}><ModulePage /></ReactRouterArgStore>,
    }],
    { initialEntries: [OPENED_AT], hydrationData: { loaderData: { module: null } } },
  ), [path, loaderMs]);
  return <Showcase title={title} note={note}><RouterProvider router={router} /></Showcase>;
}

const ONE_PLACE_AFTER_ANOTHER = [vanishing(VARIANT), rest(TASK)];

export const GoingSomewhereElse: StoryObj<{ loaderMs: number }> = {
  name: 'A variant, a task and a place in the URL',
  render: ({ loaderMs }) => (
    <ModuleStory
      path={ONE_PLACE_AFTER_ANOTHER}
      loaderMs={loaderMs}
      title="Going somewhere else"
      note="The route is :lang/:module/* and its element is <ReactRouterArgStore path={[vanishing(VARIANT), rest(TASK)]} fragment={AT}>, in a memory router whose loader takes loaderMs. The page opened on the task s19~modern, at the place 12.4, with the section and the text size set. Click the task a/b: the path gets both its segments, the section and the reading place go with the old place, and the permanent text size stays (a push, so Back brings it all back). Choose the Revised edition: its segment appears before the task, and the task goes too, as it came after it; choose First and the segment vanishes, as First is the default. Change the section, the text size or the reading place: only the query or the fragment changes, nothing else goes. The one-write button names the task, the section and the place together, the task last: going somewhere else never cuts what its own write names, so all three land in one navigation. Each of these leaves the time this page was mounted as it was. Try the task .. : refused, a note says so beside the buttons, the console has the warning, the URL stays. Try the task revised while the edition is First: refused as well, as that segment would read as the edition; under Revised it is an ordinary task. After a write of the path or the query, for loaderMs, read shows the new values at once, also what the write removed, while the URL and readRendered still show the old ones and the tag says the store is ahead. A fragment-only write loads nothing, so there the gap is too short to see. Changing loaderMs restarts the page."
    />
  ),
};

const CHANGING_NOTHING_ELSE = [vanishing(VARIANT, { independent: true }), rest(TASK, { independent: true })];

export const IndependentTokens: StoryObj<{ loaderMs: number }> = {
  name: 'Independent tokens',
  render: ({ loaderMs }) => (
    <ModuleStory
      path={CHANGING_NOTHING_ELSE}
      loaderMs={loaderMs}
      title="Changing a token without going anywhere"
      note="The same page, with { independent: true } on both tokens: changing one is not going somewhere else. Click the task a/b: the path changes, and the section, the text size and the reading place all stay. Choose the Revised edition: its segment appears and the task stays after it. Nothing here depends on the filters being permanent. The refusals are those of the first story: they are about what the path can hold, not about what goes."
    />
  ),
};
