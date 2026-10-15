import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { SearchInput, TextInput, denyWithReason, useTextField } from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useTextField (vultus-core): a field whose value is a string. `control`
 * picks an `Input` or an `Input.TextArea` (TextInput); SearchInput is a
 * separate widget for the same kind of field, with a search icon,
 * `allowClear` and an `onEnter` callback.
 */
const meta: Meta = { title: 'Fields/Text' };
export default meta;

export const PlainInput: StoryObj = {
  name: 'Plain input',
  render: function Render() {
    const field = useTextField({ id: 'display.name', label: 'Display name', description: 'Shown to other people.', placeholder: 'e.g. Ada' });
    return (
      <Showcase
        title="Plain input"
        note="Value inside the field (no value/onChange/commit): every keystroke requests at once, so field.value follows the input directly."
      >
        <Space size={32} align="center" wrap>
          <Example label="TextInput"><TextInput field={field} /></Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

export const Textarea: StoryObj = {
  name: 'Textarea',
  render: function Render() {
    const [value, setValue] = useState('Loves long walks on the beach.');
    const field = useTextField({ id: 'bio', label: 'Bio', control: 'textarea', description: 'A short bio shown on the profile.', value, onChange: setValue });
    return (
      <Showcase
        title="Textarea"
        note="control: 'textarea' renders Input.TextArea instead of Input. Value outside, changed locally (onChange): still requests on every keystroke, same as the plain input."
      >
        <Space size={32} align="start" wrap>
          <Example label="TextInput"><TextInput field={field} style={{ width: 280 }} /></Example>
          <Example label="field.value"><Typography.Text code>{value}</Typography.Text></Example>
        </Space>
      </Showcase>
    );
  },
};

export const Search: StoryObj = {
  name: 'Search, with onEnter',
  render: function Render() {
    const [value, setValue] = useState('');
    const [ran, setRan] = useState<string[]>([]);
    const field = useTextField({ id: 'query', label: 'Search', value, onChange: setValue, placeholder: 'Search tasks…' });
    return (
      <Showcase
        title="Search, with onEnter"
        note="SearchInput: a search icon (inline SVG) as the prefix, allowClear (requests ''), Esc also clears. onEnter fires after Enter's request — here it just records a 'search run' with the field's own value (Praeceptor would feed quaesitor's highlighting from it)."
      >
        <Space size={32} align="start" wrap>
          <Example label="SearchInput">
            <SearchInput field={field} onEnter={() => setRan((prev) => [...prev, field.value])} />
          </Example>
          <Example label="field.value"><Tag>{value || '(empty)'}</Tag></Example>
          <Example label="searches run (Enter)">
            <Typography.Text code>{ran.length ? ran.join(', ') : '(none yet)'}</Typography.Text>
          </Example>
        </Space>
      </Showcase>
    );
  },
};

interface CommitArgs { latencyMs: number; confirmShortNames: boolean; readOnly: boolean }

export const CommittedWithConfirmation: StoryObj<CommitArgs> = {
  name: 'Commit, with pending and confirmation',
  args: { latencyMs: 900, confirmShortNames: true, readOnly: false },
  argTypes: { latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } } },
  render: function Render({ latencyMs, confirmShortNames, readOnly }) {
    // The pretend server: the stored value changes only when the commit succeeds.
    const [stored, setStored] = useState('Ada Lovelace');
    const field = useTextField({
      id: 'team.name',
      label: 'Team name',
      description: 'Shown on the team\'s public page.',
      enabled: readOnly ? denyWithReason('The team has been archived.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (confirmShortNames && next.trim().length > 0 && next.trim().length < 4
          ? { kind: 'popconfirm', question: `"${next}" is quite short — use it anyway?` }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Commit, with pending and confirmation"
        note="value + commit: TextInput keeps a draft while typing and requests only on blur or Enter, each with the field's confirmation first (here, a name under 4 characters). While the commit runs the field is pending (the lent Spinner, or antd's own Spin); afterwards it shows the stored value. Use the controls panel for latency, confirmation and permission."
      >
        <Space size={32} align="center" wrap>
          <Example label="TextInput"><TextInput field={field} /></Example>
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
    const field = useTextField({
      id: 'slug',
      label: 'URL slug',
      description: 'The short name used in links.',
      initialValue: 'ada-lovelace',
      enabled: denyWithReason('Fixed once the page has been published.'),
    });
    const search = useTextField({
      id: 'locked.query',
      label: 'Search',
      initialValue: '',
      enabled: denyWithReason('Search is disabled while reindexing.'),
    });
    return (
      <Showcase
        title="Disabled, with a reason"
        note="enabled: denyWithReason — hovering either widget shows the reason; no change is possible."
      >
        <Space size={32} align="center" wrap>
          <Example label="TextInput"><TextInput field={field} /></Example>
          <Example label="SearchInput"><SearchInput field={search} /></Example>
        </Space>
      </Showcase>
    );
  },
};
