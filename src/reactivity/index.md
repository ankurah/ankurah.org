# Reactivity & Signals

Ankurah's headline behavior -- UIs that update when local commits or delivered
remote changes apply to their node -- is built on a small set of signal-aware
read surfaces.
Reading a live query, View, or signal value inside an observed scope records
a dependency. When a local or remote change applies, Ankurah notifies the
dependents whose data changed; there is no application-level polling loop or
event bus to wire up.

This page covers the model and the framework-agnostic API. For React
specifics see [React Bindings](react.md).

## Three things you can observe

**A live query's results.** `ctx.query(...)` returns a `LiveQuery<View>`.
Subscribing yields a `ChangeSet` describing exactly what happened:

<pre><code transclude="example/server/src/main.rs#livequery-subscribe">use ankurah::signals::Subscribe;
let live: LiveQuery&lt;AlbumView&gt; = ctx.query(&quot;year &gt; 2000&quot;)?;
live.wait_initialized().await;
let _guard = live.subscribe(|changes| {
    println!(&quot;Received changes: {changes}&quot;);
});</code></pre>

Each change in the set is `Initial`, `Add` (entered the result set),
`Update` (already in the set, fields changed), or `Remove` (left the set).
A `LiveQuery` is also a signal itself: reading its items inside an observed
scope subscribes that scope to future changes.

**A single entity.** Every `View` implements `Subscribe`; the listener
fires on any field change to that entity:

```rust,ignore
let _guard = album.subscribe(|view: AlbumView| {
    // any field of this entity changed
});
```

**A single field is not a public read-side signal yet.** Transaction-bound
mutable field wrappers expose backend signal machinery, but their broadcasts
belong to the transaction fork and are not a reliable observer of committed
state. To react to application data, observe the whole read-side `View` or a
`LiveQuery` instead.

## Subscribe vs. observe

There are two consumption styles, and framework integrations use the second:

- **Subscribe** -- explicit: `thing.subscribe(listener)` returns a guard.
  You get the new value pushed to your callback.
- **Observe (tracking)** -- implicit: run code inside an observer scope,
  and every signal it *reads* becomes a dependency. On any change, the
  scope re-runs (or re-renders). This is how the React and Leptos integrations
  work, and why component code contains no subscription bookkeeping at all
  -- reading `livequery.items` inside an observed component is the
  subscription.

## Rules that matter

1. **Keep the guard.** `subscribe()` returns a guard; dropping it
   unsubscribes. Assign it to a binding that lives as long as you want
   notifications (`let _guard = ...` -- not `let _ = ...`, which drops
   immediately).
2. **Account for live-query initialization.** A listener attached before a
   `LiveQuery` initializes can receive its initial `ChangeSet`. The example
   above awaits `wait_initialized()` first, so its callback sees only later
   changes. Other already-initialized signals run listeners on changes, not
   merely because you subscribed. Observer-style consumers naturally render
   the current value first and then re-render on later changes.
3. **One notification per commit.** A transaction touching several fields
   of an entity produces a single notification per subscriber, after the
   commit applies -- not one per field write.
4. **Delivery is synchronous.** Listeners run inline when the change
   applies, on whatever thread applied it. Keep listeners cheap; hand off
   heavy work.

## Signals for your own state

The same primitives that power entity reactivity are exported for
application state, so derived values can mix Ankurah data with local state
in one dependency graph:

| Type | Semantics |
|------|-----------|
| `Mut<T>` | Read/write cell; `set()` notifies dependents |
| `Read<T>` | Read-only handle sharing a `Mut`'s cell |
| `Map` | Transforms an upstream signal on every read (no cache) |
| `Memo` | Like `Map`, but caches until the upstream changes |
| `Calculated<T>` | Runs a closure, auto-tracks every signal it reads, recomputes on change |

## Framework wiring

**React** -- the `@ankurah/react-hooks` package exports a factory:

```ts
import React from "react";
import { createAnkurahReactHooks } from "@ankurah/react-hooks";
import { ReactObserver } from "your-wasm-bindings";

const { signalObserver } = createAnkurahReactHooks({ React, ReactObserver });
```

Wrap components in `signalObserver(...)`; it brackets the render's tracking
lifecycle, and any signal read during that render -- a `LiveQuery`'s items, a
`View`'s fields -- subscribes the component via React's `useSyncExternalStore`.
There is deliberately **no `use_query` hook**: queries are plain
`LiveQuery` objects you create and read; observation is the only
React-specific part. Full usage: [React Bindings](react.md).

The factory only wires observation. Your application must initialize its
WASM module and Ankurah client before rendering code that calls `ctx()`; the
[React setup](react.md#setup) shows the maintained template's startup order.

**Leptos** -- support is built into `ankurah-signals` via the
`reactive-graph` feature (enabled by default): install the bridge once at
startup,

```rust,ignore
// Install the ReactiveGraphObserver at the base of the Ankurah observer stack
// so that Leptos components can observe Ankurah signals via reactive_graph.
use ankurah_signals::{CurrentObserver, ReactiveGraphObserver};

CurrentObserver::set(ReactiveGraphObserver::new());
```

then read Ankurah signals (`livequery.get()`, view fields) inside Leptos
closures like any other reactive value -- dependencies register with
Leptos's reactive graph automatically. The
[Leptos template](https://github.com/ankurah/leptos-template)
shows the wiring end to end. The bridge works, but remains the younger,
experimental frontend path; expect rough edges and use the maintained React
path when you need the more established integration.

## How it connects underneath

Per node, a **reactor** matches every applied entity change against active
query subscriptions, updates each query's result set, and emits the
`ChangeSet`s described above; entity and field broadcasts fire from the
same applied-change notification path. The machinery -- and the ordering guarantees behind
"one notification per commit" -- is contributor territory: see
[Entity Lifecycle](../internals/entity-lifecycle.md) and
[Conflict Resolution & Guarantees](../concurrency/guarantees.md).
