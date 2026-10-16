# vultus: field groups

Date: 2026-10-16. Builds on `2026-10-15-vultus-field-kinds-design.md` and
`2026-10-15-vultus-one-of-tree-design.md`, whose conventions apply unless this says otherwise.

## Why

A field's options sometimes depend on another field's value: a print dialog offers some paper
sizes only for one layout; a filter shows a sub-filter only when another is on. With hooks this
already works (every option takes a plain value computed from the other field's controls), but
definitions as data (a Praeceptor module's `filters`, `printOptions`) have no way to say it: their
functions receive only the app's field context.

Prior work: moxb's option thunks closed over sibling fields through `this` (mobx computeds);
sidedao ran every field hook in one form hook and computed options from earlier fields'
`.value` on each render. Neither had a context-based mechanism; this design delivers moxb's idea
(a definition's functions see its siblings) through vultus's field context.

## Decisions (owner, 2026-10-16)

1. **Which options may read other fields**: every option function (`label`, `description`,
   `placeholder`, `visible` / `hidden`, `enabled` / `disabled`, `choices`, a tree's `nodes`,
   `min` / `max`, ...) except `initialValue` (timing; not now).
2. **A hidden field** keeps its value (and others still see it).
3. **Pull only**: no field writes into another; no derived values pushed.
4. **The model stays in metadata**: which fields belong together is decided by the data, not by
   the UI tree. The group is the list of definitions run together (a module's `filters` list);
   no group object in the metadata.
5. **A value another field's change made invalid** shows its fallback, and the other fields see
   that fallback; nothing is written, and the kept value comes back when it is valid again
   (as stored fields already behave).

## References (the metadata)

- Every option function of a group's definition receives `ctx.values`: the group's values by
  field id, as the fields show them (after the fallback rule below).

  ```ts
  { kind: 'oneOf', id: 'paper', choices: (ctx) => ctx.values.layout === 'rendered' ? A_SIZES : ALL_SIZES }
  { kind: 'numeric', id: 'copies', visible: (ctx) => ctx.values.layout === 'original' }
  ```
- `values` sits beside the app's own field context keys (the nearest `FieldContextProvider`),
  which keep working. If the app's context already has a `values` key, the group throws instead
  of shadowing it.
- **Loud failures** (each names the field and option, as missing context keys do today):
  - reading an id that is not in the group: `Field 'paper': option 'choices': no field 'layot'
    in the group (fields: layout, paper, copies)`;
  - reading `ctx.values` outside a group: `... ctx.values is only available inside a field group`;
  - reading `ctx.values` from `initialValue`: `... initialValue cannot read other fields' values`;
  - two definitions with the same id in a group.
- **Defaults follow the options.** A field's default is its `initialValue` (resolved without
  `values`), else its kind's implicit initial value computed from its current options (the
  first enabled choice of its current `choices`, a tree's first choosable node, `min`, ...), so
  it can depend on other fields through those options.
- **Dependencies and cycles.** A field's shown value can depend on another's (B's `choices` read
  A; B's fallback is checked against those choices; B's default comes from them). Shown values
  are computed on demand, by id, once per render. When two fields' shown values depend on each
  other (A's choices read B and B's read A), the group throws, naming the cycle:
  `Fields 'a' -> 'b' -> 'a' depend on each other's values`. Options that never affect a value
  (`visible`, `enabled`, `label`, ...) cannot form a cycle.
- **The fallback rule**: a field's shown value is its kept value checked as stored fields are
  checked today (`sanitizeStored`: a value naming no current choice, a node that cannot be
  chosen, a number outside the current bounds, ...), with its options evaluated in the group's
  context; an invalid value shows the field's fallback. The kept value is never rewritten.
- **mixed-boolean** cannot be in a group (it shows an aggregate of other data, not a value of its
  own); the group throws.

## The runtime (vultus-core): `useFieldGroup`

```ts
const group = useFieldGroup(printOptions, { stored: true });
group.fields          // each field's controls, in definition order
group.byId.paper      // the same controls, by id
group.values          // the shown values, by id (the same object until one changes)
group.isDefault(id), group.changedCount, group.resetAll()
```

- **Storage, for the whole group, is the runner's choice.**
  - Default: the group's own state, kept exactly as a store keeps it: a field never set (or set
    to its current default) has no kept value and reads as its current default, so both storage
    modes behave alike. `resetAll()` clears every kept value. A fallback here is silent (it is
    the designed behaviour, not bad input).
  - `stored: true`: the nearest `ArgStore` (the URL, localStorage) under each field's id, as
    `useStoredField` does: a value equal to the field's current default is kept as an absent
    key, so an absent key reads as the current default; `hrefFor` links each value; a stored
    raw value that does not parse, or falls back, warns once, in the render that first reads
    it, as `useStoredField`'s does. A value that falls back later, because another field
    changed, does not warn. `resetAll(method = 'replace')` resets every key in one write.
  - Mixing storage modes in one group: not in this design.
- **Controls**: each field's controls are exactly what its kind's hook returns, with the same
  types, so every widget works unchanged; `setValue` (through the kind's own checks) writes the
  kept value; the component running the group re-renders and every option recomputes.
- **Chained writes in one event** (`layout.setValue('original'); paper.setValue('letter')` in
  one handler): each write goes through the kind's own request check against the rendered
  options, so a request that becomes valid only through an earlier write in the same event is
  refused (`Field 'paper': 'letter' is not one of its choices`), as with plain hooks. Whether a
  write equals the field's default (and so is kept as nothing) is decided under the kept values
  at write time, the event's earlier writes included, in both storage modes.
- **`isDefault(id)` / `changedCount`**: whether a field's shown value equals its current default,
  and how many do not; `isDefault` throws for an id not in the group:
  `Field group: no field 'layot' in the group (fields: layout, paper, copies)`.
- **Shape**: the list keeps the same ids and kinds in the same order across renders (hooks run
  per field); a changed shape throws, telling the app to remount (a React `key`) to swap lists:
  ``Field group: the fields changed from layout (oneOf), paper (oneOf), copies (numeric) to
  layout (oneOf), paper (text), copies (numeric); a group runs hooks per field, so it keeps the
  same ids and kinds, in order, across renders: to swap lists, remount the component running it
  with a React `key` ``. Switching between the two storages is a change of shape too:
  ``Field group: the storage changed from the group's own state to the nearest ArgStore
  ({ stored: true }); a group runs other hooks for each, so it keeps its storage across renders:
  to switch, remount the component running it with a React `key` ``. The definitions' contents
  may change.
- **Single fields are unchanged**: `useStoredField`, `useStoredFields`, `<Field definition>` and
  the kind hooks work as before.
- **Typing**: `ctx.values` is `any` by default (`FieldDefinition`'s context type defaults to
  `any`); an app wanting it typed declares `values` in its context type (`FieldDefinition<Ctx>`,
  `createFieldContext<Ctx>()`).

## UI (vultus-antd)

Nothing new: the app renders the group's controls with the existing `<FieldWidget>` (the
definition's widget hint, `item`), in order or by id:

```tsx
{group.fields.map((f) => <FieldWidget key={f.id} field={f} item />)}
```

## Gallery

`Definitions/Field group`: a print dialog whose `paper` choices depend on `layout` and whose
`copies` shows for one layout only; a stored version in the URL under a router, where changing
`layout` away and back brings the earlier paper size back.

## Docs

vultus-core README: a "Field groups" section. vultus-antd README: one line under `<FieldWidget>`.

## Testing

- vultus-core: references across fields; each loud error above; the fallback rule in both
  storage modes, including the kept value coming back; defaults that follow options; cycles
  named; a hidden field keeping its value; the shape check; stored mode (absent key as current
  default, `hrefFor`, one warning per raw value, `resetAll` in one write); `isDefault` /
  `changedCount`; the app context's keys still readable beside `values`.
- vultus-react-router: a stored group over `ReactRouterArgStore`.
- vultus-antd: a group's controls rendered with `<FieldWidget>` (requests reach the group; an
  option depending on another field updates the widget).

## Release

vultus-core 0.5.4 (additive). vultus-antd and vultus-react-router unchanged (tests only).

## Not in this design

- `initialValue` reading other fields.
- Pushing derived values into fields.
- Mixed storage in one group; groups nested in, or referring to, other groups.
