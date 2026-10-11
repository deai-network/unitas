# Spinner slot: an app-provided loading spinner for vultus and optio

Design, agreed with the owner on 2026-10-11. Covers vultus-core, vultus-antd, optio-ui and
optio-conversation-ui; the optio side is summarised in optio `docs/2026-10-11-spinner-slot-design.md`.

## Why

The libraries show loading states with antd's `<Spin>` and antd's built-in loading icons. An app
with its own loading spinner (daeo-style's `DaeoSpinner`: branded, and one variant per spinner
identity across the page) cannot reach them: antd's `ConfigProvider spin.indicator` is a single
shared element with no identity. The libraries must stay independent of any such app library.

## Decisions (owner, 2026-10-11)

1. **One slot, in vultus-core.** optio-ui gains a dependency on vultus-core (a peer, so an app has one
   copy and one context).
2. **The prop is `components={{ Spinner }}`**, an object with room for later slots.
3. **The spinner's identity is a required `spinnerKey` prop.**
4. **Key scopes**: a subtree can be given a scope name; every spinner key inside is prefixed with the
   scope chain, so library-local keys (`vultus:action:send`) become unique when a page shows several
   instances (`optio:process:<id>/vultus:action:send`).
5. **The provided spinner wins** over optio-conversation-ui's agent-brand "native" spinners.
6. **BoolSwitch**: antd's Switch has no icon slot, so with a provided spinner the Switch shows no
   built-in spinner and the provided one appears right after it (as BoolCheckbox already does).
7. **Without a provider nothing changes**: every site renders exactly as today (antd).

## API (vultus-core, no antd)

```ts
export interface SpinnerProps {
  /** The spinner's identity: stable across re-renders and remounts, unique on the page (after scoping). */
  spinnerKey: string;
  /** antd's names (the height of antd's Spin indicator) or a height in px. */
  size?: 'small' | 'default' | 'large' | number;
  /** Accessible label; the spinner's own default when omitted. */
  label?: string;
}
export type SpinnerComponent = ComponentType<SpinnerProps>;

/** Components an app lends to the libraries. */
export interface VultusComponents {
  Spinner?: SpinnerComponent;
}
export const VultusComponentsContext: Context<VultusComponents>; // default {}
export function useVultusComponents(): VultusComponents;

/** Prefixes every spinner key below with `name` (scopes nest: outer/inner). */
export function SpinnerScope(props: { name: string; children?: ReactNode }): JSX.Element;
/** The scoped key for a library-local key: 'outer/inner/local', or 'local' outside any scope. */
export function useSpinnerKey(localKey: string): string;
```

- Follows core's existing pattern (type, context with a neutral default, hook). Apps without
  vultus-antd set it with `VultusComponentsContext.Provider`.
- The scope separator is `/`. Scope names and local keys are opaque strings.
- `useSpinnerKey` is called at every site; the site renders `<Spinner spinnerKey={useSpinnerKey(...)} .../>`
  when a Spinner is provided, and its unchanged antd code otherwise.
- `no-antd.test.ts` keeps passing (nothing here imports antd).

**vultus-antd** `VultusProvider` gains `components?: VultusComponents`. When given, it provides the
outer context value merged with it (`{ ...outer, ...components }`), so a nested provider can override
one slot; when not given it provides nothing new (core's default or the outer value applies), like
`linkComponent` today.

An app wires its spinner once: `<VultusProvider components={{ Spinner: DaeoSpinner }}>`. DaeoSpinner's
props are this shape already; neither side imports the other.

## Local keys

Library-local keys carry the library's namespace, so they never collide with an app's own keys:
`vultus:...` and `optio:...`. Scopes add the instance.

## Sites

All sizes are `'small'` unless noted. "Provided" means `useVultusComponents().Spinner` is set.

### vultus-antd

| # | file | today | provided |
|---|---|---|---|
| 1 | `ActionButton.tsx` (~93) | `loading={action.pending}` | `loading={pending ? { icon: <Spinner spinnerKey={k} size="small" /> } : false}`, `k = useSpinnerKey(\`vultus:action:${action.id}\`)`; the icon-end slot behaviour stays |
| 2 | `CombinedActionButton.tsx` (~182) | `loading={active.pending}` | same, with `active.id` |
| 3 | `FormSubmitButton.tsx` (~45) | `loading={action.pending}` | same, with `action.id` |
| 4 | `BoolCheckbox.tsx` (~31) | `<Spin size="small" style={{ marginInlineStart: 8 }} />` | the provided Spinner in the same place and spacing, key `vultus:field:${field.id}` |
| 5 | `BoolSwitch.tsx` (~34) | `loading={field.pending}` | no `loading` on the Switch; the Spinner right after it (key `vultus:field:${field.id}`), same spacing as BoolCheckbox |
| 6 | `OneOfSelect.tsx` (~82) | `loading={field.pending}` | `loading={field.pending}` kept; while pending, `suffixIcon={<Spinner .../>}` (antd's `loadingIcon` prop is read by `useIcons` but not stripped before the rest of the props reach `@rc-component/select`, which spreads it onto the root DOM node; `suffixIcon` is stripped, and wins over the default loading icon when defined), key `vultus:field:${field.id}` |

### optio-ui

| # | file | today | provided |
|---|---|---|---|
| 7 | `components/ProcessList.tsx` (~16) | `<List loading={loading} …>` | `loading={{ spinning: loading, indicator: … }}`, the indicator a small wrapper (`span.optio-spinner-slot-indicator`) around `<Spinner spinnerKey={useSpinnerKey('optio:process-list')} size="default" />`: antd's Spin clones its indicator and injects `className`/`style`/`percent`, which the wrapper absorbs so the lent spinner receives only `SpinnerProps` |
| 8 | `components/LaunchControls.tsx` (~87) | `icon={<LoadingOutlined spin style={iconStyle} />}` | `icon={<Spinner spinnerKey={useSpinnerKey(\`optio:process:${process._id}:resurrecting\`)} />}` |
| 9 | `components/ProcessDetailView.tsx` (~72) | `<div data-testid="optio-detail-loading">Loading…</div>` | the Spinner before the text (key `optio:process:${processId}:detail`); the text and test id stay |
| 10 | `widgets/IframeWidget.tsx` (~34) | `<div data-testid="optio-widget-loading">Loading…</div>` | the Spinner before the text (key `optio:process:${process._id}:widget`) |

### optio-conversation-ui

Each agent view (claudecode, opencode, grok, codex, cursor, kimicode, antigravity) wraps its
`ConversationView` in `<SpinnerScope name={\`optio:process:${process._id}\`}>`, which also scopes the
vultus buttons and fields inside (send bar, Interrupt, session controls).

| # | file | today | provided |
|---|---|---|---|
| 11 | `ConversationView.tsx` (~738) background task | `<Spin size="small" />` | key `optio:background:${item.taskId ?? item.callId ?? item.seq}` |
| 12 | `ConversationView.tsx` (~1546) tool row | `<Spin size="small" />` | key `optio:tool:${item.callId ?? item.seq}` |
| 13 | `ConversationView.tsx` (~1807) "working…" | `{nativeSpinner ?? <Spin size="small" />}` | the provided Spinner (key `optio:working`) wins over `nativeSpinner`; without one, unchanged |
| 14 | `ConversationView.tsx` (~2048) todo | `<Spin size="small" />` | key `optio:todo:${todo.id}` |
| 15 | `opencode/OpencodeView.tsx` (~131) | `<div data-testid="optio-widget-loading">Loading…</div>` | the Spinner before the text (key `optio:process:${process._id}:widget`) |

Not reachable: antd's internal spinners elsewhere (none other found). The Progress bars are not
spinners and stay.

## Packaging

- vultus-core: new exports above (minor bump).
- vultus-antd: `components` on VultusProvider, sites 1-6 (minor bump; depends on the new vultus-core).
- optio-ui: peer `vultus-core` at the new version (and a dev dependency, resolved through optio's
  workspace link to unitas); AGENTS.md and README updated (deps, peers); optio-dashboard's dev alias
  (`OPTIO_DEV_VULTUS` in `vite.config.ts`) and `resolve.dedupe` include vultus-core, so one copy runs.
  Minor bump.
- optio-conversation-ui: peer `vultus-antd` at the new version (it reaches vultus-core through it);
  sites 11-15 and the scopes; README's stale `vultus-antd >=0.2.0` corrected. Minor bump.
- Release order (each needs the owner's go): vultus-core, vultus-antd, optio-ui, optio-conversation-ui.
  excavator adopts it afterwards (out of scope here).
- optio-dashboard has no VultusProvider: it keeps antd's spinners.

## Tests

- vultus-core: the context default is `{}`; `useSpinnerKey` without a scope, with one, with nested
  scopes; `no-antd.test.ts` passes.
- vultus-antd: VultusProvider provides `components` merged over an outer value and nothing when not
  given; sites 1-6 render the provided component with the scoped key when provided, and today's antd
  output when not (existing tests unchanged).
- optio-ui: sites 7-10 with and without a provider (existing tests unchanged).
- optio-conversation-ui: sites 11-15 with a provider; the working indicator prefers the provided
  Spinner over `nativeSpinner`; an agent view's scope prefixes keys of its vultus buttons; existing
  tests unchanged.
- A test Spinner records the props it receives; no test depends on daeo-style.

## Gallery

vultus-gallery: a story "Providers/Spinner slot" wrapping ActionButton, BoolCheckbox, BoolSwitch and
OneOfSelect (slow actions and commits) in `<VultusProvider components={{ Spinner: DemoSpinner }}>`,
where `DemoSpinner` is a small CSS spinner in the gallery that shows its key as a tooltip, plus a
nested `SpinnerScope` to show prefixing.

## Where the work happens

In clones outside the excavator host's checkouts (`~/deai/unitas`, `~/deai/optio` are linked into the
running excavator dev stack, and edits there reach the owner's open UI). Commit conventions: unitas
`feat(vultus): …`; optio `feat(optio-ui): …` without self-credit lines (optio AGENTS.md).
