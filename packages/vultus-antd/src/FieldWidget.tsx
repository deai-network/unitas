import type { ComponentType } from 'react';
import type {
  BoolFieldControls, FieldControls, FieldKind, ManyOfFieldControls, MixedBoolFieldControls, NumericFieldControls,
  OneOfFieldControls, OneOfTreeFieldControls, RangeFieldControls, TextFieldControls, ManyOfTreeFieldControls, WidgetHint,
} from 'vultus-core';
import { BoolCheckbox } from './BoolCheckbox.js';
import { BoolSwitch } from './BoolSwitch.js';
import { FieldItem } from './FieldItem.js';
import { ManyOfCheckboxes } from './ManyOfCheckboxes.js';
import { ManyOfSelect } from './ManyOfSelect.js';
import { ManyOfSwitches } from './ManyOfSwitches.js';
import { NumericInput } from './NumericInput.js';
import { NumericSlider } from './NumericSlider.js';
import { OneOfSegmented } from './OneOfSegmented.js';
import { OneOfSelect } from './OneOfSelect.js';
import { OneOfSlider } from './OneOfSlider.js';
import { RangeSlider } from './RangeSlider.js';
import { SearchInput } from './SearchInput.js';
import { TextInput } from './TextInput.js';
import { ManyOfTreeChecklist, type ManyOfTreeChecklistProps } from './ManyOfTreeChecklist.js';
import { ManyOfTreePicker } from './ManyOfTreePicker.js';
import { OneOfTreePicker } from './OneOfTreePicker.js';

/**
 * Each kind's widgets by name (the spec's widget table). ManyOfTreeChecklist is listed with its public
 * props only, so its internal `nested` cannot be reached through a hint or a render-site prop.
 */
const WIDGETS = {
  boolean: { switch: BoolSwitch, checkbox: BoolCheckbox },
  'mixed-boolean': { switch: BoolSwitch, checkbox: BoolCheckbox },
  oneOf: { select: OneOfSelect, segmented: OneOfSegmented, slider: OneOfSlider },
  manyOf: { checkboxes: ManyOfCheckboxes, select: ManyOfSelect, switches: ManyOfSwitches },
  numeric: { input: NumericInput, slider: NumericSlider },
  range: { slider: RangeSlider },
  manyOfTree: { picker: ManyOfTreePicker, checklist: ManyOfTreeChecklist as (props: ManyOfTreeChecklistProps<string>) => ReturnType<typeof ManyOfTreeChecklist> },
  oneOfTree: { picker: OneOfTreePicker },
  text: { input: TextInput, search: SearchInput },
} satisfies Record<FieldKind, Record<string, ComponentType<any>>>;

type Widgets = typeof WIDGETS;

/** The widget names of kind `K` (of each kind, for a union of kinds). */
export type WidgetNameOf<K extends FieldKind> = K extends FieldKind ? keyof Widgets[K] & string : never;

/** The widget names a hint can give (general UI terms; which of them a kind has, see WidgetNameOf). */
export type WidgetName =
  | 'switch' | 'checkbox' | 'select' | 'segmented' | 'slider' | 'checkboxes' | 'switches'
  | 'input' | 'picker' | 'checklist' | 'search';

const DEFAULT_WIDGETS: { [K in FieldKind]: WidgetNameOf<K> } = {
  boolean: 'switch', 'mixed-boolean': 'switch', oneOf: 'select', manyOf: 'checkboxes',
  numeric: 'input', range: 'slider', manyOfTree: 'picker', oneOfTree: 'picker', text: 'input',
};

/** A widget's display props: its props without `field`. */
type DisplayProps<W> = W extends (props: infer P) => unknown ? Omit<P, 'field'> : never;

/** One widget's hint: its name, or its name with its display props. */
type HintFor<N, W> = N | ({ name: N } & DisplayProps<W>);

/** The hint for kind `K` (of each kind, for a union): one of its widgets' names, or `{ name, ...that widget's display props }`. */
export type WidgetHintOf<K extends FieldKind> = K extends FieldKind
  ? { [N in keyof Widgets[K]]: HintFor<N, Widgets[K][N]> }[keyof Widgets[K]]
  : never;

/** The keys of each member of a union. */
export type KeysOf<U> = U extends unknown ? keyof U : never;
type ValueAt<U, P extends PropertyKey> = U extends unknown ? (P extends keyof U ? U[P] : never) : never;
/** The members of a union as one object type: every key of any member, optional, typed as the union of the members' types for it. */
export type Merged<U> = { [P in KeysOf<U>]?: ValueAt<U, P> };

/** The display props of kind `K`'s widgets (of every kind, for a union), as one type: a widget ignores the others'. */
export type DisplayPropsOf<K extends FieldKind> = Merged<
  K extends FieldKind ? { [N in keyof Widgets[K]]: DisplayProps<Widgets[K][N]> }[keyof Widgets[K]] : never
>;

/** The controls each kind's hook returns. */
export interface ControlsByKind {
  boolean: BoolFieldControls;
  'mixed-boolean': MixedBoolFieldControls;
  oneOf: OneOfFieldControls;
  manyOf: ManyOfFieldControls;
  numeric: NumericFieldControls;
  range: RangeFieldControls;
  manyOfTree: ManyOfTreeFieldControls;
  oneOfTree: OneOfTreeFieldControls;
  text: TextFieldControls;
}

/** What a field of kind `K` shows (a union, for a union of kinds). */
export type FieldValueOf<K extends FieldKind> = ControlsByKind[K]['value'];
/** What a field of kind `K` can be asked for (a mixed-boolean shows 'mixed' but is asked for a boolean). */
export type FieldRequestOf<K extends FieldKind> = K extends FieldKind ? Parameters<ControlsByKind[K]['setValue']>[0] : never;

/**
 * The kind of a hook's controls, read from their shape (FieldControls' `type` is the whole
 * FieldKind union, so it cannot tell): every kind for controls of no known shape.
 */
export type KindOfControls<C> =
  C extends OneOfTreeFieldControls<any> ? 'oneOfTree'
  : C extends ManyOfTreeFieldControls<any> ? 'manyOfTree'
  : C extends ManyOfFieldControls<any> ? 'manyOf'
  : C extends OneOfFieldControls<any> ? 'oneOf'
  : C extends RangeFieldControls ? 'range'
  : C extends NumericFieldControls ? 'numeric'
  : C extends TextFieldControls ? 'text'
  : C extends MixedBoolFieldControls ? ('mixed' extends C['value'] ? 'mixed-boolean' : 'boolean')
  : FieldKind;

function nameOf(hint: WidgetHint | undefined): string | undefined {
  return typeof hint === 'string' ? hint : hint?.name;
}

function optionsOf(hint: WidgetHint | undefined): Record<string, unknown> {
  if (hint === undefined || typeof hint === 'string') return {};
  const { name: _name, ...options } = hint;
  return options;
}

/** The props actually given: one given as `undefined` does not override (as React's own defaults go). */
function given(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
}

/**
 * The widget for a field of `kind` and its display options. The name: the render site's hint,
 * else the definition's, else the kind's default. The options: the definition hint's (only
 * when its widget is the one rendered: they are that widget's options), then the render-site
 * hint's, then the render-site props, each over the one before. An unknown kind, or a name the
 * kind has no widget for, throws.
 */
export function pickWidget(
  id: string,
  kind: string,
  renderSite: WidgetHint | undefined,
  definition: WidgetHint | undefined,
  props: Record<string, unknown> = {},
): { name: WidgetName; Widget: ComponentType<any>; options: Record<string, unknown> } {
  const widgets: Record<string, ComponentType<any>> | undefined = Object.hasOwn(WIDGETS, kind) ? WIDGETS[kind as FieldKind] : undefined;
  const name = nameOf(renderSite) ?? nameOf(definition) ?? (widgets ? DEFAULT_WIDGETS[kind as FieldKind] : 'default');
  if (!widgets || !Object.hasOwn(widgets, name)) throw new Error(`Field '${id}': no widget '${name}' for kind '${kind}'`);
  const options = {
    ...(nameOf(definition) === name ? optionsOf(definition) : {}),
    ...optionsOf(renderSite),
    ...given(props),
  };
  return { name: name as WidgetName, Widget: widgets[name], options };
}

export type FieldWidgetProps<C extends FieldControls<any, any> = FieldControls<any, any>> = {
  /** Controls from a field hook (useOneOfField, ...); the widget is picked by their kind. */
  field: C;
  /** The widget, over the controls' own hint (`field.widget`): one of the kind's names, or `{ name, ...displayProps }`. */
  widget?: WidgetHintOf<KindOfControls<C>>;
  /** In a labelled antd form item (label, description tooltip, the last commit's messages); see FieldWidget. */
  item?: boolean;
} & DisplayPropsOf<KindOfControls<C>>;

/**
 * The widget for controls a caller made with a field hook (sidedao's InputField): picked by the
 * controls' `type`, by the render-site `widget`, else the controls' hint, else the kind's
 * default (boolean and mixed-boolean `switch`, oneOf `select`, manyOf `checkboxes`, numeric
 * `input`, range `slider`, manyOfTree and oneOfTree `picker`, text `input`). The other props
 * are the display props of the kind's widgets (`vertical`, `iconOnly`, `panel`, `onEnter`,
 * `style`, ...), over the hint's. An unknown kind or widget name throws.
 *
 * With `item`, the last commit's messages show under the control. The action layer also sends
 * them to the MessageSink (an antd message under VultusProvider), so they would show twice:
 * `<Field item>` silences the sink for its field, and a caller of `<FieldWidget item>` does the
 * same above its hook: `<MessageSinkContext.Provider value={SILENT}>` with a module-level no-op,
 * `const SILENT = () => {}` (a new function on every render would re-create the field's setter).
 */
export function FieldWidget<C extends FieldControls<any, any>>({ field, widget, item, ...props }: FieldWidgetProps<C>) {
  const { name, Widget, options } = pickWidget(field.id, field.type, widget as WidgetHint | undefined, field.widget, props);
  const control = <Widget {...options} field={field} />;
  return item ? <FieldItem field={field} showLabel={name !== 'checkbox'}>{control}</FieldItem> : control;
}

/** A compile-time check: every widget name of every kind is a WidgetName, and every WidgetName names a widget. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type WidgetNamesAreTheTable = Assert<Same<WidgetNameOf<FieldKind>, WidgetName>>;
