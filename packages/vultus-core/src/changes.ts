// The `/changes` subpath: `import { ... } from 'vultus-core/changes'`.
// Text changes: what changed between two versions of a text, found and lit up, drawn by the
// `ChangeMark` an app lends (`VultusComponents`), else by vultus's static fallback. Kept out of the
// main entry, which stays light: only an app that shows text changes loads diff-match-patch.
export { changesIn, type Change, type ChangeLevel } from './changes/changesIn.js';
export { readText, type Reading, type ReadTextOptions, type TextPiece, type TextPlaces } from './changes/readText.js';
export { changeDurations, type ChangeDurations, type ChangeSpeed } from './changes/changeDurations.js';
export {
  useTextChanges, type NearBlocks, type TextChanges, type TextChangesOptions, type TextChangesPart,
} from './changes/useTextChanges.js';
export { ChangingText, type ChangingTextProps } from './changes/ChangingText.js';
export type { ChangeComponents } from './changes/ChangeMark.js';
export type { BlockAttribute } from './changes/rehypeChanges.js';
export type { ContainerOption } from './changes/visibleBlocks.js';
