import type { FieldControls, FieldKind } from './field.js';
import type { FieldDefinition } from './kinds.js';
import { useBoolField } from './useBoolField.js';
import { useManyOfField } from './useManyOfField.js';
import { useManyOfTreeField } from './useManyOfTreeField.js';
import { useMixedBoolField } from './useMixedBoolField.js';
import { useNumericField } from './useNumericField.js';
import { useOneOfField } from './useOneOfField.js';
import { useOneOfTreeField } from './useOneOfTreeField.js';
import { useRangeField } from './useRangeField.js';
import { useTextField } from './useTextField.js';

/**
 * A definition in its outside form, as its kind's hook takes it: without `initialValue` (whoever
 * keeps the value keeps its default too), with the value, its writer, and the link a value
 * amounts to where whoever keeps it has one. `permanent` stays on it, and the hook does not read it.
 */
export type KindFieldOptions = OutsideForm<FieldDefinition>;

/** The outside form of a definition, member by member for a union (the conditional type distributes). */
type OutsideForm<D> = D extends FieldDefinition
  ? Omit<D, 'initialValue'> & { value: unknown; onChange(value: any): void; hrefFor?(value: any): string | undefined }
  : never;

/**
 * Each kind's hook. Its options are checked against the definition in kinds.ts
 * (DefinitionsFitTheirHooks); the mapped type makes leaving a kind out a compile error.
 */
const KIND_HOOKS: { [K in FieldKind]: (options: any) => FieldControls<any, any> } = {
  boolean: useBoolField,
  'mixed-boolean': useMixedBoolField,
  oneOf: useOneOfField,
  manyOf: useManyOfField,
  numeric: useNumericField,
  range: useRangeField,
  manyOfTree: useManyOfTreeField,
  oneOfTree: useOneOfTreeField,
  text: useTextField,
};

/**
 * Runs the hook of `definition`'s kind with `options` and returns its controls, exactly as that
 * hook returns them. The hook called depends on the kind, so a caller running several fields
 * (useFieldGroup) keeps each field's kind the same across renders. A kind that is none of
 * FieldKind's (plain data can carry anything) throws, naming the field.
 */
export function useKindField(definition: FieldDefinition, options: KindFieldOptions): FieldControls<any, any> {
  const { id, kind } = definition;
  if (!Object.hasOwn(KIND_HOOKS, kind)) throw new Error(`Field '${id}': unknown kind '${String(kind)}'`);
  const useHook = KIND_HOOKS[kind];
  return useHook(options);
}
