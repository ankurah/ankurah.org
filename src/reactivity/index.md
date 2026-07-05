# Reactivity & Signals

Ankurah's headline behavior -- UIs that update the moment data changes,
anywhere in the system -- is built on one small idea: **everything readable
is a signal**. Reading a value inside an observed scope records a
dependency; committing a change notifies exactly the dependents whose data
actually changed. There is no polling loop and no event bus to wire up:
notification delivery is synchronous, driven by the commit itself.

This page covers the model and the framework-agnostic API. For React
specifics see [React Bindings](react.md).

## Three things you can observe

**A live query's results.** `ctx.query(...)` returns a `LiveQuery<View>`.
Subscribing yields a `ChangeSet` describing exactly what happened:

```rust,ignore
let livequery = client.query::<AlbumView>("name = 'Origin of Symmetry'")?;
use ankurah::signals::Subscribe;
let _guard = livequery.subscribe(|changes| {
    println!("Received changes: {}", changes);
});
```

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

**A single field.** Field-level signals exist on the *mutable* side: inside
a transaction, `album.name()` returns the field's active type (`LWW<T>`,
`YrsString<_>`), which implements `Subscribe` and notifies only when that
property actually changes. Note the current limitation: per-field
subscription from a read-side `View` is **not supported yet** -- observe
the whole `View` (or a query) instead. Field signals only fire for fields
whose values actually changed in a commit.

## Subscribe vs. observe

There are two consumption styles, and frameworks use the second:

- **Subscribe** -- explicit: `thing.subscribe(listener)` returns a guard.
  You get the new value pushed to your callback.
- **Observe (tracking)** -- implicit: run code inside an observer scope,
  and every signal it *reads* becomes a dependency. On any change, the
  scope re-runs (or re-renders). This is how the React and Leptos bindings
  work, and why component code contains no subscription bookkeeping at all
  -- reading `livequery.items` inside an observed component is the
  subscription.

## Rules that matter

1. **Keep the guard.** `subscribe()` returns a guard; dropping it
   unsubscribes. Assign it to a binding that lives as long as you want
   notifications (`let _guard = ...` -- not `let _ = ...`, which drops
   immediately).
2. **No initial fire.** Listeners run on *changes*, not on subscription.
   Read the current value first, then subscribe (observer-style consumers
   get this for free: the first render reads, later changes re-render).
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
const { useObserve, signalObserver } = createAnkurahReactHooks({ React, ReactObserver });
```

Wrap components in `signalObserver(...)` (or call `useObserve()` inside
them); any signal read during render -- a `LiveQuery`'s items, a `View`'s
fields -- subscribes the component, via React's `useSyncExternalStore`.
There is deliberately **no `use_query` hook**: queries are plain
`LiveQuery` objects you create and read; observation is the only
React-specific part. Full usage: [React Bindings](react.md).

**Leptos** -- support is built into `ankurah-signals` via the
`reactive-graph` feature (enabled by default): install the bridge once at
startup,

```rust,ignore
// Install the ReactiveGraphObserver at the base of the Ankurah observer stack
// so that Leptos components can observe Ankurah signals via reactive_graph.
CurrentObserver::set(ReactiveGraphObserver::new());
```

then read Ankurah signals (`livequery.get()`, view fields) inside Leptos
closures like any other reactive value -- dependencies register with
Leptos's reactive graph automatically. The
[Leptos template](https://github.com/ankurah/ankurah-leptos-sled-template)
is a working end-to-end example.

## How it connects underneath

Per node, a **reactor** matches every committed change against active
query subscriptions, updates each query's result set, and emits the
`ChangeSet`s described above; entity and field broadcasts fire from the
same commit path. The machinery -- and the ordering guarantees behind
"one notification per commit" -- is contributor territory: see
[Entity Lifecycle](../internals/entity-lifecycle.md) and
[Conflict Resolution & Guarantees](../concurrency/guarantees.md).
