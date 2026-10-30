# Unitas

A framework for building applications by declaring **intent** as a single source of truth, instead of writing code that fragments each decision across a thousand places.

The problem: turning intent into code is a lossy, one-way transform. One decision scatters into many derived sites, untrackable — so changing it later means hunting for all of them, and missing some. Unitas keeps every decision **whole**, so changing it is turn-key.

**The non-negotiable invariant: SSOT on every level.** One declarative model drives the data model, server logic, persistence, permissions, UI, validation, routing, and navigation — with no decision duplicated across layers. The model is interpreted at runtime (never code-generated, which would re-fragment on edit). The app *is* the intent; the React/AntD frontend is just one swappable face.

## Components

- **spiritus** (spirit) — the intent. Composable TypeScript DSL declaring the data model, views, and rules. Describes *what*, never *how*. Owns the one canonical rule-interpreter.
- **mens** (mind) — server-side logic engine. All mutations go through it, guarded by spiritus's rules.
- **pes** (foot) — persistence. Swappable backends (pg/mysql/mongo) via capability-negotiated abstraction. Reads served here; enforces the same rules as mens.
- **vultus** (face) — presentation engine. Renders UI/forms/navigation from intent. Pluggable backends and pluggable *looks* (presentation modes), so intent-driven UIs aren't forced to look identical.

A recurring keystone: capability compatibility between layers (intent↔engine, look↔intent, intent↔backend) is enforced as a **type/config check** — mismatches fail before the app runs.

## Status

Pre-implementation. Vision and architecture captured; prior-art and build-vs-adopt research complete (see [`research/`](research/) — verdict: **build the unifying intent + presentation layers, adopt where prior art fits**). Patterns are proven in existing personal projects ("seeds") not yet pulled in. No app code yet.

*Names are Latin and all point at unity — single-source discipline applied even to the naming layer.*

## TODO

- **vultus-window-history**: an `ArgStore` over the plain browser History API (`window.location`, `pushState` / `replaceState`), for apps that don't route through react-router. The same shape as vultus-react-router's store — batched writes, one navigation per tick, a readable query — just without a router underneath it.
- **The rest of the stellar-router port**: stellar-router's `url-arg` is vultus's argument layer, and vultus-react-router's store now keeps arguments in the path and the fragment too: path tokens, `permanent` arguments and going somewhere else, on top of react-router's routes. Still not ported: a full location manager (`stellar-router-core`), interceptors (`try...`) that can hold a navigation back and argument-driven state spaces, whose jobs react-router's routes and blockers keep for now; links and `BoundLink`, `NavRef`s, and redirects.
- **The form layer**: validation, layout as data (so a form's shape is declared rather than hand-assembled from individual fields), and labels or actions in a field list. vultus's definitions and widgets stop at a single field; a form composing several of them is what this layer will own.
