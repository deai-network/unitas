import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Segmented, Space, Tag, Typography, theme } from 'antd';
import { useEffect, useState, type MouseEvent } from 'react';
import { Outlet, RouterProvider, createHashRouter, useLocation } from 'react-router';
import {
  FieldWidget, OneOfTreeList, OneOfTreePicker, denyWithReason, useOneOfTreeField, useStoredField,
  type FieldDefinition, type OneOfTreeNodeControls, type TreeNode,
} from 'vultus-antd';
import { ReactRouterArgStore } from 'vultus-react-router';
import { Example, Showcase } from '../Showcase.js';

/**
 * useOneOfTreeField: a field whose value is a single tree node, or nothing (Praeceptor's
 * category picker, a table of contents). `choose: 'any' | 'leaves'` and a per-node
 * `choosable: false` together say which nodes may be chosen; `optional` says whether nothing
 * chosen ('') is one of them too. OneOfTreePicker is antd's TreeSelect, single: the closed
 * field shows the chosen node's label, or, with `summary="path"`, its path; `panel="drawer"`
 * opens an OneOfTreeList of the field from the bottom, for a phone. OneOfTreeList is an
 * always-open tree, no checkboxes: a sidebar, a table of contents, each node a real `<a href>`
 * where the field's `hrefFor` gives one.
 */
const meta: Meta = { title: 'Fields/One of tree' };
export default meta;

/** A leaf category, with its task count as the note, dimmed at zero. */
const leaf = (value: string, label: string, tasks: number): TreeNode => ({ value, label, note: String(tasks), dimmed: tasks === 0 });

/**
 * A competition-maths category tree: three folders with children, a lone leaf, and one node
 * ('egyeb') that is `choosable: false` on its own, with no children — a heading, not a category.
 */
const CATEGORIES: TreeNode[] = [
  { ...leaf('algebra', 'Algebra', 12), children: [
    leaf('egyenletek', 'Egyenletek', 7),
    leaf('egyenlotlensegek', 'Egyenlőtlenségek', 5),
    leaf('fuggvenyek', 'Függvények', 0),
  ] },
  { ...leaf('szamelmelet', 'Számelmélet', 9), children: [
    leaf('oszthatosag', 'Oszthatóság', 6),
    leaf('lnko', 'Osztók, legnagyobb közös osztó', 3),
  ] },
  { ...leaf('geometria', 'Geometria', 6), children: [
    leaf('sikgeometria', 'Síkgeometria', 6),
    { ...leaf('tergeometria', 'Térgeometria', 0), description: 'Solids and their surfaces.', enabled: denyWithReason('Not taught before grade 9.') },
  ] },
  leaf('logika', 'Logikai feladatok', 3),
  { value: 'egyeb', label: 'Egyéb (no category of its own)', choosable: false },
];

export const CategoryPicker: StoryObj = {
  name: 'Category picker (leaves only, folders, path summary)',
  render: function Render() {
    const field = useOneOfTreeField({
      id: 'category',
      label: 'Category',
      description: 'Which category this task is filed under.',
      placeholder: 'All categories',
      nodes: CATEGORIES,
      choose: 'leaves',
      optional: true,
    });
    return (
      <Showcase
        title="Category picker"
        note="choose: 'leaves' turns every category with children into a folder: clicking one only opens or closes it, as 'Egyéb' already is on its own ('choosable: false', with no children of its own). Each leaf shows its task count as a note, right-aligned, dimmed at zero (Függvények); Térgeometria is disabled, its reason on hover. 'summary: path' shows the chosen leaf's whole path in the closed field ('Geometria › Síkgeometria'); optional with no value shows the placeholder, never the raw ''."
      >
        <Space size={32} align="start" wrap>
          <Example label='OneOfTreePicker summary="path"'>
            <OneOfTreePicker field={field} summary="path" style={{ width: 380 }} />
          </Example>
          <Example label="field.value"><Tag>{field.value || '(none)'}</Tag></Example>
          <Example label="field.current?.label"><Tag>{field.current?.label ?? '(none)'}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

export const OnAPhone: StoryObj = {
  name: 'On a phone (bottom panel)',
  render: function Render() {
    const field = useOneOfTreeField({
      id: 'phone.category',
      label: 'Category',
      description: 'Which category this task is filed under.',
      nodes: CATEGORIES,
      choose: 'leaves',
      initialValue: 'sikgeometria',
    });
    return (
      <Showcase
        title="On a phone"
        note='panel="drawer" keeps the closed field to showing the chosen label only (no dropdown, no search of its own); a tap opens an OneOfTreeList of the same field, search box included, in a panel from the bottom. Choosing a leaf closes the drawer at once — there is no Done button; a tap on a folder only opens or closes it.'
      >
        <Space size={32} align="start" wrap>
          <Example label='OneOfTreePicker panel="drawer"'>
            <div style={{ width: 360, boxSizing: 'border-box', padding: 12, border: '1px dashed rgba(128, 128, 128, 0.5)', borderRadius: 16 }}>
              <OneOfTreePicker field={field} panel="drawer" style={{ width: 334 }} />
            </div>
          </Example>
          <Example label="field.value"><Tag>{field.value}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

export const CategoryList: StoryObj = {
  name: 'List (optional, search)',
  render: function Render() {
    const field = useOneOfTreeField({
      id: 'list.category',
      label: 'Category',
      description: 'Which category this task is filed under.',
      placeholder: 'All categories',
      nodes: CATEGORIES,
      choose: 'leaves',
      optional: true,
    });
    return (
      <Showcase
        title="List"
        note="An always-open OneOfTreeList: the optional row shows the placeholder ('All categories') and is selected while the value is empty. The search box (accent- and case-insensitive — try 'oszthatosag') keeps a match with its whole subtree and its ancestors open; the other nodes are only hidden. Clicking a leaf selects it; a folder's click opens or closes it instead."
      >
        <Space size={32} align="start" wrap>
          <Example label="OneOfTreeList search">
            <div style={{ width: 320 }}><OneOfTreeList field={field} search /></div>
          </Example>
          <Example label="field.value"><Tag>{field.value || '(none)'}</Tag></Example>
        </Space>
      </Showcase>
    );
  },
};

/** The categories' labels in the older Hungarian terms (mértan for geometria): the values kept, as a spelling variant keeps them. */
const OLD_TERMS: Record<string, string> = { geometria: 'Mértan', sikgeometria: 'Síkmértan', tergeometria: 'Térmértan' };
const inOldTerms = (nodes: TreeNode[]): TreeNode[] => nodes.map((node) => ({
  ...node, label: OLD_TERMS[node.value] ?? node.label, children: node.children && inOldTerms(node.children),
}));
const OLD_CATEGORIES = inOldTerms(CATEGORIES);

/** The categories new this term: their label gets a highlighted suffix. */
const NEW_THIS_TERM = new Set(['egyenlotlensegek', 'lnko']);

/**
 * A label that lights up when its text changes (as harma-style's ChangingText does in
 * Praeceptor): it keeps the text it showed in its state, so it lights up only while the tree
 * keeps it mounted across the change.
 */
function LightingLabel({ text }: { text: string }) {
  const { token } = theme.useToken();
  const [shown, setShown] = useState(text);
  const [lit, setLit] = useState(false);
  if (shown !== text) {
    setShown(text);
    setLit(true);
  }
  useEffect(() => {
    if (!lit) return undefined;
    const timer = setTimeout(() => setLit(false), 1200);
    return () => clearTimeout(timer);
  }, [lit, shown]);
  return (
    <span style={{ background: lit ? token.colorWarningBg : 'transparent', borderRadius: 4, transition: 'background-color 0.8s' }}>
      {text}
    </span>
  );
}

/** The story's renderLabel: a module function, the same one throughout (a new one would rebuild the tree data). */
const drawLabel = (node: OneOfTreeNodeControls) => (
  <>
    <LightingLabel text={node.label} />
    {NEW_THIS_TERM.has(node.value) && <> <Typography.Text mark>new</Typography.Text></>}
  </>
);

export const DrawnLabels: StoryObj = {
  name: 'Labels drawn by renderLabel',
  render: function Render() {
    const [terms, setTerms] = useState<'current' | 'older'>('current');
    const field = useOneOfTreeField({
      id: 'drawn.category',
      label: 'Category',
      nodes: terms === 'older' ? OLD_CATEGORIES : CATEGORIES,
      choose: 'leaves',
      expand: 'all',
      initialValue: 'sikgeometria',
    });
    return (
      <Showcase
        title="Labels drawn by renderLabel"
        note="renderLabel draws each node's label: here the label with a highlighted 'new' after the categories new this term (Egyenlőtlenségek, Osztók), in the label's own look (dimmed at zero, Térgeometria disabled with its reason on hover), the note still after it. The label's text stays what the search matches (try 'osztok'), what the closed picker shows and what a screen reader reads. Switch the terms: the values stay, three labels change, and each lights up (a component that keeps its state across the change; the rows keep their identity, so it is not mounted anew)."
      >
        <Space size={32} align="start" wrap>
          <Example label="terms">
            <Segmented
              options={[{ value: 'current', label: 'geometria' }, { value: 'older', label: 'mértan' }]}
              value={terms}
              onChange={(next) => setTerms(next as 'current' | 'older')}
            />
          </Example>
          <Example label="OneOfTreeList search renderLabel">
            <div style={{ width: 320 }}><OneOfTreeList field={field} search renderLabel={drawLabel} /></div>
          </Example>
          <Example label="OneOfTreePicker renderLabel">
            <OneOfTreePicker field={field} renderLabel={drawLabel} style={{ width: 320 }} />
          </Example>
        </Space>
      </Showcase>
    );
  },
};

/** A short book's table of contents: three parts (folders), each with its chapters (leaves). */
const TOC = {
  kind: 'oneOfTree', id: 'chapter', label: 'Chapter',
  nodes: [
    { value: '1', label: 'I. Bevezetés', choosable: false, children: [
      { value: '1.1', label: '1. Mi a matematika?' },
      { value: '1.2', label: '2. Hogyan tanuljunk?' },
    ] },
    { value: '2', label: 'II. Geometria', choosable: false, children: [
      { value: '2.1', label: '1. Síkgeometria' },
      { value: '2.2', label: '2. Térgeometria' },
      { value: '2.3', label: '3. Kör és gömb' },
    ] },
    { value: '3', label: 'III. Számelmélet', choosable: false, children: [
      { value: '3.1', label: '1. Oszthatóság' },
    ] },
  ],
  choose: 'leaves',
} satisfies FieldDefinition;

/** A click that follows `href` on its own (Ctrl, Cmd, Shift, Alt, or the middle button): left to the browser. */
const isModifiedClick = (e: MouseEvent) => e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;

function TableOfContentsPanel() {
  const field = useOneOfTreeField(useStoredField(TOC).options);
  const location = useLocation();
  return (
    <div style={{ width: 380 }}>
      <FieldWidget field={field} widget="list" />
      <Space style={{ marginTop: 12 }}>
        <Button
          href={field.previous && field.hrefFor?.(field.previous.value)}
          disabled={!field.previous}
          onClick={(e) => {
            if (!field.previous || isModifiedClick(e)) return;
            e.preventDefault();
            field.setValue(field.previous.value);
          }}
        >
          ‹ previous
        </Button>
        <Button
          href={field.next && field.hrefFor?.(field.next.value)}
          disabled={!field.next}
          onClick={(e) => {
            if (!field.next || isModifiedClick(e)) return;
            e.preventDefault();
            field.setValue(field.next.value);
          }}
        >
          next ›
        </Button>
      </Space>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        URL hash: <Typography.Text code data-testid="url" style={{ wordBreak: 'break-all' }}>{`#${location.pathname}${location.search}`}</Typography.Text>
      </Typography.Paragraph>
    </div>
  );
}

/** The chapter the story opens at when the hash names no page (opened plainly, the hash empty). */
const FIRST_PAGE = '/book?chapter=2.1';

export const TableOfContents: StoryObj = {
  name: 'Table of contents (stored in the URL, real links)',
  render: function Render() {
    // A hash router over the story's own frame (iframe.html), so a link's href is
    // `#/book?chapter=…` and a new tab opened from it shows this story at that chapter. Made and
    // disposed in one effect: a hot reload re-runs effects, and must not keep a disposed router.
    const [router, setRouter] = useState<ReturnType<typeof createHashRouter>>();
    useEffect(() => {
      const made = createHashRouter([{
        path: '/',
        element: <ReactRouterArgStore><Outlet /></ReactRouterArgStore>,
        children: [{ path: 'book', element: <TableOfContentsPanel /> }],
      }]);
      if (made.state.location.pathname === '/') void made.navigate(FIRST_PAGE, { replace: true });
      setRouter(made);
      return () => made.dispose();
    }, []);
    return (
      <Showcase
        title="A table of contents, kept in the URL"
        note="useOneOfTreeField(useStoredField(toc).options): the chapter lives in the URL, in the query inside its hash (#/book?chapter=2.1), under <ReactRouterArgStore> inside a hash router over this story's frame. Each chapter OneOfTreeList shows is a real <a href> (field.hrefFor, from the store, asked again as the link is used); a plain click requests it in place, a click with Ctrl, Cmd, Shift or Alt (or the middle button) opens it in a new tab instead: the story alone (iframe.html), at that chapter. The list follows the value: the chapter's part opens, and it scrolls into view. '‹ previous' / 'next ›' are plain antd Buttons, not a widget (the design's own choice): their href is field.hrefFor(field.previous / next.value), rendered by a component that re-renders on every location change (useLocation), so it stays current; it skips the parts, never landing on one, and a plain click requests it directly. Opened with no page in the hash, the story goes to chapter 2.1."
      >
        {router && <RouterProvider router={router} />}
      </Showcase>
    );
  },
};
