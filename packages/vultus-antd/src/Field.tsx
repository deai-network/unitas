import {
  MessageSinkContext, useBoolField, useManyOfField, useMessageSink, useMixedBoolField, useNumericField, useOneOfField,
  useRangeField, useStoredField, useTextField, useManyOfTreeField, useOneOfTreeField,
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
const STORE_KEYS = ['initialValue', 'choices', 'nodes', 'selection', 'choose', 'optional', 'min', 'max', 'integer'] as const;
type StoreKey = (typeof STORE_KEYS)[number];

/**
 * `<Field>`'s props for a definition `D`, typed by its kind (by every kind, for a definition
 * typed as the FieldDefinition union): the widget names and the display props of the kind's
 * widgets; without `stored`, the value and its setters and the definition's values as
 * overrides; with `stored`, no value or setter of the render site's (the store keeps the value)
 * and the definition's values but the ones the store reads (`initialValue`, `choices`, `nodes`,
 * `selection`, `choose`, `optional`, `min`, `max`, `integer`).
 */
export type FieldProps<D extends FieldDefinition = FieldDefinition> = {
  /** The field as data; its `kind` picks the hook and, with its `widget` hint, the widget. */
  definition: D;
  /** The error routes a commit's `errorRoute` is looked up in (the kind hook's second argument). */
  registry?: ErrorRoutesRegistry<string>;
  /** The widget, over the definition's hint: one of the kind's names, or `{ name, ...displayProps }`. */
  widget?: WidgetHintOf<D['kind']>;
  /** In a labelled antd form item (label, description tooltip, the last commit's messages). */
  item?: boolean;
} & DisplayPropsOf<D['kind']> & (
  | ({
    stored?: false;
    /** The value, when the render site keeps it (with `onChange` or `commit`). */
    value?: FieldValueOf<D['kind']>;
    onChange?: (value: FieldRequestOf<D['kind']>) => void;
    commit?: FieldCommit<FieldRequestOf<D['kind']>>;
    /** The link that requesting a value amounts to, where the render site has one (e.g. a URL store). */
    hrefFor?: (value: FieldRequestOf<D['kind']>) => string | undefined;
  } & DefinitionOverridesOf<D['kind']>)
  | ({
    /** Keep the value in the nearest ArgStore (the URL, localStorage) under the definition's `id` (useStoredField). */
    stored: true;
    value?: never;
    onChange?: never;
    commit?: never;
    hrefFor?: never;
  } & Omit<DefinitionOverridesOf<D['kind']>, StoreKey>)
);

/** Every value of a definition a render site may override, of every kind; checked against FieldDefinition below. */
const DEFINITION_KEYS = [
  'label', 'description', 'placeholder', 'visible', 'hidden', 'enabled', 'disabled', 'pending', 'valueDescriptions', 'initialValue',
  'choices', 'min', 'max', 'step', 'integer', 'unit', 'format', 'nodes', 'selection', 'expand', 'control',
  'choose', 'optional',
] as const;
const IS_DEFINITION_KEY = new Set<string>(DEFINITION_KEYS);

type Storage = { value?: unknown; onChange?: (value: any) => void; commit?: FieldCommit<any>; hrefFor?: (value: any) => string | undefined };

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
  manyOfTree: kindFields('manyOfTree', useManyOfTreeField),
  oneOfTree: kindFields('oneOfTree', useOneOfTreeField),
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
 * `choose`, `optional`, `min`, `max`, `integer`) come from the definition: overriding one throws
 * (a context function in the definition covers data that changes). `hrefFor` goes with `value`
 * / `onChange` / `commit` (the link a requested value amounts to, the render site's to give):
 * with `stored` the ArgStore gives its own, and inside the field nothing gives one, so passing
 * one there throws.
 *
 * The props are typed by the definition's kind. In a component generic over
 * `<D extends FieldDefinition>`, they cannot resolve for the generic `D`: render
 * `<Field<FieldDefinition> definition={d} …>` there.
 */
export function Field<D extends FieldDefinition>(props: FieldProps<D>) {
  const { definition, stored = false, value, onChange, commit, hrefFor, registry, ...rest } = props as FieldProps & Record<string, unknown>;
  const { id, kind } = definition;
  const outerSink = useMessageSink();
  pickWidget(id, kind, rest.widget as FieldProps['widget'], definition.widget);
  const overrides: Record<string, unknown> = {};
  const widgetProps: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(rest)) (IS_DEFINITION_KEY.has(key) ? overrides : widgetProps)[key] = prop;
  const storage: Storage = Object.fromEntries(
    Object.entries({ value, onChange, commit, hrefFor }).filter(([, v]) => v !== undefined),
  );
  const outsideStorage = value !== undefined || onChange !== undefined || commit !== undefined;
  if (stored && outsideStorage) {
    throw new Error(`Field '${id}': "stored" keeps the value in the ArgStore; it does not go together with "value", "onChange" or "commit"`);
  }
  if (stored && hrefFor !== undefined) {
    throw new Error(`Field '${id}': "stored" keeps the value in the ArgStore, which gives its own "hrefFor"; the render site cannot pass one`);
  }
  if (!stored && hrefFor !== undefined && !outsideStorage) {
    throw new Error(`Field '${id}': "hrefFor" goes with "value" and "onChange" or "commit" (the link a requested value amounts to, where the render site keeps the value); a value inside the field has none`);
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
