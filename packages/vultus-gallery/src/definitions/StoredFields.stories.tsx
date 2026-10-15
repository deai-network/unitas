import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Form, Space, Typography } from 'antd';
import { useState } from 'react';
import { Outlet, RouterProvider, createMemoryRouter, useLocation, useNavigate } from 'react-router';
import { Field, useStoredFields } from 'vultus-antd';
import { ReactRouterArgStore } from 'vultus-react-router';
import { Showcase } from '../Showcase.js';
import { TASK_FILTERS } from './taskFilters.js';

/**
 * Stored fields: `<Field stored definition={d} />` keeps the value in the nearest ArgStore,
 * here the URL's query through vultus-react-router's `<ReactRouterArgStore>` over a memory
 * router. Each field is stored under its `id`; a field showing its default leaves the query;
 * lists stay readable (`rounds=final,regional`, `years=2015..2020`). `useStoredFields` counts
 * the fields that are not at their defaults and clears them all in one navigation.
 */
const meta: Meta = { title: 'Definitions/Stored fields' };
export default meta;

function FilterPanel() {
  const { changedCount, resetAll } = useStoredFields(TASK_FILTERS);
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div style={{ width: 440 }}>
      <Form layout="vertical">
        {TASK_FILTERS.map((d) => <Field key={d.id} stored item definition={d} />)}
      </Form>
      <Space>
        <Button disabled={changedCount === 0} onClick={() => resetAll('push')}>
          {changedCount === 0 ? 'Clear all' : `Clear all (${changedCount})`}
        </Button>
        <Button onClick={() => navigate(-1)}>Back</Button>
      </Space>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        URL: <Typography.Text code data-testid="url" style={{ wordBreak: 'break-all' }}>{`${location.pathname}${location.search}`}</Typography.Text>
      </Typography.Paragraph>
    </div>
  );
}

export const FiltersInTheUrl: StoryObj = {
  name: 'Filters in the URL (memory router)',
  render: function Render() {
    const [router] = useState(() => createMemoryRouter(
      [{
        path: '/',
        element: <ReactRouterArgStore><Outlet /></ReactRouterArgStore>,
        children: [{ path: 'modules/:module', element: <FilterPanel /> }],
      }],
      { initialEntries: ['/modules/kmo?rounds=final,regional&years=2015..2020'] },
    ));
    return (
      <Showcase
        title="A task module's filters, kept in the URL"
        note="Every field is <Field stored item>, under <ReactRouterArgStore> inside a memory router; the URL under the fields follows each change (a replace, so typing does not fill the history). A field back at its default leaves the query. 'Clear all' resets every field in one navigation, pushed, so Back brings the filters back. The page opened with rounds and years already in the URL."
      >
        <RouterProvider router={router} />
      </Showcase>
    );
  },
};
