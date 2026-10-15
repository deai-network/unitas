import { denyWithReason, type FieldDefinition, type OneOfChoice, type TreeNode } from 'vultus-antd';

/**
 * A competition-maths task module's filters as data (Praeceptor's case): what the module
 * declares, for the framework to render with `<Field>` and keep in the URL.
 */

export const schoolYear = (y: number) => `${y}/${String(y + 1).slice(-2)}`;

export const GRADES: OneOfChoice[] = [
  { value: 'any', label: 'Any' },
  { value: '9', label: '9' },
  { value: '10', label: '10' },
  { value: '11', label: '11' },
  { value: '12', label: '12' },
];

/** The rounds, each with its number of tasks as the note; one with none is dimmed. */
export const ROUNDS: OneOfChoice[] = [
  { value: 'school', label: 'School round', note: '41' },
  { value: 'regional', label: 'Regional round', note: '18' },
  { value: 'final', label: 'Final', note: '7' },
  { value: 'international', label: 'International', note: '0', dimmed: true },
];

const leaf = (value: string, label: string, tasks: number): TreeNode => ({ value, label, note: String(tasks), dimmed: tasks === 0 });

export const CATEGORIES: TreeNode[] = [
  { ...leaf('algebra', 'Algebra', 12), children: [
    leaf('egyenletek', 'Egyenletek', 7), leaf('egyenlotlensegek', 'Egyenlőtlenségek', 5), leaf('fuggvenyek', 'Függvények', 0),
  ] },
  { ...leaf('szamelmelet', 'Számelmélet', 9), children: [
    leaf('oszthatosag', 'Oszthatóság', 6), leaf('lnko', 'Osztók, legnagyobb közös osztó', 3),
  ] },
  { ...leaf('geometria', 'Geometria', 6), children: [
    leaf('sikgeometria', 'Síkgeometria', 6),
    { ...leaf('tergeometria', 'Térgeometria', 0), enabled: denyWithReason('Not taught before grade 9.') },
  ] },
  leaf('logika', 'Logikai feladatok', 3),
];

/** The module's filters: every storable kind, some with a widget hint. */
export const TASK_FILTERS: FieldDefinition[] = [
  { kind: 'text', id: 'q', label: 'Search', placeholder: 'Words in the task', widget: 'search' },
  { kind: 'oneOf', id: 'grade', label: 'Grade', description: 'The grade the tasks were set for.', choices: GRADES, widget: 'segmented' },
  { kind: 'manyOf', id: 'rounds', label: 'Rounds', description: 'None checked: every round.', choices: ROUNDS },
  { kind: 'tree', id: 'categories', label: 'Categories', description: 'Tasks filed under these categories.', nodes: CATEGORIES, placeholder: 'All categories' },
  {
    kind: 'range', id: 'years', label: 'School years', min: 2010, max: 2025, format: schoolYear,
    widget: { name: 'slider', showValue: true, style: { width: 260 } },
  },
  { kind: 'numeric', id: 'difficulty', label: 'Difficulty at least', min: 1, max: 5, integer: true, widget: { name: 'slider', showValue: true, style: { width: 200 } } },
  { kind: 'boolean', id: 'unsolved', label: 'Only the ones I have not solved' },
];
