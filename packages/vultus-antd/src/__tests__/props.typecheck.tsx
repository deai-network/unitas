// Compile-time checks of vultus-antd's public types. Not a test file (vitest does not run it) and
// not shipped (src/**/__tests__ is outside the build and the package's files): tsconfig.typecheck.json
// type-checks it — `pnpm typecheck` in this package, beside `tsc -p tsconfig.json`.
import type {
  FieldControls, FieldDefinition, OneOfFieldControls, TextFieldControls, ManyOfTreeFieldControls,
} from 'vultus-core';
import {
  ChoiceLabel, Field, FieldWidget,
  type ManyOfCheckboxesProps, type ManyOfSelectProps, type ManyOfSwitchesProps, type NumericInputProps,
  type NumericSliderProps, type RangeSliderProps, type RequestableField, type SearchInputProps, type TextInputProps,
  type ManyOfTreeChecklistProps, type ManyOfTreePickerProps,
} from '../index.js';

/** The definition of kind `K` (FieldDefinition's member). */
type DefinitionOf<K extends FieldDefinition['kind']> = Extract<FieldDefinition, { kind: K }>;

/** Compile-time checks of Field's props: typed by the definition's kind, and by every kind for the FieldDefinition union. */
function fieldPropsAreTyped(
  wide: FieldDefinition, bool: DefinitionOf<'boolean'>, oneOf: DefinitionOf<'oneOf'>, range: DefinitionOf<'range'>,
  tree: DefinitionOf<'manyOfTree'>, mixed: DefinitionOf<'mixed-boolean'>,
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
    // @ts-expect-error -- with stored, the store keeps the value: no value of the render site's.
    <Field definition={oneOf} stored value="a" />,
    // @ts-expect-error -- nor an onChange.
    <Field definition={oneOf} stored onChange={(next) => takesString(next)} />,
    // @ts-expect-error -- nor a commit.
    <Field definition={bool} stored commit={{ fire: (next: boolean) => { void next; } }} />,
    // @ts-expect-error -- nor an hrefFor: the store gives its own.
    <Field definition={oneOf} stored hrefFor={(next) => takesString(next)} />,
    // @ts-expect-error -- for a definition typed as the union too.
    <Field definition={wide} stored value="a" />,
    <Field definition={oneOf} stored={false} value="a" onChange={(next) => takesString(next)} />,
    <Field definition={oneOf} value="a" onChange={(next) => takesString(next)} hrefFor={(next) => takesString(next)} />,
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
    // @ts-expect-error -- ManyOfTreeChecklist's internal `nested` is not a display prop.
    <Field definition={tree} widget="checklist" nested />,
    // @ts-expect-error -- onEnter receives the typed text, a string.
    <Field definition={wide} onEnter={(typed: number) => typed} />,
    // @ts-expect-error -- `id` is not overridable.
    <Field definition={bool} id="other" />,
    // @ts-expect-error -- vertical is a many-of widget's prop, not a boolean widget's.
    <Field definition={bool} vertical />,
  ];
}

/** Compile-time checks of FieldWidget's props, keyed on the controls' kind. */
function fieldWidgetPropsAreTyped(oneOf: OneOfFieldControls, tree: ManyOfTreeFieldControls, text: TextFieldControls, any: FieldControls<any, any>) {
  return [
    <FieldWidget field={oneOf} widget="segmented" iconOnly />,
    <FieldWidget field={oneOf} widget={{ name: 'segmented', iconOnly: true }} />,
    <FieldWidget field={text} widget="search" onEnter={(typed) => typed.toUpperCase()} />,
    <FieldWidget field={any} widget="checklist" vertical />,
    // @ts-expect-error -- a one-of field has no checkboxes widget.
    <FieldWidget field={oneOf} widget="checkboxes" />,
    // @ts-expect-error -- a misspelled display prop.
    <FieldWidget field={oneOf} iconOnyl />,
    // @ts-expect-error -- vertical is a many-of widget's prop, not a one-of widget's.
    <FieldWidget field={oneOf} vertical />,
    // @ts-expect-error -- ManyOfTreeChecklist's internal `nested` is not a display prop.
    <FieldWidget field={tree} widget="checklist" nested />,
    // @ts-expect-error -- nor can a hint reach it.
    <FieldWidget field={tree} widget={{ name: 'checklist', nested: true }} />,
    // @ts-expect-error -- onEnter receives the typed text, a string.
    <FieldWidget field={text} widget="search" onEnter={(typed: number) => typed} />,
  ];
}

/** A compile-time check: a choice built by hand for ChoiceLabel needs no `dimmed` (it came later; a missing one is not dimmed). */
function choiceLabelTakesAChoiceWithoutDimmed() {
  return [
    <ChoiceLabel choice={{ label: 'Paper', enabled: true, variant: 'default', icon: undefined }} />,
    <ChoiceLabel choice={{ label: 'Paper', enabled: true, variant: 'primary', icon: undefined, dimmed: true }} />,
  ];
}

/** A compile-time check: every new widget's props type is exported, and so is the request hooks' field shape. */
type WidgetPropsAreExported = [
  ManyOfCheckboxesProps<string>, ManyOfSwitchesProps<string>, ManyOfSelectProps<string>, NumericInputProps,
  NumericSliderProps, RangeSliderProps, ManyOfTreeChecklistProps<string>, ManyOfTreePickerProps<string>, TextInputProps,
  SearchInputProps, RequestableField<string>,
];

export {
  choiceLabelTakesAChoiceWithoutDimmed, fieldPropsAreTyped, fieldWidgetPropsAreTyped, type WidgetPropsAreExported,
};
