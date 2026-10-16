import { extendFieldContext, guardKeys, MissingKeyError, type FieldCtx } from './FieldContext.js';
import { initialValueOf, sanitizeStored, type FieldDefinition } from './kinds.js';

/**
 * One render's values of a field group (see useFieldGroup): each field's shown value and
 * default, computed on demand by id from the kept values, with the definitions' options
 * evaluated in the group's context, and each computed once.
 */
export interface GroupValues {
  /**
   * The field context the group's option functions receive: the app's own keys (guarded as a
   * provider's value is) and `values`, the fields' shown values by id.
   */
  ctx: object;
  /**
   * A field's shown value: its kept value, else its current default, made fit for its options
   * as they are now (sanitizeStored); one that no longer fits shows the field's fallback. The
   * kept value itself is never touched, so it shows again once it fits again.
   */
  valueOf(id: string): unknown;
  /**
   * A field's default: its `initialValue` (which cannot read `values`), else its kind's
   * implicit initial value from its options as they are now (the first enabled choice, `min`,
   * ...), so it moves with the fields those options read.
   */
  defaultOf(id: string): unknown;
  /** The shown values by id, each computed when first read; `ctx.values` is the same object. */
  values: Readonly<Record<string, unknown>>;
}

/** What createGroupValues computes the values from. */
export interface GroupValuesParams {
  /** The group's fields, as data: unique ids, no mixed-boolean. */
  definitions: readonly FieldDefinition[];
  /** The app's field context (useFieldContext), which `values` is added to. */
  appCtx: FieldCtx;
  /** A field's kept value; `undefined` when none is kept, so the field shows its current default. */
  kept(id: string): unknown | undefined;
  /**
   * Where a kept value's sanitizing warnings go, with the field's id: the caller decides whether
   * to show them (and how often). A default made fit is the definer's, not kept input, so it
   * never warns.
   */
  warn(id: string, message: string): void;
}

const WHERE = 'Field group';
const INITIAL_VALUE_READS_VALUES = "initialValue cannot read other fields' values";
const NOT_IN_A_GROUP = 'a mixed-boolean field shows an aggregate of other data, not a value of its own, so it cannot be in a field group';

function silently(_message: string): void {}

/**
 * A definition as its values are computed from it. Its `initialValue` function receives
 * `initialCtx`, whose `values` throws: a default cannot depend on other fields' values. A
 * number's or range's display options (`step`, `unit`, `format`) are left out, because resolving
 * its bounds (resolveNumeric) resolves them too, and an option that never affects the value
 * (`unit: (ctx) => ctx.values.copies === 1 ? ...`) must not count as a dependency, nor form a
 * cycle.
 */
function forComputingValues(definition: FieldDefinition, initialCtx: object): FieldDefinition {
  const computing = { ...definition };
  const { initialValue } = definition;
  if (typeof initialValue === 'function') {
    Object.assign(computing, { initialValue: () => (initialValue as (ctx: object) => unknown)(initialCtx) });
  }
  if (computing.kind === 'numeric' || computing.kind === 'range') {
    delete computing.step;
    delete computing.unit;
    delete computing.format;
  }
  return computing;
}

/**
 * The values of a field group for one render, computed from its definitions and kept values.
 *
 * Every option function of the definitions receives `ctx`: the app's field context and
 * `values`, the fields' shown values by id. A field's value is computed when an option (or the
 * caller) first reads it, and kept for the rest of this snapshot; a new render makes a new one.
 * The shown value is the kept value (else the current default) checked against the field's
 * options as they are now, as a store's value is (sanitizeStored); one that no longer fits
 * shows the fallback, which the other fields see too.
 *
 * Throws here for two definitions with the same id and for a mixed-boolean definition (naming
 * the field), and for an app context that already has `values`. Throws when read, naming the
 * field and the option, for an option reading an id not in the group and for `initialValue`
 * reading `values`. Fields whose values depend on each other throw when read, naming the cycle
 * (`Fields 'a' -> 'b' -> 'a' depend on each other's values`): a field's value and default are in
 * progress while its options run, and reading one in progress is a cycle. Options that never
 * affect a value (`visible`, `label`, `unit`, ...) are not run here, so they cannot form one.
 */
export function createGroupValues({ definitions, appCtx, kept, warn }: GroupValuesParams): GroupValues {
  const ids = definitions.map((definition) => definition.id);
  for (const definition of definitions) {
    if (ids.indexOf(definition.id) !== ids.lastIndexOf(definition.id)) {
      throw new Error(`Field '${definition.id}': another field in the group has the same id`);
    }
    if (definition.kind === 'mixed-boolean') throw new Error(`Field '${definition.id}': ${NOT_IN_A_GROUP}`);
  }
  const noField = (id: string) => `no field '${id}' in the group (fields: ${ids.join(', ')})`;

  const getters: Record<string, unknown> = {};
  for (const id of ids) Object.defineProperty(getters, id, { get: () => valueOf(id), enumerable: true });
  // Own keys only: `values.toString` is a typo for an id, not Object's member. `constructor`
  // reads as usual, as the probes do, because printers (vitest's) name an object by it.
  const values = guardKeys(getters, noField, (target, key) => key === 'constructor' || Object.hasOwn(target, key)) as
    Readonly<Record<string, unknown>>;
  const ctx = extendFieldContext(appCtx, { values }, WHERE);
  // `values` not enumerable: a missing key's message lists the keys provided, and this one only throws.
  const initialCtx = extendFieldContext(appCtx, Object.defineProperty<Record<string, unknown>>({}, 'values', {
    get(): never {
      throw new MissingKeyError(INITIAL_VALUE_READS_VALUES);
    },
  }), WHERE);
  const computingDefinitions = new Map(definitions.map((definition) => [definition.id, forComputingValues(definition, initialCtx)]));

  const shown = new Map<string, unknown>();
  const defaults = new Map<string, unknown>();
  /** The fields whose value or default is being computed, outermost first. */
  const inProgress: string[] = [];

  function definitionOf(id: string): FieldDefinition {
    const definition = computingDefinitions.get(id);
    if (definition === undefined) throw new MissingKeyError(noField(id));
    return definition;
  }

  /** Runs `compute` with `id` in progress; reading `id` again before it returns is a cycle. */
  function computing<T>(id: string, compute: () => T): T {
    const at = inProgress.indexOf(id);
    if (at !== -1) {
      const cycle = [...inProgress.slice(at), id].map((each) => `'${each}'`).join(' -> ');
      throw new Error(`Fields ${cycle} depend on each other's values`);
    }
    inProgress.push(id);
    try {
      return compute();
    } finally {
      inProgress.pop();
    }
  }

  /** The default, computed as part of `id`'s own value or default (already in progress). */
  function ownDefault(id: string): unknown {
    if (!defaults.has(id)) defaults.set(id, initialValueOf(definitionOf(id), ctx));
    return defaults.get(id);
  }

  function defaultOf(id: string): unknown {
    definitionOf(id);
    return defaults.has(id) ? defaults.get(id) : computing(id, () => ownDefault(id));
  }

  function valueOf(id: string): unknown {
    const definition = definitionOf(id);
    if (!shown.has(id)) {
      shown.set(id, computing(id, () => {
        const value = kept(id);
        return value === undefined
          ? sanitizeStored(definition, ownDefault(id), ctx, silently)
          : sanitizeStored(definition, value, ctx, (message) => warn(id, message));
      }));
    }
    return shown.get(id);
  }

  return { ctx, valueOf, defaultOf, values };
}
