import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { useState, type ReactNode } from 'react';
import {
  ArgStoreProvider, MessageSinkContext, denyWithReason, memoryStore, useBoolField, useManyOfField, useManyOfTreeField,
  useOneOfField, useStoredField, type ErrorRoutesRegistry, type ExecutionContext, type FieldDefinition, type FieldKind,
} from 'vultus-core';
import { Field } from '../Field.js';
import { FieldWidget } from '../FieldWidget.js';
import { openTooltips } from './helpers/tooltips.js';

// The real useStoredField and useBoolField, watched: <Field stored> must hand useStoredField
// the definition object itself (Review Focus 4), never a per-render merge with the render-site
// overrides; the kind's hook gets the render site's registry as its second argument.
vi.mock('vultus-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vultus-core')>();
  return { ...actual, useStoredField: vi.fn(actual.useStoredField), useBoolField: vi.fn(actual.useBoolField) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(useStoredField).mockClear();
  vi.mocked(useBoolField).mockClear();
});

const CHOICES = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma' }];
const NODES = [
  { value: 'alg', label: 'Algebra', children: [{ value: 'eq', label: 'Equations' }, { value: 'ineq', label: 'Inequalities' }] },
  { value: 'geo', label: 'Geometry' },
];

const DEFINITIONS: Record<FieldKind, FieldDefinition> = {
  boolean: { kind: 'boolean', id: 'duplex', label: 'Both sides' },
  'mixed-boolean': { kind: 'mixed-boolean', id: 'all', label: 'All', initialValue: 'mixed' },
  oneOf: { kind: 'oneOf', id: 'paper', label: 'Paper', choices: CHOICES },
  manyOf: { kind: 'manyOf', id: 'rounds', label: 'Rounds', choices: CHOICES },
  numeric: { kind: 'numeric', id: 'copies', label: 'Copies', min: 1, max: 10 },
  range: { kind: 'range', id: 'years', label: 'Years', min: 2000, max: 2025 },
  manyOfTree: { kind: 'manyOfTree', id: 'topics', label: 'Topics', nodes: NODES },
  oneOfTree: { kind: 'oneOfTree', id: 'topic', label: 'Topic', nodes: NODES },
  text: { kind: 'text', id: 'q', label: 'Search' },
};

/**
 * What tells each widget apart from the other widgets of its kind in the DOM: antd's own
 * classes, or the search icon SearchInput puts before its input (TextInput has none).
 */
const has = (selector: string) => () => document.querySelector(selector) !== null;
const MARKS: Record<FieldKind, Record<string, () => boolean>> = {
  boolean: { switch: has('.ant-switch'), checkbox: has('.ant-checkbox') },
  'mixed-boolean': { switch: has('.ant-switch'), checkbox: has('.ant-checkbox') },
  oneOf: { select: has('.ant-select'), segmented: has('.ant-segmented'), slider: has('.ant-slider') },
  manyOf: { checkboxes: has('.ant-checkbox-group'), select: has('.ant-select-multiple'), switches: has('.ant-switch') },
  numeric: { input: has('.ant-input-number'), slider: has('.ant-slider') },
  range: { slider: has('.ant-slider') },
  manyOfTree: { picker: has('.ant-select'), checklist: has('.ant-tree') },
  oneOfTree: { picker: has('.ant-select'), list: has('.ant-tree') },
  text: { input: () => has('input.ant-input')() && !has('.anticon-search')(), search: has('.anticon-search') },
};

const DEFAULTS: Record<FieldKind, string> = {
  boolean: 'switch', 'mixed-boolean': 'switch', oneOf: 'select', manyOf: 'checkboxes',
  numeric: 'input', range: 'slider', manyOfTree: 'picker', oneOfTree: 'picker', text: 'input',
};

const wrap = (node: ReactNode) => render(<AntApp>{node}</AntApp>);

/** The widget named `name` is the one on show: its mark is present, the other widgets' of the kind are not. */
function expectWidget(kind: FieldKind, name: string) {
  for (const [other, shows] of Object.entries(MARKS[kind])) {
    expect(shows(), `${kind} ${name}: ${other} ${other === name ? 'shown' : 'not shown'}`).toBe(other === name);
  }
}

/** React logs a render error to console.error before rethrowing it; keep the test output clean. */
function quietRenderErrors() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('Field: the widget for a definition', () => {
  it.each(Object.keys(DEFINITIONS) as FieldKind[])('%s: the kind\'s default widget', (kind) => {
    wrap(<Field definition={DEFINITIONS[kind]} />);
    expect(document.querySelector(`[data-field-id="${DEFINITIONS[kind].id}"]`)).not.toBeNull();
    expectWidget(kind, DEFAULTS[kind]);
  });

  const named = (Object.keys(MARKS) as FieldKind[]).flatMap((kind) => Object.keys(MARKS[kind]).map((name) => [kind, name] as const));

  it.each(named)('%s: the definition\'s hint \'%s\' picks the widget', (kind, name) => {
    wrap(<Field definition={{ ...DEFINITIONS[kind], widget: name }} />);
    expectWidget(kind, name);
  });

  it('a hint with display options: { name, ...options }', () => {
    wrap(<Field definition={{ ...DEFINITIONS.manyOf, widget: { name: 'checkboxes', vertical: true } }} />);
    expectWidget('manyOf', 'checkboxes');
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'column' });
  });

  it('the render site\'s widget overrides the definition\'s hint', () => {
    wrap(<Field definition={{ ...DEFINITIONS.oneOf, widget: 'segmented' }} widget="slider" />);
    expectWidget('oneOf', 'slider');
  });

  it('the render site\'s display props override the hint\'s options', () => {
    wrap(<Field definition={{ ...DEFINITIONS.manyOf, widget: { name: 'checkboxes', vertical: true } }} vertical={false} />);
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'row' });
  });

  it('a render-site widget given with options: its options apply', () => {
    wrap(<Field definition={DEFINITIONS.manyOf} widget={{ name: 'switches', vertical: true }} />);
    expectWidget('manyOf', 'switches');
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'column' });
  });

  it('the hint\'s options belong to its widget: another widget named at the render site does not get them', () => {
    wrap(<Field definition={{ ...DEFINITIONS.manyOf, widget: { name: 'switches', vertical: true } }} widget="checkboxes" />);
    expectWidget('manyOf', 'checkboxes');
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'row' });
  });

  it.each([['oneOfTree', 'list'], ['manyOfTree', 'checklist']] as const)(
    "%s %s: the render site's renderLabel reaches the widget, as a display prop",
    (kind, name) => {
      wrap(<Field definition={{ ...DEFINITIONS[kind], expand: 'all' }} widget={name} renderLabel={(node: { value: string }) => <mark>{node.value}</mark>} />);
      expect(Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['alg', 'eq', 'ineq', 'geo']);
    },
  );

  it('a render-site prop given as undefined leaves the hint\'s option alone', () => {
    wrap(<Field definition={{ ...DEFINITIONS.manyOf, widget: { name: 'checkboxes', vertical: true } }} vertical={undefined} />);
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'column' });
  });

  it('an override label shows instead of the definition\'s', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, widget: 'checkbox' }} label="Print on both sides" />);
    expect(screen.getByRole('checkbox', { name: 'Print on both sides' })).toBeInTheDocument();
    expect(screen.queryByText('Both sides')).toBeNull();
  });

  it('an override placeholder shows instead of the definition\'s', () => {
    wrap(<Field definition={{ ...DEFINITIONS.text, placeholder: 'Words' }} placeholder="Words in the task" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', 'Words in the task');
  });

  it('render-site enabled replaces the definition\'s disabled (one value, two spellings): no contradiction', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, disabled: true }} enabled />);
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('render-site disabled disables an enabled definition', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, enabled: true }} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('render-site enabled with a reason disables', () => {
    wrap(<Field definition={DEFINITIONS.boolean} enabled={denyWithReason('Locked')} />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('render-site visible replaces the definition\'s hidden', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, hidden: true }} visible />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('render-site hidden hides the field', () => {
    wrap(<Field definition={DEFINITIONS.boolean} hidden />);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('render-site pending locks the field (focusable, said unavailable)', () => {
    wrap(<Field definition={DEFINITIONS.boolean} pending />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('render-site pending={false} replaces the definition\'s pending function', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, pending: () => true }} pending={false} />);
    expect(screen.getByRole('switch')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('switch')).not.toBeDisabled();
  });

  it('remaining props go to the widget (SearchInput\'s onEnter, with the typed text)', () => {
    const onEnter = vi.fn();
    wrap(<Field definition={{ ...DEFINITIONS.text, widget: 'search' }} onEnter={onEnter} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'prime' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith('prime');
  });

  it('any definition value is overridable: choices', () => {
    wrap(<Field definition={{ ...DEFINITIONS.oneOf, widget: 'segmented' }} choices={[{ value: 'x', label: 'Ten' }, { value: 'y', label: 'Eleven' }]} />);
    expect(screen.getByText('Ten')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it('any definition value is overridable: a label as a function', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, widget: 'checkbox' }} label={() => 'Duplex'} />);
    expect(screen.getByRole('checkbox', { name: 'Duplex' })).toBeInTheDocument();
  });

  it('any definition value is overridable: bounds', () => {
    wrap(<Field definition={DEFINITIONS.numeric} max={3} initialValue={3} />);
    expect(document.querySelector('[data-field-id="copies"]')).toHaveAttribute('data-value', '3');
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-valuemax', '3');
  });

  it('an unknown widget name throws, naming the field, the name and the kind', () => {
    quietRenderErrors();
    expect(() => wrap(<Field definition={{ ...DEFINITIONS.oneOf, widget: 'dial' }} />))
      .toThrow("Field 'paper': no widget 'dial' for kind 'oneOf'");
  });

  it('a name another kind has, but not this one, throws', () => {
    quietRenderErrors();
    expect(() => wrap(<Field definition={DEFINITIONS.range} widget="input" />))
      .toThrow("Field 'years': no widget 'input' for kind 'range'");
  });

  it('a name inherited from Object.prototype is not a widget', () => {
    quietRenderErrors();
    expect(() => wrap(<Field definition={DEFINITIONS.text} widget="toString" />))
      .toThrow("Field 'q': no widget 'toString' for kind 'text'");
  });

  it('an unknown kind throws', () => {
    quietRenderErrors();
    const definition = { kind: 'date', id: 'when', label: 'When' } as unknown as FieldDefinition;
    expect(() => wrap(<Field definition={definition} />)).toThrow("Field 'when': no widget 'default' for kind 'date'");
    expect(() => wrap(<Field definition={definition} widget="picker" />)).toThrow("Field 'when': no widget 'picker' for kind 'date'");
  });

  it('a new kind for the same field remounts with the new kind\'s hook', () => {
    const { rerender } = wrap(<Field definition={DEFINITIONS.text} />);
    expectWidget('text', 'input');
    rerender(<AntApp><Field definition={{ ...DEFINITIONS.boolean, id: 'q' }} /></AntApp>);
    expectWidget('boolean', 'switch');
  });

  it('a new id remounts: the inside value starts over', () => {
    const { rerender } = wrap(<Field definition={{ ...DEFINITIONS.boolean, id: 'a' }} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toBeChecked();
    rerender(<AntApp><Field definition={{ ...DEFINITIONS.boolean, id: 'b' }} /></AntApp>);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});

describe('Field: storage', () => {
  it('inside by default: the value starts at initialValue and changes in the field', () => {
    wrap(<Field definition={{ ...DEFINITIONS.boolean, initialValue: true }} />);
    expect(screen.getByRole('switch')).toBeChecked();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('value + onChange from the render site: the definition\'s initialValue is the storage\'s business, not an error', () => {
    function Outside() {
      const [value, setValue] = useState(false);
      return <><Field definition={{ ...DEFINITIONS.boolean, initialValue: true }} value={value} onChange={setValue} /><output>{String(value)}</output></>;
    }
    wrap(<Outside />);
    expect(screen.getByRole('switch')).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('status').textContent).toBe('true');
  });

  it('commit from the render site: fire receives the requested value', async () => {
    const fire = vi.fn();
    wrap(<Field definition={DEFINITIONS.boolean} value={false} commit={{ fire }} />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(fire).toHaveBeenCalledWith(true, expect.anything()));
  });

  it('stored: a change writes the nearest ArgStore under the field\'s id', () => {
    const store = memoryStore();
    wrap(<ArgStoreProvider store={store}><Field stored definition={DEFINITIONS.boolean} /></ArgStoreProvider>);
    fireEvent.click(screen.getByRole('switch'));
    expect(store.snapshot()).toEqual({ duplex: '1' });
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('stored: reads the store, keeps the definition\'s widget hint, applies the render-site overrides', () => {
    const store = memoryStore({ paper: 'b' });
    wrap(<ArgStoreProvider store={store}><Field stored definition={{ ...DEFINITIONS.oneOf, widget: 'segmented' }} label="Sheet" /></ArgStoreProvider>);
    expectWidget('oneOf', 'segmented');
    expect(document.querySelector('[data-field-id="paper"]')).toHaveAttribute('data-value', 'b');
    expect(document.querySelector('[data-field-id="paper"]')).toHaveAttribute('aria-label', 'Sheet');
  });

  it('stored with a value that does not fit warns once over three renders; useStoredField gets the definition object itself (RF4)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = memoryStore({ paper: 'zzz' });
    const definition: FieldDefinition = { ...DEFINITIONS.oneOf };
    const at = (label: string) => (
      <AntApp><ArgStoreProvider store={store}><Field stored definition={definition} label={label} /></ArgStoreProvider></AntApp>
    );
    const { rerender } = render(at('Paper 1'));
    rerender(at('Paper 2'));
    rerender(at('Paper 3'));
    expect(warn.mock.calls.filter(([m]) => String(m).includes("Field 'paper'"))).toHaveLength(1);
    const calls = vi.mocked(useStoredField).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.every(([d]) => d === definition)).toBe(true);
  });

  it('turning stored on and off remounts: the inside value starts over', () => {
    const store = memoryStore({ duplex: '1' });
    const at = (stored: boolean) => (
      <AntApp><ArgStoreProvider store={store}><Field stored={stored} definition={DEFINITIONS.boolean} /></ArgStoreProvider></AntApp>
    );
    const { rerender } = render(at(false));
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toBeChecked();
    rerender(at(true));
    expect(screen.getByRole('switch')).toBeChecked();
    fireEvent.click(screen.getByRole('switch'));
    expect(store.snapshot()).toEqual({});
    rerender(at(false));
    expect(screen.getByRole('switch')).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch'));
    expect(store.snapshot()).toEqual({});
  });

  it('an initialValue override sets a value inside the field', () => {
    wrap(<Field definition={DEFINITIONS.boolean} initialValue />);
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('an initialValue override with stored, value or commit throws (the value lives outside)', () => {
    quietRenderErrors();
    const store = memoryStore();
    expect(() => wrap(<ArgStoreProvider store={store}><Field stored definition={DEFINITIONS.boolean} initialValue /></ArgStoreProvider>))
      .toThrow("Field 'duplex': an \"initialValue\" override is for a value inside the field; with \"stored\" it lives outside");
    expect(() => wrap(<Field definition={DEFINITIONS.boolean} initialValue value={false} onChange={() => {}} />))
      .toThrow("Field 'duplex': an \"initialValue\" override is for a value inside the field; with \"onChange\" it lives outside");
    expect(() => wrap(<Field definition={DEFINITIONS.boolean} initialValue value={false} commit={{ fire: () => {} }} />))
      .toThrow("Field 'duplex': an \"initialValue\" override is for a value inside the field; with \"commit\" it lives outside");
  });

  const ROOMS: FieldDefinition = { kind: 'oneOf', id: 'room', label: 'Room', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }], widget: 'segmented' };
  const STORE_READ_MESSAGE = (key: string) => `Field 'room': with "stored", "${key}" comes from the definition, which the store reads; give it there (a context function covers data that changes)`;

  it('stored: overriding choices to widen them throws (the store sanitizes against the definition\'s)', () => {
    quietRenderErrors();
    const store = memoryStore();
    expect(() => wrap(<ArgStoreProvider store={store}><Field stored definition={ROOMS} choices={[{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'x' }]} /></ArgStoreProvider>))
      .toThrow(STORE_READ_MESSAGE('choices'));
    expect(store.snapshot()).toEqual({});
  });

  it('stored: overriding choices to narrow them throws (a stored value they drop would still show)', () => {
    quietRenderErrors();
    const store = memoryStore({ room: 'c' });
    expect(() => wrap(<ArgStoreProvider store={store}><Field stored definition={ROOMS} choices={[{ value: 'a' }, { value: 'b' }]} /></ArgStoreProvider>))
      .toThrow(STORE_READ_MESSAGE('choices'));
  });

  it.each([
    ['nodes', { kind: 'manyOfTree', id: 'room', nodes: NODES } as FieldDefinition, { nodes: [{ value: 'geo' }] }],
    ['selection', { kind: 'manyOfTree', id: 'room', nodes: NODES } as FieldDefinition, { selection: 'all' }],
    ['nodes', { kind: 'oneOfTree', id: 'room', nodes: NODES } as FieldDefinition, { nodes: [{ value: 'geo' }] }],
    ['choose', { kind: 'oneOfTree', id: 'room', nodes: NODES } as FieldDefinition, { choose: 'leaves' }],
    ['optional', { kind: 'oneOfTree', id: 'room', nodes: NODES } as FieldDefinition, { optional: true }],
    ['min', { kind: 'numeric', id: 'room', min: 1, max: 10 } as FieldDefinition, { min: 2 }],
    ['max', { kind: 'range', id: 'room', min: 1, max: 10 } as FieldDefinition, { max: 5 }],
    ['integer', { kind: 'numeric', id: 'room' } as FieldDefinition, { integer: true }],
  ])('stored: overriding %s throws', (key, definition, override) => {
    quietRenderErrors();
    expect(() => wrap(<ArgStoreProvider store={memoryStore()}><Field stored definition={definition} {...(override as object)} /></ArgStoreProvider>))
      .toThrow(STORE_READ_MESSAGE(key));
  });

  it('stored: the definition\'s pending reaches the field (the store does not read it)', () => {
    wrap(<ArgStoreProvider store={memoryStore()}><Field stored definition={{ ...DEFINITIONS.boolean, pending: true }} /></ArgStoreProvider>);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-disabled', 'true');
  });

  it('stored: overriding a value the store does not read works (label, placeholder, enabled)', () => {
    const store = memoryStore({ room: 'b' });
    wrap(<ArgStoreProvider store={store}><Field stored definition={ROOMS} label="Lab" enabled={denyWithReason('Booked')} /></ArgStoreProvider>);
    expect(document.querySelector('[data-field-id="room"]')).toHaveAttribute('aria-label', 'Lab');
    expect(document.querySelector('[data-field-id="room"]')).toHaveAttribute('data-value', 'b');
  });

  it('without stored, the same overrides work: widened choices can be chosen', () => {
    wrap(<Field definition={ROOMS} choices={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }, { value: 'x', label: 'X' }]} />);
    fireEvent.click(screen.getByText('X'));
    expect(document.querySelector('[data-field-id="room"]')).toHaveAttribute('data-value', 'x');
  });

  it('without stored, the same overrides work: narrowed choices', () => {
    wrap(<Field definition={ROOMS} choices={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('C')).toBeNull();
  });

  it('registry goes to the kind\'s hook as its second argument', () => {
    const registry: ErrorRoutesRegistry<string> = { print: { 409: { i18nKey: 'print.busy' } } };
    wrap(<Field definition={DEFINITIONS.boolean} registry={registry} />);
    expect(vi.mocked(useBoolField).mock.calls.at(-1)?.[1]).toBe(registry);
  });

  it('stored together with value, onChange or commit throws', () => {
    quietRenderErrors();
    const store = memoryStore();
    expect(() => wrap(<ArgStoreProvider store={store}><Field stored definition={DEFINITIONS.boolean} value onChange={() => {}} /></ArgStoreProvider>))
      .toThrow("Field 'duplex': \"stored\" keeps the value in the ArgStore; it does not go together with \"value\", \"onChange\" or \"commit\"");
  });

  it('stored together with hrefFor throws (the store gives its own)', () => {
    quietRenderErrors();
    const props = { stored: true, hrefFor: (v: boolean) => `#?duplex=${v}` } as unknown as { stored: true };
    expect(() => wrap(<ArgStoreProvider store={memoryStore()}><Field definition={DEFINITIONS.boolean} {...props} /></ArgStoreProvider>))
      .toThrow("Field 'duplex': \"stored\" keeps the value in the ArgStore, which gives its own \"hrefFor\"; the render site cannot pass one");
  });

  it('hrefFor without value, onChange or commit throws (inside the field nothing gives a link)', () => {
    quietRenderErrors();
    expect(() => wrap(<Field definition={DEFINITIONS.boolean} hrefFor={(v) => `#?duplex=${v}`} />))
      .toThrow("Field 'duplex': \"hrefFor\" goes with \"value\" and \"onChange\" or \"commit\" (the link a requested value amounts to, where the render site keeps the value); a value inside the field has none");
  });

  it('hrefFor with value and onChange: the kind\'s controls carry it', () => {
    function Outside() {
      const [value, setValue] = useState(false);
      return <Field definition={DEFINITIONS.boolean} value={value} onChange={setValue} hrefFor={(v) => `#?duplex=${v}`} />;
    }
    wrap(<Outside />);
    expect(vi.mocked(useBoolField).mock.results.at(-1)?.value.hrefFor?.(true)).toBe('#?duplex=true');
  });
});

describe('FieldWidget: the widget for controls a caller made', () => {
  function Topics({ widget, ...props }: { widget?: string; vertical?: boolean }) {
    const field = useManyOfField({ id: 'rounds', label: 'Rounds', choices: CHOICES, widget: { name: 'switches', vertical: true } });
    return <FieldWidget field={field} widget={widget} {...props} />;
  }

  it('picks by the controls\' type and their hint', () => {
    wrap(<Topics />);
    expectWidget('manyOf', 'switches');
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'column' });
  });

  it('render-site widget and props win', () => {
    wrap(<Topics widget="checkboxes" />);
    expectWidget('manyOf', 'checkboxes');
    expect(document.querySelector('[data-field-id="rounds"]')).toHaveStyle({ flexDirection: 'row' });
  });

  it("a tree widget's renderLabel goes to it, as the other display props", () => {
    function Topics() {
      const field = useManyOfTreeField({ id: 'topics', label: 'Topics', nodes: NODES, expand: 'all' });
      return <FieldWidget field={field} widget="checklist" renderLabel={(node) => <mark>{node.value}</mark>} />;
    }
    wrap(<Topics />);
    expect(Array.from(document.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['alg', 'eq', 'ineq', 'geo']);
  });

  it('item: a labelled form item around the widget', () => {
    function Labelled() {
      const field = useOneOfField({ id: 'paper', label: 'Paper', description: 'The **sheet** size', choices: CHOICES });
      return <FieldWidget field={field} item />;
    }
    wrap(<Labelled />);
    expect(document.querySelector('.ant-form-item-label')).toHaveTextContent('Paper');
    expect(document.querySelector('.ant-form-item [data-field-id="paper"]')).not.toBeNull();
    expect(document.querySelector('.ant-form-item-tooltip')).not.toBeNull();
  });

  it('the kind\'s default without a hint', () => {
    function Plain() {
      const field = useOneOfField({ id: 'paper', label: 'Paper', choices: CHOICES });
      return <FieldWidget field={field} />;
    }
    wrap(<Plain />);
    expectWidget('oneOf', 'select');
  });
});

describe('item: a labelled form item', () => {
  const DUPLEX: FieldDefinition = {
    kind: 'boolean', id: 'duplex', label: 'Both sides', description: 'Print on **both** sides of the sheet',
  };

  function Committed({ fire, widget }: { fire: (next: boolean, ctx: ExecutionContext) => void; widget?: string }) {
    const [value, setValue] = useState(false);
    return (
      <Field
        item
        definition={DUPLEX}
        widget={widget}
        value={value}
        commit={{ fire: (next, ctx) => { fire(next, ctx); setValue(next); } }}
      />
    );
  }

  it('shows the label, and the description (markdown) in the label\'s tooltip', async () => {
    wrap(<Field item definition={DUPLEX} />);
    const item = document.querySelector('.ant-form-item')!;
    expect(item).not.toBeNull();
    expect(item.querySelector('.ant-form-item-label')).toHaveTextContent('Both sides');
    expect(item.querySelector('[data-field-id="duplex"]')).not.toBeNull();
    fireEvent.mouseEnter(item.querySelector('.ant-form-item-tooltip')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    expect(openTooltips()[0].querySelector('strong')).toHaveTextContent('both');
  });

  it('an error message shows once, under the control, as an alert, with the error status; the sink does not get it', async () => {
    const sink = vi.fn();
    wrap(<MessageSinkContext.Provider value={sink}><Committed fire={(_next, ctx) => ctx.error('Printer offline')} /></MessageSinkContext.Provider>);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Printer offline'));
    expect(screen.getAllByText('Printer offline')).toHaveLength(1);
    expect(document.querySelector('.ant-form-item')).toHaveClass('ant-form-item-has-error');
    expect(sink).not.toHaveBeenCalled();
  });

  it('a thrown error shows once too, the sink not getting it', async () => {
    const sink = vi.fn();
    wrap(<MessageSinkContext.Provider value={sink}><Committed fire={() => { throw new Error('boom'); }} /></MessageSinkContext.Provider>);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(sink).not.toHaveBeenCalled();
  });

  it('a warning shows once, as a status, with the warning status', async () => {
    const sink = vi.fn();
    wrap(<MessageSinkContext.Provider value={sink}><Committed fire={(_next, ctx) => ctx.warn('Low toner')} /></MessageSinkContext.Provider>);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Low toner'));
    expect(screen.getAllByText('Low toner')).toHaveLength(1);
    expect(document.querySelector('.ant-form-item')).toHaveClass('ant-form-item-has-warning');
    expect(document.querySelector('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(sink).not.toHaveBeenCalled();
  });

  it('an info message shows as a status, without the error or warning status', async () => {
    wrap(<Committed fire={(_next, ctx) => ctx.info('Saved for this printer')} />);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved for this printer'));
    expect(document.querySelector('.ant-form-item')).not.toHaveClass('ant-form-item-has-error');
    expect(document.querySelector('.ant-form-item')).not.toHaveClass('ant-form-item-has-warning');
  });

  it('without item, the sink gets the messages as before', async () => {
    const sink = vi.fn();
    function Bare() {
      const [value, setValue] = useState(false);
      return <Field definition={DUPLEX} value={value} commit={{ fire: (next, ctx) => { ctx.error('Printer offline'); setValue(next); } }} />;
    }
    wrap(<MessageSinkContext.Provider value={sink}><Bare /></MessageSinkContext.Provider>);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(sink).toHaveBeenCalledWith('Printer offline', 'error'));
  });

  it('the checkbox widget shows its own label: the item has none', () => {
    wrap(<Field item definition={{ ...DUPLEX, widget: 'checkbox' }} />);
    expect(document.querySelector('.ant-form-item-label')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Both sides' })).toBeInTheDocument();
  });

  it('a hidden field renders no item at all', () => {
    wrap(<Field item definition={DUPLEX} hidden />);
    expect(document.querySelector('.ant-form-item')).toBeNull();
  });

  it('the override label labels the item', () => {
    wrap(<Field item definition={DUPLEX} label="Duplex" />);
    expect(document.querySelector('.ant-form-item-label')).toHaveTextContent('Duplex');
  });

  it('renders without an enclosing antd Form, with no warnings', () => {
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    wrap(<Field item definition={DUPLEX} />);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('item: the description shows once, behind the label\'s info sign', () => {
  const DUPLEX: FieldDefinition = {
    kind: 'boolean', id: 'duplex', label: 'Both sides', description: 'Print on **both** sides of the sheet',
    valueDescriptions: { true: 'Printing on both sides', false: 'Printing on one side' },
  };
  const PAPER: FieldDefinition = {
    kind: 'oneOf', id: 'paper', label: 'Paper', description: 'The sheet size', widget: 'segmented',
    choices: [{ value: 'a4', label: 'A4', description: 'The usual size' }, { value: 'a3', label: 'A3' }],
  };

  /** Hovers the control's tooltip anchor (withTooltip's span) and returns the tooltip that opens. */
  async function hover(element: Element): Promise<HTMLElement> {
    fireEvent.mouseEnter(element.closest('span[style]')!);
    await waitFor(() => expect(openTooltips()).toHaveLength(1));
    return openTooltips()[0];
  }

  it('a switch\'s own tooltip leaves the description to the label, keeping the current state; its accessible description keeps it', async () => {
    wrap(<Field item definition={DUPLEX} />);
    const control = screen.getByRole('switch');
    expect(control.getAttribute('aria-description')).toContain('Print on both sides of the sheet');
    const tip = await hover(control);
    expect(tip).toHaveTextContent('Current state: Printing on one side');
    expect(tip.querySelector('[data-tooltip-part="description"]')).toBeNull();
    expect(tip).not.toHaveTextContent('Print on both sides');
  });

  it('a disabled switch shows its reason, not the description', async () => {
    wrap(<Field item definition={DUPLEX} enabled={denyWithReason('No duplex unit')} />);
    const tip = await hover(screen.getByRole('switch'));
    expect(tip.querySelector('[data-tooltip-part="reason"]')).toHaveTextContent('No duplex unit');
    expect(tip.querySelector('[data-tooltip-part="description"]')).toBeNull();
  });

  it('with nothing else to say, the control\'s own tooltip does not open', async () => {
    const { valueDescriptions: _states, ...plain } = DUPLEX as FieldDefinition & { valueDescriptions?: unknown };
    wrap(<Field item definition={plain as FieldDefinition} />);
    fireEvent.mouseEnter(screen.getByRole('switch').closest('span[style]')!);
    await act(() => new Promise((resolve) => { setTimeout(resolve, 300); }));
    expect(openTooltips()).toHaveLength(0);
  });

  it('a segment\'s tooltip drops the field\'s description and keeps the choice\'s', async () => {
    wrap(<Field item definition={PAPER} />);
    const tip = await hover(screen.getByText('A4'));
    expect(tip).toHaveTextContent('The usual size');
    expect(tip).not.toHaveTextContent('The sheet size');
  });

  it('outside an item nothing changes: the control\'s tooltip shows the description', async () => {
    wrap(<Field definition={DUPLEX} />);
    const tip = await hover(screen.getByRole('switch'));
    expect(tip.querySelector('[data-tooltip-part="description"]')).toHaveTextContent('Print on both sides of the sheet');
    expect(tip).toHaveTextContent('Current state: Printing on one side');
  });

  it('the checkbox widget, which shows its own label (the item has none), keeps the description in its tooltip', async () => {
    wrap(<Field item definition={{ ...DUPLEX, widget: 'checkbox' }} />);
    const tip = await hover(screen.getByRole('checkbox'));
    expect(tip.querySelector('[data-tooltip-part="description"]')).toHaveTextContent('Print on both sides of the sheet');
  });
});
