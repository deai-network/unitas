import type { Meta, StoryObj } from '@storybook/react-vite';
import { Space, Tag } from 'antd';
import { useState } from 'react';
import {
  TreeChecklist, TreePicker, VultusProvider, coveredNodes, denyWithReason, useTreeField,
  type TreeExpand, type TreeNode, type TreeSelection, type VultusTexts,
} from 'vultus-antd';
import { Example, Showcase, delay } from '../Showcase.js';

/**
 * useTreeField: a field whose value is a set of tree nodes (moxb's Tree,
 * Praeceptor's category filter). Each node is a choice with children: a
 * label, an optional note (e.g. a count), maybe dimmed or disabled with a
 * reason. `selection` says which of the checked nodes the value lists
 * (`topmost`, the default: a checked node stands for its subtree), `expand`
 * which nodes open at first. TreePicker is antd's TreeSelect (Taskmaster's
 * category filter on a desktop): the value as tags, the tree in a dropdown
 * with a search, each node's note right-aligned. TreeChecklist is moxb's
 * always-open checkable tree with a search box, each note in brackets. On a
 * phone, TreePicker's `panel="drawer"` opens a TreeChecklist in a panel from
 * the bottom instead, and `summary="firstWords"` shows one line of the
 * selections' first words in place of the tags (Taskmaster's phone layout).
 */
const meta: Meta = { title: 'Fields/Tree' };
export default meta;

/** A competition-maths category tree, with the number of tasks filed under each category. */
const CATEGORIES: { value: string; label: string; tasks: number; children?: { value: string; label: string; tasks: number }[] }[] = [
  { value: 'algebra', label: 'Algebra', tasks: 12, children: [
    { value: 'egyenletek', label: 'Egyenletek', tasks: 7 },
    { value: 'egyenlotlensegek', label: 'Egyenlőtlenségek', tasks: 5 },
    { value: 'fuggvenyek', label: 'Függvények', tasks: 0 },
  ] },
  { value: 'szamelmelet', label: 'Számelmélet', tasks: 9, children: [
    { value: 'oszthatosag', label: 'Oszthatóság', tasks: 6 },
    { value: 'lnko', label: 'Osztók, legnagyobb közös osztó', tasks: 3 },
    { value: 'diofantoszi', label: 'Diofantoszi egyenletek', tasks: 0 },
  ] },
  { value: 'kombinatorika', label: 'Kombinatorika', tasks: 8, children: [
    { value: 'leszamlalas', label: 'Leszámlálás', tasks: 4 },
    { value: 'grafok', label: 'Gráfok és bejárásuk', tasks: 2 },
    { value: 'skatulya', label: 'Skatulya-elv', tasks: 2 },
  ] },
  { value: 'geometria', label: 'Geometria', tasks: 6, children: [
    { value: 'sikgeometria', label: 'Síkgeometria', tasks: 6 },
    { value: 'tergeometria', label: 'Térgeometria', tasks: 0 },
  ] },
  { value: 'logika', label: 'Logikai feladatok', tasks: 3 },
];

/** The categories as tree nodes: the count as the note, dimmed at zero; solid geometry disabled with a reason. */
function categoryNodes(): TreeNode[] {
  const node = (c: { value: string; label: string; tasks: number }): TreeNode => ({
    value: c.value,
    label: c.label,
    note: String(c.tasks),
    dimmed: c.tasks === 0,
    ...(c.value === 'tergeometria' ? { description: 'Solids and their surfaces.', enabled: denyWithReason('Not taught before grade 9.') } : {}),
  });
  return CATEGORIES.map((c) => ({ ...node(c), children: c.children?.map(node) }));
}

interface CategoryArgs { selection: TreeSelection; expand: TreeExpand; readOnly: boolean; latencyMs: number }

export const TaskCategories: StoryObj<CategoryArgs> = {
  name: 'Task categories (committed, with search)',
  args: { selection: 'topmost', expand: 'top', readOnly: false, latencyMs: 600 },
  argTypes: {
    selection: { control: 'inline-radio', options: ['topmost', 'all', 'leaves', 'independent'] },
    expand: { control: 'inline-radio', options: ['top', 'none', 'selected', 'all'] },
    latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } },
  },
  render: function Render({ selection, expand, readOnly, latencyMs }) {
    const [stored, setStored] = useState<string[]>(['kombinatorika', 'oszthatosag']);
    const field = useTreeField({
      id: 'tasks.categories',
      label: 'Categories',
      description: 'Show the tasks filed under these categories.',
      placeholder: 'All categories',
      nodes: categoryNodes(),
      selection,
      expand,
      enabled: readOnly ? denyWithReason('The task list is locked during the contest.') : true,
      value: stored,
      commit: {
        confirmation: (next) => (next.length === 0
          ? { kind: 'popconfirm', question: 'Remove the last category? The list will show every task again.' }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="Task categories"
        note="One field, two widgets. Each category shows its number of tasks, right-aligned in the picker's dropdown and in brackets in the checklist; a category with none is dimmed (still checkable); Térgeometria is disabled, its reason on hover. Checking a category checks its subtree, and the value lists what 'selection' says (topmost: the checked categories whose parent is not checked; 'independent' checks each node alone); the picker shows it as tags, as many as fit. Both searches ignore accents and case ('kombinatorika', 'oszthatosag', 'grafok'): they keep the matches, their ancestors and a match's whole subtree, all open; checking while searching keeps the categories the search hides. Unchecking the last category, or clearing the picker, asks first; each change commits to a pretend server (latency), the widgets disabled meanwhile. 'expand' sets which categories open at first; 'readOnly' disables the field, its reason over each widget."
      >
        <Space size={32} align="start" wrap>
          <Example label="TreePicker">
            <TreePicker key={expand} field={field} style={{ width: 380 }} />
          </Example>
          <Example label="TreeChecklist">
            <div style={{ width: 380 }}><TreeChecklist key={expand} field={field} /></div>
          </Example>
          <Example label="field.value"><Tag>{field.value.join(', ') || '(none)'}</Tag></Example>
          <Example label="stored on the server"><Tag color="green">{stored.join(', ') || '(none)'}</Tag></Example>
          <Example label="field.pending"><Tag>{String(field.pending)}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

/** The texts a phone panel writes itself, in the two languages the phone example offers. */
const PHONE_TEXTS: Record<'English' | 'Hungarian', Partial<VultusTexts>> = {
  English: {},
  Hungarian: { done: 'Kész', search: 'Keresés', joiningWords: ['és', 'a', 'az'] },
};

interface PhoneArgs { language: 'English' | 'Hungarian'; summary: 'firstWords' | 'tags'; latencyMs: number }

export const OnAPhone: StoryObj<PhoneArgs> = {
  name: 'On a phone (bottom panel, first-words summary)',
  args: { language: 'Hungarian', summary: 'firstWords', latencyMs: 600 },
  argTypes: {
    language: { control: 'inline-radio', options: ['English', 'Hungarian'] },
    summary: { control: 'inline-radio', options: ['firstWords', 'tags'] },
    latencyMs: { control: { type: 'range', min: 0, max: 3000, step: 100 } },
  },
  render: function Render({ language, summary, latencyMs }) {
    const [stored, setStored] = useState<string[]>(['lnko', 'grafok', 'logika']);
    const field = useTreeField({
      id: 'phone.categories',
      label: 'Categories',
      description: 'Show the tasks filed under these categories.',
      placeholder: 'All categories',
      nodes: categoryNodes(),
      value: stored,
      commit: {
        confirmation: (next) => (next.length === 0
          ? { kind: 'popconfirm', question: 'Remove the last category? The list will show every task again.' }
          : undefined),
        fire: async (next) => { await delay(latencyMs); setStored(next); },
      },
    });
    return (
      <Showcase
        title="On a phone"
        note="The same categories as a phone shows them (Taskmaster's narrow layout), in a 360px wide column. The closed field only shows the choice: one line of each selected category's first words ('summary: firstWords', about 16 characters each, 40 for a single one), never ending on a joining word ('Gráfok és…' in English, 'Gráfok…' with the Hungarian texts, whose joining words are 'és', 'a', 'az'). A tap on the field, anywhere but its clear icon, opens the tree in a panel from the bottom: the checklist with its search box (accent-insensitive, 'grafok') and the counts in brackets; each check commits at once (latency), Done closes the panel. Clearing, or unchecking the last category, asks first. 'summary: tags' keeps the tags with the panel; then a tag's remove icon removes it without opening the panel."
      >
        <Space size={32} align="start" wrap>
          <Example label={`TreePicker panel="drawer" summary="${summary}"`}>
            <VultusProvider texts={PHONE_TEXTS[language]}>
              <div style={{ width: 360, boxSizing: 'border-box', padding: 12, border: '1px dashed rgba(128, 128, 128, 0.5)', borderRadius: 16 }}>
                <TreePicker field={field} panel="drawer" summary={summary} style={{ width: 334 }} />
              </div>
            </VultusProvider>
          </Example>
          <Example label="field.value"><Tag>{field.value.join(', ') || '(none)'}</Tag></Example>
          <Example label="field.pending"><Tag>{String(field.pending)}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

type Area = 'frontend' | 'components' | 'styles' | 'backend' | 'api' | 'db' | 'docs';

const AREAS: TreeNode<Area>[] = [
  { value: 'frontend', label: 'Frontend', children: [
    { value: 'components', label: 'Components' },
    { value: 'styles', label: 'Styles' },
  ] },
  { value: 'backend', label: 'Backend', children: [
    { value: 'api', label: 'API' },
    { value: 'db', label: 'Database' },
  ] },
  { value: 'docs', label: 'Documentation' },
];

export const ValueInsideTheField: StoryObj<{ selection: TreeSelection }> = {
  name: 'Value inside the field',
  args: { selection: 'topmost' },
  argTypes: { selection: { control: 'inline-radio', options: ['topmost', 'all', 'leaves', 'independent'] } },
  render: function Render({ selection }) {
    const field = useTreeField<Area>({
      id: 'review.areas',
      label: 'Areas',
      description: 'Which parts of the code this review covers.',
      nodes: AREAS,
      selection,
      expand: 'all',
      initialValue: ['frontend', 'api'],
    });
    return (
      <Showcase
        title="Value inside the field"
        note="initialValue, every node open (expand: all), no notes. field.value lists the checked nodes as 'selection' says, and the picker's tags show the same nodes; coveredNodes lists every node the value stands for (what an item filed under some node matches against), whatever the selection."
      >
        <Space size={32} align="start" wrap>
          <Example label="TreePicker"><TreePicker field={field} style={{ width: 280 }} /></Example>
          <Example label="TreeChecklist"><div style={{ width: 280 }}><TreeChecklist field={field} /></div></Example>
          <Example label="field.value"><Tag>{field.value.join(', ') || '(none)'}</Tag></Example>
          <Example label="coveredNodes"><Tag>{coveredNodes(field.nodes, field.value, field.selection).join(', ') || '(none)'}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

export const DisabledWithReason: StoryObj = {
  name: 'Disabled, with a reason',
  render: function Render() {
    const field = useTreeField<Area>({
      id: 'review.areas.locked',
      label: 'Areas',
      description: 'Which parts of the code this review covers.',
      nodes: AREAS,
      initialValue: ['backend'],
      enabled: denyWithReason('The review has been **submitted**; its scope can no longer change.'),
    });
    return (
      <Showcase
        title="Disabled, with a reason"
        note="A disabled field shows its reason, then its description, over the whole widget: the picker cannot open; in the checklist every node is disabled, and its search still filters the view."
      >
        <Space size={32} align="start" wrap>
          <Example label="TreePicker"><TreePicker field={field} style={{ width: 280 }} /></Example>
          <Example label="TreeChecklist"><div style={{ width: 280 }}><TreeChecklist field={field} /></div></Example>
        </Space>
      </Showcase>
    );
  },
};
