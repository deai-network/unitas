import {
  MessageSinkContext, useBoolField, useManyOfField, useMessageSink, useMixedBoolField, useNumericField, useOneOfField,
  useRangeField, useStoredField, useTextField, useTreeField,
  type ErrorRoutesRegistry, type FieldCommit, type FieldDefinition, type FieldKind, type MessageSink,
} from 'vultus-core';
import {
  FieldWidget, pickWidget,
  type ControlsByKind, type DisplayPropsOf, type FieldRequestOf, type FieldValueOf, type KeysOf, type Merged,
  type WidgetHintOf,
} from './FieldWidget.js';

/** The definition of kind `K` (FieldDefinition's member). */
type DefinitionOf<K extends FieldKind> = Extract<FieldDefinition, { kind: K }>;

/**
 * What a render site may override of a definition of kind `K` (of any kind, for a union): any
 * of its values but `kind` and `id` (moxb's parseProps), each optional; the hint is overridden
 * by `widget`.
 */
export type DefinitionOverridesOf<K extends FieldKind> = Merged<K extends FieldKind ? Omit<DefinitionOf<K>, 'kind' | 'id' | 'widget'> : never>;

/**
 * The values the store layer reads from the definition itself (useStoredField and
 * useStoredFields resolve the default and sanitize the stored value against them): with
 * `stored`, they come from the definition only, so a render site cannot override them.
 */
const STORE_KEYS = ['initialValue', 'choices', 'nodes', 'selection', 'min', 'max', 'integer'] as const;
type StoreKey = (typeof STORE_KEYS)[number];

/**
 * `<Field>`'s props for a definition `D`, typed by its kind (by every kind, for a definition
 * typed as the FieldDefinition union): the value and its setters, the widget names and the
 * display props of the kind's widgets, and the definition's values as overrides (with
 * `stored`, all but the ones the store reads: `initialValue`, `choices`, `nodes`, `selection`,
 * `min`, `max`, `integer`).
 */
export type FieldProps<D extends FieldDefinition = FieldDefinition> = {
  /** The field as data; its `kind` picks the hook and, with its `widget` hint, the widget. */
  definition: D;
  /** The value, when the render site keeps it (with `onChange` or `commit`). */
  value?: FieldValueOf<D['kind']>;
  onChange?: (value: FieldRequestOf<D['kind']>) => void;
  commit?: FieldCommit<FieldRequestOf<D['kind']>>;
  /** The error routes a commit's `errorRoute` is looked up in (the kind hook's second argument). */
  registry?: ErrorRoutesRegistry<string>;
  /** The widget, over the definition's hint: one of the kind's names, or `{ name, ...displayProps }`. */
  widget?: WidgetHintOf<D['kind']>;
  /** In a labelled antd form item (label, description tooltip, the last commit's messages). */
  item?: boolean;
} & DisplayPropsOf<D['kind']> & (
  | ({ stored?: false } & DefinitionOverridesOf<D['kind']>)
  | ({
    /** Keep the value in the nearest ArgStore (the URL, localStorage) under the definition's `id` (useStoredField). */
    stored: true;
  } & Omit<DefinitionOverridesOf<D['kind']>, StoreKey>)
);

/** Every value of a definition a render site may override, of every kind; checked against FieldDefinition below. */
const DEFINITION_KEYS = [
  'label', 'description', 'placeholder', 'visible', 'hidden', 'enabled', 'disabled', 'valueDescriptions', 'initialValue',
  'choices', 'min', 'max', 'step', 'integer', 'unit', 'format', 'nodes', 'selection', 'expand', 'control',
] as const;
const IS_DEFINITION_KEY = new Set<string>(DEFINITION_KEYS);

type Storage = { value?: unknown; onChange?: (value: any) => void; commit?: FieldCommit<any> };

interface InnerProps {
  definition: FieldDefinition;
  storage: Storage;
  overrides: Record<string, unknown>;
  registry: ErrorRoutesRegistry<string> | undefined;
  widgetProps: Record<string, unknown>;
}

type KindHook<K extends FieldKind> = (options: any, registry?: ErrorRoutesRegistry<string>) => ControlsByKind[K];

/**
 * A definition's options with the render site's overrides. A pair (`enabled`/`disabled`,
 * `visible`/`hidden`) is one value in two spellings: an override of either replaces both.
 */
function withOverrides<T extends object>(options: T, overrides: Record<string, unknown>): T {
  const merged = { ...options } as Record<string, unknown>;
  for (const [a, b] of [['enabled', 'disabled'], ['visible', 'hidden']]) {
    if (overrides[a] !== undefined || overrides[b] !== undefined) {
      delete merged[a];
      delete merged[b];
    }
  }
  for (const [key, value] of Object.entries(overrides)) if (value !== undefined) merged[key] = value;
  return merged as unknown as T;
}

/** The definition in its outside form: its initial value is the storage's default, not a value of its own. */
function outside(definition: FieldDefinition): FieldDefinition {
  const { initialValue: _default, ...rest } = definition as FieldDefinition & { initialValue?: unknown };
  return rest as FieldDefinition;
}

/**
 * A kind's two inner components, each calling the kind's hook (and, stored, useStoredField)
 * exactly once per render: Plain keeps the value inside or takes it from the render site;
 * Stored keeps it in the nearest ArgStore, handing useStoredField the definition object itself
 * (so a stored value that does not fit warns once, not on every render with new overrides).
 */
function kindFields<K extends FieldKind>(kind: K, useKindField: KindHook<K>) {
  function Plain({ definition, storage, overrides, registry, widgetProps }: InnerProps) {
    const given = storage.value !== undefined || storage.onChange !== undefined || storage.commit !== undefined;
    const field = useKindField({ ...withOverrides(given ? outside(definition) : definition, overrides), ...storage }, registry);
    return <FieldWidget field={field} {...widgetProps} />;
  }
  function Stored({ definition, overrides, registry, widgetProps }: InnerProps) {
    const stored = useStoredField(definition);
    const field = useKindField(withOverrides(stored.options, overrides), registry);
    return <FieldWidget field={field} {...widgetProps} />;
  }
  Plain.displayName = `Field(${kind})`;
  Stored.displayName = `StoredField(${kind})`;
  return { Plain, Stored };
}

const KIND_FIELDS: { [K in FieldKind]: ReturnType<typeof kindFields<K>> } = {
  boolean: kindFields('boolean', useBoolField),
  'mixed-boolean': kindFields('mixed-boolean', useMixedBoolField),
  oneOf: kindFields('oneOf', useOneOfField),
  manyOf: kindFields('manyOf', useManyOfField),
  numeric: kindFields('numeric', useNumericField),
  range: kindFields('range', useRangeField),
  tree: kindFields('tree', useTreeField),
  text: kindFields('text', useTextField),
};

/** The sink of a field in a form item: its messages show under the control, not a second time elsewhere. */
const SILENT_SINK: MessageSink = () => {};

/**
 * A field definition rendered: its kind's hook, then its widget (FieldWidget). Storage: inside
 * the field by default (from `initialValue`); `stored` keeps it in the nearest ArgStore; or the
 * render site passes `value` with `onChange` or `commit`. Render-site props win over the
 * definition: any of its values but `kind` and `id` (an `initialValue` only for a value inside
 * the field), `widget` over its hint; the other props are the display props of the kind's
 * widgets, over the hint's. `registry` goes to the kind's hook, for a commit's `errorRoute`.
 * `item` puts the field in a labelled antd form item and keeps its messages there: the
 * MessageSink (a toast under VultusProvider) does not get them. An unknown kind or widget name
 * throws. A definition of another kind or id, or turning `stored` on or off, remounts the field.
 * With `stored`, the values the store reads (`initialValue`, `choices`, `nodes`, `selection`,
 * `min`, `max`, `integer`) come from the definition: overriding one throws (a context function
 * in the definition covers data that changes).
 *
 * The props are typed by the definition's kind. In a component generic over
 * `<D extends FieldDefinition>`, they cannot resolve for the generic `D`: render
 * `<Field<FieldDefinition> definition={d} …>` there.
 */
export function Field<D extends FieldDefinition>(props: FieldProps<D>) {
  const { definition, stored = false, value, onChange, commit, registry, ...rest } = props as FieldProps & Record<string, unknown>;
  const { id, kind } = definition;
  const outerSink = useMessageSink();
  pickWidget(id, kind, rest.widget as FieldProps['widget'], definition.widget);
  const overrides: Record<string, unknown> = {};
  const widgetProps: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(rest)) (IS_DEFINITION_KEY.has(key) ? overrides : widgetProps)[key] = prop;
  const storage: Storage = Object.fromEntries(
    Object.entries({ value, onChange, commit }).filter(([, v]) => v !== undefined),
  );
  const outsideStorage = Object.keys(storage).length > 0;
  if (stored && outsideStorage) {
    throw new Error(`Field '${id}': "stored" keeps the value in the ArgStore; it does not go together with "value", "onChange" or "commit"`);
  }
  if (overrides.initialValue !== undefined && (stored || outsideStorage)) {
    const where = stored ? 'stored' : commit ? 'commit' : onChange ? 'onChange' : 'value';
    throw new Error(`Field '${id}': an "initialValue" override is for a value inside the field; with "${where}" it lives outside`);
  }
  const storeKey = stored ? STORE_KEYS.find((key) => overrides[key] !== undefined) : undefined;
  if (storeKey) {
    throw new Error(`Field '${id}': with "stored", "${storeKey}" comes from the definition, which the store reads; give it there (a context function covers data that changes)`);
  }
  const { Plain, Stored } = KIND_FIELDS[kind];
  const Inner = stored ? Stored : Plain;
  return (
    <MessageSinkContext.Provider value={rest.item ? SILENT_SINK : outerSink}>
      <Inner
        key={`${kind}:${id}`}
        definition={definition}
        storage={storage}
        overrides={overrides}
        registry={registry}
        widgetProps={widgetProps}
      />
    </MessageSinkContext.Provider>
  );
}

/** Compile-time checks: DEFINITION_KEYS is every overridable value of every kind, and no widget's display prop shares a name with one. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type OverridableKeys = Exclude<KeysOf<FieldDefinition>, 'kind' | 'id' | 'widget'>;
type DefinitionKeysAreComplete = Assert<Same<(typeof DEFINITION_KEYS)[number], OverridableKeys>>;
type DisplayPropsAreNotDefinitionValues = Assert<Same<Extract<keyof DisplayPropsOf<FieldKind>, OverridableKeys>, never>>;

/** Compile-time checks of Field's props: typed by the definition's kind, and by every kind for the FieldDefinition union. */
function fieldPropsAreTyped(
  wide: FieldDefinition, bool: DefinitionOf<'boolean'>, oneOf: DefinitionOf<'oneOf'>, range: DefinitionOf<'range'>,
  tree: DefinitionOf<'tree'>, mixed: DefinitionOf<'mixed-boolean'>,
) {
  const takesString = (typed: string) => typed;
  function Wrapper<W extends FieldDefinition>({ definition, flag }: { definition: W; flag: boolean }) {
    return [
      <Field<FieldDefinition> definition={definition} label="Rounds" vertical />,
      <Field<FieldDefinition> definition={definition} stored={flag} label="Rounds" />,
      // @ts-expect-error -- for a generic definition type the kind-keyed props cannot resolve: pass <Field<FieldDefinition>>.
      <Field definition={definition} label="Rounds" />,
    ];
  }
  return [
    Wrapper,
    <Field definition={oneOf} stored label="Paper" widget="segmented" />,
    // @ts-expect-error -- with stored, choices come from the definition (the store sanitizes against them).
    <Field definition={oneOf} stored choices={[{ value: 'a' }]} />,
    // @ts-expect-error -- with stored, so do the bounds.
    <Field definition={range} stored min={2000} />,
    <Field definition={wide} widget="search" onEnter={(typed) => takesString(typed)} />,
    <Field definition={wide} vertical style={{ width: 200 }} label="Rounds" />,
    <Field definition={oneOf} widget={{ name: 'segmented', iconOnly: true }} choices={[{ value: 'a' }]} />,
    <Field definition={oneOf} value="a" onChange={(next) => takesString(next)} />,
    <Field definition={bool} value commit={{ fire: (next: boolean) => { void next; } }} />,
    <Field definition={mixed} value="mixed" onChange={(next: boolean) => next} />,
    <Field definition={range} widget="slider" showValue min={() => 2010} label={() => 'Years'} />,
    <Field definition={tree} panel="drawer" summary="firstWords" />,
    <Field definition={bool} initialValue />,
    <Field definition={{ kind: 'manyOf', id: 'rounds', choices: [] }} vertical label="Rounds" value={['a']} onChange={(next) => next.join()} />,
    // @ts-expect-error -- an inline definition is typed by its kind too: iconOnly is a one-of widget's prop.
    <Field definition={{ kind: 'manyOf', id: 'rounds', choices: [] }} iconOnly />,
    // @ts-expect-error -- a misspelled display prop.
    <Field definition={wide} vertcal />,
    // @ts-expect-error -- a misspelled prop, on a definition of one kind.
    <Field definition={oneOf} lable="Paper" />,
    // @ts-expect-error -- a range field has no input widget.
    <Field definition={range} widget="input" />,
    // @ts-expect-error -- nor a hint naming one.
    <Field definition={range} widget={{ name: 'input' }} />,
    // @ts-expect-error -- a boolean field's value is a boolean.
    <Field definition={bool} value="yes" onChange={() => {}} />,
    // @ts-expect-error -- a one-of field's onChange receives a string.
    <Field definition={oneOf} value="a" onChange={(next: number) => next} />,
    // @ts-expect-error -- a mixed-boolean field is asked for a boolean, never 'mixed'.
    <Field definition={mixed} value="mixed" onChange={(next: 'mixed') => next} />,
    // @ts-expect-error -- TreeChecklist's internal `nested` is not a display prop.
    <Field definition={tree} widget="checklist" nested />,
    // @ts-expect-error -- onEnter receives the typed text, a string.
    <Field definition={wide} onEnter={(typed: number) => typed} />,
    // @ts-expect-error -- `id` is not overridable.
    <Field definition={bool} id="other" />,
    // @ts-expect-error -- vertical is a many-of widget's prop, not a boolean widget's.
    <Field definition={bool} vertical />,
  ];
}
