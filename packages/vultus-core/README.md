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
`description`, `valueDescription`, `messages`, `confirmationFor(next)`, ...) are what widgets
render: vultus-antd's `BoolSwitch` and `BoolCheckbox` take the same field.
`valueDescriptions` (texts keyed by value: `true`, `false`, `mixed`) say what the current value
means, next to `description` (what the field is).

`useMixedBoolField` is the same field over an aggregate: it shows `true`, `false` or `'mixed'`
and can be asked for `true` or `false` only (the field core separates the shown type from the
requestable one); a toggle from mixed requests `true`. `aggregateBool(values)` derives the
value; with no items at all, disable the field with a reason instead.

`useOneOfField` is a field whose value is one of a list of `choices` (static or derived):
each `{ value, label?, description?, icon?, enabled?/disabled?, variant? }`. A choice may
be disabled with a reason (a `Decision`, as a field's), and be `primary` or `danger` like an
action's variant; `description` (markdown) says what choosing it does and is also the field's
current state while it is chosen, unless `valueDescriptions` words that state differently.
Requesting a disabled or unknown choice is ignored with a warning. Storage is as for the
boolean field (inside: `initialValue`, default the first enabled choice); `confirmation` may
depend on the requested choice. vultus-antd's `OneOfSelect` and `OneOfSegmented` take the
same field.

## Distribution

This package ships compiled ESM (`dist/`) with TypeScript declarations to
npm; the repository's own `exports` field resolves `src/` directly for
workspace consumers.

## License

Apache-2.0
