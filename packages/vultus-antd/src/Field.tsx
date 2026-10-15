import {
  useBoolField, useManyOfField, useMixedBoolField, useNumericField, useOneOfField, useRangeField, useStoredField,
  useTextField, useTreeField,
  type Decision, type FieldCommit, type FieldControls, type FieldDefinition, type FieldKind, type WidgetHint,
} from 'vultus-core';
import { FieldWidget, pickWidget } from './FieldWidget.js';

/** What the render site may override of a definition's own values. */
interface Overrides {
  label?: string;
  description?: string;
  enabled?: Decision;
  disabled?: Decision;
  visible?: boolean;
  hidden?: boolean;
  placeholder?: string;
}

export type FieldProps<D extends FieldDefinition = FieldDefinition> = {
  /** The field as data; its `kind` picks the hook and, with its `widget` hint, the widget. */
  definition: D;
  /** Keep the value in the nearest ArgStore (the URL, localStorage) under the definition's `id` (useStoredField). */
  stored?: boolean;
  /** The value, when the render site keeps it (with `onChange` or `commit`). */
  value?: unknown;
  onChange?: (value: any) => void;
  commit?: FieldCommit<any>;
  /** The widget, over the definition's hint: a name or `{ name, ...displayOptions }`. */
  widget?: WidgetHint;
  /** In a labelled antd form item (label, description tooltip, the last commit's messages). */
  item?: boolean;
} & Overrides & Record<string, unknown>;

type Storage = { value?: unknown; onChange?: (value: any) => void; commit?: FieldCommit<any> };

interface InnerProps {
  definition: FieldDefinition;
  storage: Storage;
  overrides: Overrides;
  widgetProps: Record<string, unknown>;
}

type KindHook = (options: any) => FieldControls<any, any>;

/** The definition's values the render site overrides; a pair (`enabled`/`disabled`, `visible`/`hidden`) is one value, replaced as a whole. */
function withOverrides<T extends object>(options: T, overrides: Overrides): T {
  const merged = { ...options } as Record<string, unknown>;
  const set = (key: keyof Overrides) => { if (overrides[key] !== undefined) merged[key] = overrides[key]; };
  const pair = (a: 'enabled' | 'visible', b: 'disabled' | 'hidden') => {
    if (overrides[a] === undefined && overrides[b] === undefined) return;
    delete merged[a];
    delete merged[b];
    set(a);
    set(b);
  };
  set('label');
  set('description');
  set('placeholder');
  pair('enabled', 'disabled');
  pair('visible', 'hidden');
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
function kindFields(kind: FieldKind, useKindField: KindHook) {
  function Plain({ definition, storage, overrides, widgetProps }: InnerProps) {
    const given = storage.value !== undefined || storage.onChange !== undefined || storage.commit !== undefined;
    const field = useKindField({ ...withOverrides(given ? outside(definition) : definition, overrides), ...storage });
    return <FieldWidget field={field} {...widgetProps} />;
  }
  function Stored({ definition, overrides, widgetProps }: InnerProps) {
    const stored = useStoredField(definition);
    const field = useKindField(withOverrides(stored.options, overrides));
    return <FieldWidget field={field} {...widgetProps} />;
  }
  Plain.displayName = `Field(${kind})`;
  Stored.displayName = `StoredField(${kind})`;
  return { Plain, Stored };
}

const KIND_FIELDS: Record<FieldKind, ReturnType<typeof kindFields>> = {
  boolean: kindFields('boolean', useBoolField),
  'mixed-boolean': kindFields('mixed-boolean', useMixedBoolField),
  oneOf: kindFields('oneOf', useOneOfField),
  manyOf: kindFields('manyOf', useManyOfField),
  numeric: kindFields('numeric', useNumericField),
  range: kindFields('range', useRangeField),
  tree: kindFields('tree', useTreeField),
  text: kindFields('text', useTextField),
};

/**
 * A field definition rendered: its kind's hook, then its widget (FieldWidget). Storage: inside
 * the field by default (from `initialValue`); `stored` keeps it in the nearest ArgStore; or the
 * render site passes `value` with `onChange` or `commit`. Render-site props win over the
 * definition: `label`, `description`, `enabled`/`disabled`, `visible`/`hidden` and
 * `placeholder` over its values, `widget` over its hint; the other props are the widget's
 * display options, over the hint's. `item` puts it in a labelled antd form item. An unknown
 * kind or widget name throws. A definition of another kind or id remounts the field.
 */
export function Field<D extends FieldDefinition>(props: FieldProps<D>) {
  const {
    definition, stored = false, value, onChange, commit,
    label, description, enabled, disabled, visible, hidden, placeholder,
    ...widgetProps
  } = props;
  const { id, kind } = definition;
  pickWidget(id, kind, props.widget, definition.widget);
  const storage: Storage = { value, onChange, commit };
  if (stored && (value !== undefined || onChange !== undefined || commit !== undefined)) {
    throw new Error(`Field '${id}': "stored" keeps the value in the ArgStore; it does not go together with "value", "onChange" or "commit"`);
  }
  const { Plain, Stored } = KIND_FIELDS[kind];
  const Inner = stored ? Stored : Plain;
  return (
    <Inner
      key={`${kind}:${id}`}
      definition={definition}
      storage={Object.fromEntries(Object.entries(storage).filter(([, v]) => v !== undefined))}
      overrides={{ label, description, enabled, disabled, visible, hidden, placeholder }}
      widgetProps={widgetProps}
    />
  );
}
