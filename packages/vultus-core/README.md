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
  `useAction`, `useActionList`, the fields (`useBoolField`, `useFieldCore` and
  their types), `InternalLinkContext` / `useInternalLink` /
  `InternalLinkComponent`, and `MessageSinkContext` / `useMessageSink` /
  `MessageSink`.
- `./link` — `InternalLinkContext`, `useInternalLink`, and the
  `InternalLinkComponent` type on their own, for consumers that only need the
  link-injection seam.

## Actions report messages

An action's `fire(args, ctx)` receives an `ExecutionContext` next to its arguments:
`ctx.info(text)`, `ctx.warn(text)` and `ctx.error(text)` report messages while it runs.
They land on the action's status as `messages` (with their `severity`) and go to the
`MessageSink` (`(text, severity?)`). A thrown error still fails the action and ends the
run's messages; `errors` lists the error texts among them.

## Fields

`useBoolField(options)` is the first field hook: the value half of vultus, next to
actions. Fields are built by composition on a shared core (`useFieldCore`): label,
description, `visible`/`hidden`, `enabled`/`disabled` (a `Decision`, so with a reason),
and where the value lives:

- inside the field: `initialValue` (default `false`), changed locally;
- outside, changed locally: `value` + `onChange` (the caller owns the value, e.g. a form);
- outside, committed immediately: `value` + `commit: { fire(next, ctx), confirmation?, errorRoute? }`.
  The commit runs as an action, so the field is `pending` while it runs and carries its
  `messages`; afterwards it shows whatever `value` the caller passes. `confirmation` may
  depend on the requested value.

The returned controls (`value`, `setValue`, `toggle`, `pending`, `enabled`, `whyDisabled`,
`messages`, `confirmationFor(next)`, ...) are what widgets render: vultus-antd's
`BoolSwitch` and `BoolCheckbox` take the same field.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.

## License

Apache-2.0
