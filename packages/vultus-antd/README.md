# vultus-antd

Ant Design action-button and markdown components for vultus. Depends on and
re-exports `vultus-core`, adding the Ant Design bindings for its injection
seams (`antd.message` for `MessageSinkContext`, Ant Design's `Form` for the
`FormLike` interface, and so on).

## Install

```sh
npm install vultus-antd
```

## Peer dependencies

- `antd` >=5
- `react` >=18
- `react-dom` >=18
- `react-i18next` >=15

## Entry points

- `.` — re-exports all of `vultus-core`, plus `VultusProvider`,
  `ActionButton`, `CombinedActionButton`, `FormSubmitButton`, `FormPanel`,
  and `ConfirmTypingModal`.
- `./markdown` — `Markdown` and the `MarkdownProps` type, standalone.

## CombinedActionButton selection

By default a menu pick becomes the main action and stays there. Pass
`keepOriginalDefault` (to `CombinedActionButton`, or to `ActionButton` with an
array) to return the main half to the first enabled action once the picked
action fires or its confirmation is dismissed.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.

## License

Apache-2.0
