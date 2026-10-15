import type { ComponentType } from 'react';
import type { FieldControls, FieldKind, WidgetHint } from 'vultus-core';
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
import { TreeChecklist } from './TreeChecklist.js';
import { TreePicker } from './TreePicker.js';

/** The widget names a hint can give (general UI terms; which of them a kind has, see WIDGETS). */
export type WidgetName =
  | 'switch' | 'checkbox' | 'select' | 'segmented' | 'slider' | 'checkboxes' | 'switches'
  | 'input' | 'picker' | 'checklist' | 'search';

type Widget = ComponentType<any>;

/** Each kind's widgets by name; the first is the kind's default. */
const WIDGETS: Record<FieldKind, [WidgetName, Widget][]> = {
  boolean: [['switch', BoolSwitch], ['checkbox', BoolCheckbox]],
  'mixed-boolean': [['switch', BoolSwitch], ['checkbox', BoolCheckbox]],
  oneOf: [['select', OneOfSelect], ['segmented', OneOfSegmented], ['slider', OneOfSlider]],
  manyOf: [['checkboxes', ManyOfCheckboxes], ['select', ManyOfSelect], ['switches', ManyOfSwitches]],
  numeric: [['input', NumericInput], ['slider', NumericSlider]],
  range: [['slider', RangeSlider]],
  tree: [['picker', TreePicker], ['checklist', TreeChecklist]],
  text: [['input', TextInput], ['search', SearchInput]],
};

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
): { name: WidgetName; Widget: Widget; options: Record<string, unknown> } {
  const widgets = Object.hasOwn(WIDGETS, kind) ? WIDGETS[kind as FieldKind] : undefined;
  const name = nameOf(renderSite) ?? nameOf(definition) ?? widgets?.[0][0] ?? 'default';
  const found = widgets?.find(([n]) => n === name);
  if (!found) throw new Error(`Field '${id}': no widget '${name}' for kind '${kind}'`);
  const options = {
    ...(nameOf(definition) === name ? optionsOf(definition) : {}),
    ...optionsOf(renderSite),
    ...given(props),
  };
  return { name: found[0], Widget: found[1], options };
}

export type FieldWidgetProps = {
  /** Controls from a field hook (useOneOfField, ...); the widget is picked by their `type`. */
  field: FieldControls<any, any>;
  /** The widget, over the controls' own hint (`field.widget`): a name or `{ name, ...displayOptions }`. */
  widget?: WidgetHint;
  /** In a labelled antd form item (FieldItem): label, description tooltip, the last commit's messages. */
  item?: boolean;
} & Record<string, unknown>;

/**
 * The widget for controls a caller made with a field hook (sidedao's InputField): picked by the
 * controls' `type`, by the render-site `widget`, else the controls' hint, else the kind's
 * default (boolean and mixed-boolean `switch`, oneOf `select`, manyOf `checkboxes`, numeric
 * `input`, range `slider`, tree `picker`, text `input`). The other props are the widget's
 * display options (`vertical`, `iconOnly`, `panel`, `onEnter`, `style`, ...), over the hint's.
 * An unknown kind or widget name throws.
 */
export function FieldWidget({ field, widget, item, ...props }: FieldWidgetProps) {
  const { name, Widget, options } = pickWidget(field.id, field.type, widget, field.widget, props);
  const control = <Widget {...options} field={field} />;
  return item ? <FieldItem field={field} showLabel={name !== 'checkbox'}>{control}</FieldItem> : control;
}
