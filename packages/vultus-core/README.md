# vultus-core

Framework-neutral action model, hooks, and error-routing for the vultus UI
family. It is antd-free by design: no Ant Design import appears anywhere in
this package. Consumed by `vultus-antd` and, transitively, by excavator and
optio-conversation-ui.

## Install

```sh
npm install vultus-core
```

## Peer dependencies

- `react` >=18
- `react-i18next` >=15

## Entry points

- `.` — the action model, exporting: the core `types`, `decision`, `resolve`,
  `parseApiError`, `routeApiError`, `ActionErrorContext` / `useActionErrorCtx`,
  `useAction`, `useActionList`, `InternalLinkContext` / `useInternalLink` /
  `InternalLinkComponent`, and `MessageSinkContext` / `useMessageSink` /
  `MessageSink`.
- `./link` — `InternalLinkContext`, `useInternalLink`, and the
  `InternalLinkComponent` type on their own, for consumers that only need the
  link-injection seam.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.

## License

Apache-2.0
