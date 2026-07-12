# Choosing a Merge Strategy (LWW vs Yrs)

Every replicated field in a model has a **merge strategy**: the rule that
decides what happens when two nodes change that field concurrently. Picking
one is a modeling decision you make per field, at definition time, and it is
worth a moment of thought -- "one writer wins" and "CRDT updates combine" are
very different user experiences. Fields marked `#[model(ephemeral)]` are not
replicated and do not use a property backend.

Under the hood each strategy is a **property backend**: the component that
owns a property's operation format and implements its merge policy. This
page covers the two shipped backends and how to choose between them; the
[engine-facing contract](../internals/property-backends.md) and the
[full resolution algorithm](../internals/lww-merge.md) live in the
contributor Internals section.

## The active backends

| Backend | Name on the wire | Data model | Concurrency policy |
|---------|------------------|------------|--------------------|
| **Yrs** | `"yrs"` | Collaborative text (`String`) backed by a CRDT document | Concurrent CRDT updates apply deterministically; inserts can interleave |
| **LWW** | `"lww"` | Scalar register per property | One winner per property; causally newest wins, deterministic tiebreak |

Model fields choose their backend at definition time. String fields default
to Yrs text; a field can opt into LWW explicitly:

```rust,ignore
use ankurah::Model;
use serde::{Deserialize, Serialize};

#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Record {
    #[active_type(LWW)]
    pub title: String,     // one winner under concurrency
    pub notes: String,     // Yrs text: concurrent edits interleave
}
```

## How operations travel

When a transaction commits, each backend is asked for the operations
performed since the last drain (`to_operations`). Whatever it returns is an
opaque byte diff from everyone else's perspective. The event stores these
per backend name:

```text
Event {
    collection, entity_id, parent,
    operations: {
        "lww": [ ...opaque diffs... ],
        "yrs": [ ...opaque diffs... ],
    },
}
```

`collection` travels with the event but is deliberately excluded from the
`EventId`; the hash covers `entity_id`, `operations`, and `parent`.

On the receiving side, the backend name routes each diff back to the right
backend. Backends also serialize a **state buffer** (their full current
state) for snapshots; `from_state_buffer` reconstitutes a backend without
replaying history.

## The trait, in terms of responsibilities

`PropertyBackend` (in `core/src/property/backend/mod.rs`) asks each backend
to be able to:

- **Report itself**: `property_backend_name()`, `properties()`,
  `property_values()`.
- **Round-trip state**: `to_state_buffer` / `from_state_buffer`.
- **Emit changes**: `to_operations`, draining writes made through the model
  API since the last drain.
- **Apply changes**: `apply_operations` (no provenance) and
  `apply_operations_with_event` (with the writing event's id). CRDTs ignore
  the event id; LWW records it as provenance per property.
- **Resolve concurrency**: `apply_layer`, the only method with no default.
  It receives an `EventLayer` and must implement the backend's merge policy.

The iterator emits topological sweep generations, earliest first. Same-layer
events in the divergent region are concurrent, but the sweep can also emit
accumulated events below the meet as inert `already_applied` context. Such a
context event can be causally related to a divergent event in the same layer.
Backends therefore must use `layer.compare`, not layer membership or iteration
order, to determine causality:

- `already_applied` events are context: their effects are in your state;
- `to_apply` events are new: fold them in according to your policy;
- the layer carries the accumulated DAG, so you can compare any two event ids
  (`layer.compare`) and test whether an id was part of the explored graph at
  all (`layer.dag_contains`).

Entities feed layers to every backend that appears in the merge, and if an
event introduces a backend the entity has never seen, the new backend is
created and replayed with all earlier layers first, so late-appearing
backends do not miss context.

## Yrs: concurrency handled by the data type

The Yrs backend wraps a `yrs` CRDT document. Its operations are encoded
document updates; its state buffer is the whole document encoded as one
update.

Its `apply_layer` is almost trivial, and that is the point:

```text
for each to_apply event:
    apply its updates to the document
```

CRDT updates are commutative and idempotent, so order within the layer does
not matter and `already_applied` context is unnecessary. Concurrent insert
runs survive and whole-field `replace` calls may visibly interleave their
insertions. The result converges, but convergence is not the same as preserving
each author's higher-level intent. Choose Yrs when collaborative text semantics
fit the product, not as a promise of universally lossless editing.

## LWW: one winner per property, chosen causally

The LWW backend keeps, per property, the current value **plus the id of the
event that wrote it**. That provenance is what makes principled resolution
possible later.

`apply_layer` runs a per-property tournament:

1. **Seed with the stored value.** The current value and its writing event
   enter as the incumbent candidate. If the stored provenance id is absent
   from the accumulated DAG, the implementation marks the incumbent
   `older_than_meet`; a candidate for that property in the current layer
   replaces it, after which normal causal/tiebreak comparisons apply.
   This is a conservative engine fallback, not proof that every event in the
   layer causally descends the incumbent.
2. **Consider every event in the layer** (both `already_applied` for context
   and `to_apply`), extracting each property write as a candidate.
3. **Pairwise resolution** between the current winner and each candidate:
   - if one causally descends the other, the newer one wins;
   - if they are truly concurrent, the higher event id wins. The id is a
     content hash, so this tiebreak is arbitrary but stable: every node picks
     the same winner with no coordination.
4. **Mutate only for `to_apply` winners.** If the tournament is won by
   something already reflected in state, there is nothing to write. Wins
   that do mutate also fire that property's change signals.

Worth internalizing: resolution is **per property**. One event may win
`title` while a concurrent event wins `artist`. LWW merges at property
granularity, not event granularity.

### The provenance invariant

The stored per-property event id is not decorative. The system maintains the
invariant that a stored entry is already the LWW winner among all events in
the head's ancestry that touch that property, because heads only advance
after an event's operations are applied. Resolution therefore never needs to
re-litigate history behind the stored entry; the incumbent faithfully
represents everything below it. This invariant is pinned by tests, including
an artificial construction demonstrating what would break without it.

## Extending the built-in backend set

This is currently a contributor workflow inside the Ankurah repository, not a
stable external plugin API. The event-DAG layer interfaces needed by a backend
are crate-private, `backend_from_string` is hardcoded, and the derive registry
loads only the built-in Yrs and LWW definitions. A future public registry would
need to expose those seams first.

Within the core repository, a new backend is viable if it can honestly
implement the contract:

1. Operations must round-trip: whatever `to_operations` emits,
   `apply_operations` must reproduce on another node.
2. State buffers must round-trip losslessly, including whatever provenance
   the backend needs for future resolution.
3. `apply_layer` must be deterministic given the same layer and prior state,
   and must not infer causality from layer membership or iteration order; use
   `layer.compare`.
4. Resolution may only depend on the graph (via `layer.compare` /
   `layer.dag_contains`) and event contents, never on wall clocks or arrival
   order. That is the property that makes every node converge.

Register the backend name in `backend_from_string` and extend the derive
registry/configuration. The surrounding event pipeline is designed to remain
unchanged, but external backend registration is unfinished in 0.9.
