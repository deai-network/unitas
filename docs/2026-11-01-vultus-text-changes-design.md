# vultus: text changes, moved from harma-style

Date: 2026-11-01. Status: decided with the owner, being built; to main after he clears it.

## Decision (owner, 2026-11-01)

The text-changes widget (when a text switches between two related versions, what changed is lit
up) moved from harma-style into vultus: "harma-style is only for providing styles, not
functionality". Publishing it in open-source vultus is fine (owner). **Nothing is redesigned**: the
logic moves as it is, and the look arrives through vultus's existing channel for a style, the
`components` an app lends through `VultusProvider` (harma-style's `DaeoStyleProvider` already lends
`Spinner` that way). That channel is optional, so vultus has a fallback.

Survey of the source: `~/chat/vultus/2026-11-01-text-changes-survey.md`; the source of truth is
harma-style main 8e27a57 (`packages/harma-style-antd/src/textChanges/`, specs
`docs/text-changes.md` and `docs/change-highlight.md` with their plans).

## What moves where

- **The logic, to vultus-core, at the subpath `vultus-core/changes`:** `changesIn`, `readText`, the
  rehype plugin, `useTextChanges`, `ChangingText`, the `ins` components entry and the mark logic
  (which variant, keyed by the switch number, the timeline), the store, the visible-blocks rule,
  `ChangeSpeed`, and every type of the public API. With their tests. vultus-core is React and
  antd-free, as the code is. The subpath keeps `diff-match-patch` (its only runtime dependency) out of
  vultus-core's main entry. Every decision listed in the survey's "Decisions a mover must keep"
  carries over unchanged.
- **The look stays in harma-style:** `Highlight`'s change variants, their CSS, timings, colours and
  palette roles. harma-style lends them to vultus (below).
- **Names:** the DOM contract's `harma` names become `vultus` ones (`data-harma-block` to
  `data-vultus-block`, `data-harma-change-skip` to `data-vultus-change-skip`). Mechanical; an app
  that passes its own `blockAttribute` (Praeceptor: `data-block`) is unaffected.

## The lent mark

A new slot in vultus-core's `VultusComponents`, beside `Spinner`: **`ChangeMark`**, a component
drawing one mark, with its timings as a static property:

```ts
type ChangeMarkVariant = 'change' | 'change-strong' | 'change-removed' | 'change-added' | 'change-replaced';
interface ChangeMarkProps {
  variant: ChangeMarkVariant;
  timeline?: 'removals';      // on a word, while the switch is on the removals timeline
  speed?: ChangeSpeed;
  'data-change': ChangeLevel;
  children?: ReactNode;
}
type ChangeMarkComponent = ComponentType<ChangeMarkProps> & {
  durations?(element: Element | undefined, speed: ChangeSpeed): ChangeDurations;
};
```

These are exactly what harma-style's `ChangeMark` gives `Highlight` today, so harma-style's lent
mark is a thin adapter onto `Highlight`, and its timings its existing `changeDurations`. vultus keeps
choosing the variant, keying by the switch, and skipping the wrapper for a replacement off the
removals timeline. The timings travel with the mark because they belong to the look (its CSS);
`useTextChanges` asks the lent mark's `durations`, else uses vultus's defaults.

`VultusProvider` merges the new slot as it merges `Spinner`.

## The fallback, without a lent mark

- **Static marks**, inline styles, no stylesheet, no animation: `change` and `change-strong` and
  `change-added` a translucent green background; `change-removed` a translucent red background with a
  line-through; `change-replaced` drawn as its new letters. Fixed colours, translucent so they read on
  light and dark backgrounds (the owner: red/green independent of the theme is fine). Removed letters
  keep `aria-hidden`, `inert` and `user-select: none`.
- **Default timings**: harma-style's normal ones (plain 1.55 s, removals 2.3 s, at every speed), so
  a switch still ends and the marks go.

## Order

1. vultus: build (this spec), review, merge, release.
2. harma-style: `DaeoStyleProvider` lends `ChangeMark` (an adapter onto `Highlight`, with its
   `changeDurations` as `durations`); harma-style drops its copy of the logic (`/changes` and the
   bridge's re-export) in a breaking release; its look stays. harma-style-antd still never depends
   on vultus: the adapter lives in the bridge, `harma-style-for-vultus`.
3. Praeceptor imports from `vultus-core/changes`. Its look does not change: it already wraps its
   app in `DaeoStyleProvider`.

## Testing

The moved tests run in vultus-core against a test mark lent through `VultusComponentsContext`
(where they asserted `Highlight`'s output, they assert the props the lent mark receives), plus tests
of the fallback (no slot: static marks, default timings) and of the slot's merge in `VultusProvider`.
The packaging test (the main entry does not load `diff-match-patch`) moves too. A gallery story shows
the fallback and a lent demo mark.
