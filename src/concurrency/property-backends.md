# Property Backends

Everything so far decided *which* events apply and in *what order*. Property
backends decide what those events mean for actual data. Each entity property
belongs to exactly one backend, each backend owns its own operation format,
and the layer machinery guarantees backends a simple world: you will receive
groups of events; within a group, all events are mutually concurrent; groups
arrive parents-first.

## The active backends

| Backend | Name on the wire | Data model | Concurrency policy |
|---------|------------------|------------|--------------------|
| **Yrs** | `"yrs"` | Collaborative text and rich structures (a CRDT document) | All concurrent edits merge; the CRDT interleaves them |
| **LWW** | `"lww"` | Scalar register per property | One winner per property; causally newest wins, deterministic tiebreak |

Model fields choose their backend at definition time. String fields default
to Yrs text; a field can opt into LWW explicitly:

```rust
#[derive(Model, Debug, Serialize, Deserialize)]
pub struct Record {
    #[active_type(LWW)]
    pub title: String,     // one winner under concurrency
    pub notes: String,     // Yrs text: concurrent edits interleave
}
```

(A positive/negative counter backend exists as an experiment in the tree but
is not currently registered.)

## How operations travel

When a transaction commits, each backend is asked for the operations
performed since the last drain (`to_operations`). Whatever it returns is an
opaque byte diff from everyone else's perspective. The event stores these
per backend name:

```text
Event {
    entity_id, parent,
    operations: {
        "lww": [ ...opaque diffs... ],
        "yrs": [ ...opaque diffs... ],
    },
}
```

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

The layer contract, restated from the backend's point of view:

- every event in the layer is concurrent with every other event in it;
- `already_applied` events are context: their effects are in your state;
- `to_apply` events are new: fold them in according to your policy;
- the layer carries the accumulated DAG, so you can ask how any two event
  ids relate causally (`layer.compare`) and whether an id was part of the
  explored graph at all (`layer.dag_contains`).

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
not matter and `already_applied` context is unnecessary. Two users editing
the same text field concurrently produce a merged text containing both edits
(concurrent whole-field `replace` calls interleave both insertions, which is
visible in tests as concatenated values). The trade-off: you get automatic,
lossless merging, and you give up "one of these writes wins" semantics.

## LWW: one winner per property, chosen causally

The LWW backend keeps, per property, the current value **plus the id of the
event that wrote it**. That provenance is what makes principled resolution
possible later.

`apply_layer` runs a per-property tournament:

1. **Seed with the stored value.** The current value and its writing event
   enter as the incumbent candidate. If the incumbent's event id is not in
   the layer's accumulated DAG, it is *older than the meet*: it predates the
   region being merged, and any candidate from the layer beats it.
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

## Writing a new backend

A new backend is viable if it can honestly implement the contract:

1. Operations must round-trip: whatever `to_operations` emits,
   `apply_operations` must reproduce on another node.
2. State buffers must round-trip losslessly, including whatever provenance
   the backend needs for future resolution.
3. `apply_layer` must be deterministic given the same layer and prior state,
   and must not assume any ordering among events within a layer.
4. Resolution may only depend on the graph (via `layer.compare` /
   `layer.dag_contains`) and event contents, never on wall clocks or arrival
   order. That is the property that makes every node converge.

Register the backend name in `backend_from_string`, and it participates in
the entire pipeline described in these chapters without the pipeline
changing at all.
